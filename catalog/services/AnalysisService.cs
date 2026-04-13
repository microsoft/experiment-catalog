using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Catalog;

/// <summary>
/// Provides analysis operations for experiments and metrics.
/// </summary>
public class AnalysisService(IStorageService storageService)
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

        var baseline = request.CompareTo == MeaningfulTagsComparisonMode.Baseline
            ? await storageService.GetProjectBaselineAsync(request.Project, cancellationToken)
            : null;

        var listOfTags = await storageService.ListTagsAsync(request.Project, cancellationToken);
        var includeTags = await storageService.GetTagsAsync(request.Project, listOfTags, cancellationToken);
        var excludeTags = request.ExcludeTags is not null
            ? await storageService.GetTagsAsync(request.Project, request.ExcludeTags, cancellationToken)
            : null;

        var compareToDefault = 0.0M;
        if (request.CompareTo == MeaningfulTagsComparisonMode.Average)
        {
            var results = experiment.Filter(null, excludeTags);
            var experimentResult = experiment.AggregateSet(request.Set, results);
            Metric? experimentMetric = null;
            experimentResult?.Metrics?.TryGetValue(request.Metric, out experimentMetric);
            compareToDefault = experimentMetric?.Value ?? 0.0M;
        }

        foreach (var tag in includeTags)
        {
            var experimentResults = experiment.Filter([tag], excludeTags);
            var experimentResult = experiment.AggregateSet(request.Set, experimentResults);
            Metric? experimentTagMetric = null;
            experimentResult?.Metrics?.TryGetValue(request.Metric, out experimentTagMetric);

            decimal? compareTo = compareToDefault;
            if (baseline is not null)
            {
                var baselineResults = baseline.Filter([tag], excludeTags);
                var baselineResult = baseline.AggregateSet(baseline.BaselineSet ?? baseline.LastSet, baselineResults);
                Metric? baselineTagMetric = null;
                baselineResult?.Metrics?.TryGetValue(request.Metric, out baselineTagMetric);
                compareTo = baselineTagMetric?.Value;
            }

            if (experimentTagMetric?.Value is not null && compareTo is not null)
            {
                var diff = (decimal)(experimentTagMetric.Value - compareTo);
                diffs.Add(new TagDiff
                {
                    Tag = tag.Name,
                    Diff = diff,
                    Impact = diff * (experimentTagMetric.Count ?? 0),
                    Count = experimentTagMetric.Count,
                });
            }
        }

        return new MeaningfulTagsResponse { Tags = diffs.OrderBy(x => x.Impact) };
    }
}
