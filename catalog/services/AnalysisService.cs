using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Catalog;

/// <summary>
/// Provides analysis operations for experiments and metrics.
/// </summary>
public class AnalysisService(
    IStorageService storageService,
    IDerivedMetricService derivedMetricService)
{
    /// <summary>
    /// Analyzes which tags have the most meaningful impact on a specific metric.
    /// </summary>
    /// <param name="request">The meaningful tags request.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A response containing tags ordered by their impact.</returns>
    public async Task<MeaningfulTagsResponse> GetMeaningfulTagsAsync(
        MeaningfulTagsRequest request,
        CancellationToken cancellationToken = default)
    {
        var diffs = new List<TagDiff>();

        var experiment = await storageService.GetExperimentAsync(
            request.Project,
            request.Experiment,
            cancellationToken: cancellationToken);
        var metricDefinitions = (await storageService.GetMetricsAsync(
            request.Project,
            cancellationToken)).ToDictionary(definition => definition.Name);
        experiment.MetricDefinitions = metricDefinitions;

        var baseline = request.CompareTo == MeaningfulTagsComparisonMode.Baseline
            ? experiment // await storageService.GetProjectBaselineAsync(request.Project, cancellationToken)
            : null;
        if (baseline is not null) baseline.MetricDefinitions = metricDefinitions;

        var listOfTags = await storageService.ListTagsAsync(request.Project, cancellationToken);
        var includeTags = await storageService.GetTagsAsync(request.Project, listOfTags, cancellationToken);
        var excludeTags = request.ExcludeTags is not null
            ? await storageService.GetTagsAsync(request.Project, request.ExcludeTags, cancellationToken)
            : null;

        var derivedGroups = new List<DerivedMetricGroup>();
        Result? averageResult = null;
        if (request.CompareTo == MeaningfulTagsComparisonMode.Average)
        {
            var results = experiment.Filter(null, excludeTags)?.ToList() ?? [];
            averageResult = experiment.AggregateSet(request.Set, results);
            AddDerivedGroup(
                derivedGroups,
                averageResult,
                results.Where(result => result.Set == request.Set));
        }

        var aggregations = new List<TagAggregation>();
        foreach (var tag in includeTags)
        {
            var experimentResults = experiment.Filter([tag], excludeTags)?.ToList() ?? [];
            var experimentResult = experiment.AggregateSet(request.Set, experimentResults);
            AddDerivedGroup(
                derivedGroups,
                experimentResult,
                experimentResults.Where(result => result.Set == request.Set));

            Result? baselineResult = null;
            if (baseline is not null)
            {
                var baselineSet = baseline.BaselineSet ?? baseline.FirstSet;
                var baselineResults = baseline.Filter([tag], excludeTags)?.ToList() ?? [];
                baselineResult = baseline.AggregateSet(baselineSet, baselineResults);
                AddDerivedGroup(
                    derivedGroups,
                    baselineResult,
                    baselineResults.Where(result => result.Set == baselineSet));
            }
            aggregations.Add(new TagAggregation(tag, experimentResult, baselineResult));
        }

        await derivedMetricService.ApplyAsync(
            derivedGroups,
            metricDefinitions,
            cancellationToken);

        decimal compareToDefault = 0.0M;
        if (averageResult?.Metrics?.TryGetValue(request.Metric, out var averageMetric) == true)
        {
            compareToDefault = averageMetric.Value ?? 0.0M;
        }

        foreach (var aggregation in aggregations)
        {
            Metric? experimentTagMetric = null;
            aggregation.Experiment?.Metrics?.TryGetValue(request.Metric, out experimentTagMetric);

            decimal? compareTo = compareToDefault;
            if (baseline is not null)
            {
                Metric? baselineTagMetric = null;
                aggregation.Baseline?.Metrics?.TryGetValue(request.Metric, out baselineTagMetric);
                compareTo = baselineTagMetric?.Value;
            }

            if (experimentTagMetric?.Value is not null && compareTo is not null)
            {
                var diff = (decimal)(experimentTagMetric.Value - compareTo);
                diffs.Add(new TagDiff
                {
                    Tag = aggregation.Tag.Name,
                    Diff = diff,
                    Impact = diff * (experimentTagMetric.Count ?? 0),
                    Count = experimentTagMetric.Count,
                });
            }
        }

        return new MeaningfulTagsResponse { Tags = diffs.OrderBy(x => x.Impact) };
    }

    private static void AddDerivedGroup(
        ICollection<DerivedMetricGroup> groups,
        Result? target,
        IEnumerable<Result> results)
    {
        if (target is null) return;
        groups.Add(new DerivedMetricGroup(
            groups.Count.ToString(System.Globalization.CultureInfo.InvariantCulture),
            results.ToList(),
            target));
    }

    private sealed record TagAggregation(
        Tag Tag,
        Result? Experiment,
        Result? Baseline);
}
