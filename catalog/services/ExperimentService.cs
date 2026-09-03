using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetBricks;

namespace Catalog;

/// <summary>
/// Provides comparison operations for experiments, including aggregate and per-ref comparisons.
/// </summary>
public class ExperimentService(
    ILogger<ExperimentService> logger,
    IStorageService storageService,
    IConfigFactory<IConfig> configFactory,
    IDerivedMetricService derivedMetricService)
{
    /// <summary>
    /// Lists the distinct set names for an experiment.
    /// </summary>
    /// <param name="projectName">The project name.</param>
    /// <param name="experimentName">The experiment name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The list of set names.</returns>
    public async Task<IList<string>> ListSetsForExperimentAsync(
        string projectName,
        string experimentName,
        CancellationToken cancellationToken = default)
    {
        var experiment = await storageService.GetExperimentAsync(projectName, experimentName, cancellationToken: cancellationToken);
        return experiment.Sets.ToList();
    }

    /// <summary>
    /// Loads include and exclude tags from comma-separated name strings.
    /// </summary>
    /// <param name="projectName">The project name.</param>
    /// <param name="includeTagsStr">Comma-separated include tag names.</param>
    /// <param name="excludeTagsStr">Comma-separated exclude tag names.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The resolved include and exclude tag lists.</returns>
    public async Task<(IList<Tag> IncludeTags, IList<Tag> ExcludeTags)> LoadTagsAsync(
        string projectName,
        string includeTagsStr,
        string excludeTagsStr,
        CancellationToken cancellationToken = default)
    {
        var includeTags = await storageService.GetTagsAsync(projectName, includeTagsStr.AsArray(() => [])!, cancellationToken);
        var excludeTags = await storageService.GetTagsAsync(projectName, excludeTagsStr.AsArray(() => [])!, cancellationToken);
        return (includeTags, excludeTags);
    }

    /// <summary>
    /// Compares an experiment's sets against its baseline, including project baseline and statistics.
    /// </summary>
    /// <param name="projectName">The project name.</param>
    /// <param name="experimentName">The experiment name.</param>
    /// <param name="includeTagsStr">Comma-separated include tag names.</param>
    /// <param name="excludeTagsStr">Comma-separated exclude tag names.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The comparison result.</returns>
    public async Task<Comparison> CompareAsync(
        string projectName,
        string experimentName,
        string includeTagsStr = "",
        string excludeTagsStr = "",
        CancellationToken cancellationToken = default)
    {
        var comparison = new Comparison();
        var derivedGroups = new List<DerivedMetricGroup>();
        IDictionary<string, Result>? projectBaselineByRef = null;
        IDictionary<string, Result>? experimentBaselineByRef = null;
        var setsByRef = new Dictionary<string, IDictionary<string, Result>>();
        var (includeTags, excludeTags) = await LoadTagsAsync(projectName, includeTagsStr, excludeTagsStr, cancellationToken);
        comparison.MetricDefinitions = (await storageService.GetMetricsAsync(projectName, cancellationToken))
            .ToDictionary(x => x.Name);

        // get the project baseline
        try
        {
            var baseline = await storageService.GetProjectBaselineAsync(projectName, cancellationToken);
            var baselineSet = baseline.BaselineSet ?? baseline.LastSet;
            var baselineFiltered = baseline.Filter(includeTags, excludeTags)?.ToList() ?? [];
            var baselineSetResults = baselineFiltered
                .Where(result => result.Set == baselineSet)
                .ToList();
            baseline.MetricDefinitions = comparison.MetricDefinitions;
            comparison.ProjectBaseline = new ComparisonEntity
            {
                Project = projectName,
                Experiment = baseline.Name,
                Set = baselineSet,
                Result = baseline.AggregateSet(baselineSet, baselineFiltered),
                Count = baseline.Results?.Count(x => x.Set == baselineSet), // unfiltered count
            };
            AddDerivedGroup(
                derivedGroups,
                comparison.ProjectBaseline.Result,
                baselineSetResults);
            projectBaselineByRef = baseline.AggregateSetByRef(baselineSet, baselineFiltered);
            AddDerivedGroupsByRef(
                derivedGroups,
                projectBaselineByRef,
                baselineSet,
                baselineSetResults);
        }
        catch (Exception e)
        {
            logger.LogWarning(e, "Failed to get baseline experiment for project {projectName}.", projectName);
        }

        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // get the experiment baseline
        var experiment = await storageService.GetExperimentAsync(projectName, experimentName, cancellationToken: cancellationToken);
        var experimentBaselineSet = experiment.BaselineSet ?? experiment.FirstSet;
        var experimentFiltered = experiment.Filter(includeTags, excludeTags)?.ToList() ?? [];
        var experimentBaselineResults = experimentFiltered
            .Where(result => result.Set == experimentBaselineSet)
            .ToList();
        experiment.MetricDefinitions = comparison.MetricDefinitions;
        comparison.ExperimentBaseline =
            string.Equals(experiment.Baseline, ":project", StringComparison.OrdinalIgnoreCase)
            ? comparison.ProjectBaseline
            : new ComparisonEntity
            {
                Project = projectName,
                Experiment = experiment.Name,
                Set = experimentBaselineSet,
                Result = experiment.AggregateSet(experimentBaselineSet, experimentFiltered),
                Count = experiment.Results?.Count(x => x.Set == experimentBaselineSet), // unfiltered count
            };
        if (!ReferenceEquals(comparison.ExperimentBaseline, comparison.ProjectBaseline))
        {
            AddDerivedGroup(
                derivedGroups,
                comparison.ExperimentBaseline?.Result,
                experimentBaselineResults);
            experimentBaselineByRef = experiment.AggregateSetByRef(
                experimentBaselineSet,
                experimentFiltered);
            AddDerivedGroupsByRef(
                derivedGroups,
                experimentBaselineByRef,
                experimentBaselineSet,
                experimentBaselineResults);
        }
        else
        {
            experimentBaselineByRef = projectBaselineByRef;
        }

        // get the sets
        comparison.Sets = experiment.AggregateAllSets(experimentFiltered)
            .Select(x =>
            {
                var setResults = experimentFiltered
                    .Where(result => result.Set == x.Set)
                    .ToList();
                // find matching statistics
                var statistics = experiment.Statistics?.LastOrDefault(y =>
                {
                    if (y.Set != x.Set) return false;
                    if (y.BaselineExperiment != comparison.ExperimentBaseline?.Experiment) return false;
                    if (y.BaselineSet != comparison.ExperimentBaseline?.Set) return false;
                    if (y.BaselineResultCount != comparison.ExperimentBaseline?.Count) return false;
                    if (y.SetResultCount != experiment.Results?.Count(z => z.Set == x.Set)) return false; // unfiltered count
                    if (y.NumSamples != config.CALC_PVALUES_USING_X_SAMPLES) return false;
                    if (y.ConfidenceLevel != config.CONFIDENCE_LEVEL) return false;
                    return true;
                });

                // fold statistics into result metrics
                if (statistics?.Metrics is not null && x.Metrics is not null)
                {
                    foreach (var (metricName, statisticsMetric) in statistics.Metrics)
                    {
                        if (x.Metrics.TryGetValue(metricName, out var resultMetric))
                        {
                            resultMetric.PValue = statisticsMetric.PValue;
                            resultMetric.CILower = statisticsMetric.CILower;
                            resultMetric.CIUpper = statisticsMetric.CIUpper;
                        }
                    }
                }

                var entity = new ComparisonEntity
                {
                    Project = projectName,
                    Experiment = experiment.Name,
                    Set = x.Set,
                    Result = x,
                };
                AddDerivedGroup(
                    derivedGroups,
                    entity.Result,
                    setResults);
                var setByRef = experiment.AggregateSetByRef(x.Set, experimentFiltered);
                if (!string.IsNullOrEmpty(x.Set) && setByRef is not null)
                {
                    setsByRef[x.Set] = setByRef;
                }
                AddDerivedGroupsByRef(
                    derivedGroups,
                    setByRef,
                    x.Set,
                    setResults);
                return entity;
            })
            .ToList();

        await derivedMetricService.ApplyAsync(
            derivedGroups,
            comparison.MetricDefinitions,
            cancellationToken);

        if (!IsSameEntity(comparison.ProjectBaseline, comparison.ExperimentBaseline))
        {
            ComparisonMetricCalculator.ApplyWinAndTieCounts(
                comparison.ProjectBaseline?.Result,
                projectBaselineByRef,
                experimentBaselineByRef,
                comparison.MetricDefinitions);
        }
        foreach (var entity in comparison.Sets)
        {
            if (entity.Set is null ||
                (entity.Experiment == comparison.ExperimentBaseline?.Experiment &&
                 entity.Set == comparison.ExperimentBaseline?.Set) ||
                !setsByRef.TryGetValue(entity.Set, out var setByRef))
            {
                continue;
            }
            ComparisonMetricCalculator.ApplyWinAndTieCounts(
                entity.Result,
                setByRef,
                experimentBaselineByRef,
                comparison.MetricDefinitions);
        }

        return comparison;
    }

    /// <summary>
    /// Compares an experiment set against its baseline on a per-ref basis.
    /// </summary>
    /// <param name="projectName">The project name.</param>
    /// <param name="experimentName">The experiment name.</param>
    /// <param name="setName">The set name to compare.</param>
    /// <param name="includeTagsStr">Comma-separated include tag names.</param>
    /// <param name="excludeTagsStr">Comma-separated exclude tag names.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The per-ref comparison result.</returns>
    public async Task<ComparisonByRef> CompareByRefAsync(
        string projectName,
        string experimentName,
        string setName,
        string includeTagsStr = "",
        string excludeTagsStr = "",
        CancellationToken cancellationToken = default)
    {
        var comparison = new ComparisonByRef();
        var derivedGroups = new List<DerivedMetricGroup>();
        var (includeTags, excludeTags) = await LoadTagsAsync(projectName, includeTagsStr, excludeTagsStr, cancellationToken);
        comparison.MetricDefinitions = (await storageService.GetMetricsAsync(projectName, cancellationToken))
            .ToDictionary(x => x.Name);

        // get the project baseline
        try
        {
            var baseline = await storageService.GetProjectBaselineAsync(projectName, cancellationToken);
            var baselineFiltered = baseline.Filter(includeTags, excludeTags)?.ToList() ?? [];
            baseline.MetricDefinitions = comparison.MetricDefinitions;
            comparison.ProjectBaseline = new ComparisonByRefEntity
            {
                Project = projectName,
                Experiment = baseline.Name,
                Set = baseline.BaselineSet ?? baseline.LastSet,
                Results = baseline.AggregateSetByRef(baseline.BaselineSet ?? baseline.LastSet, baselineFiltered),
            };
            AddDerivedGroupsByRef(
                derivedGroups,
                comparison.ProjectBaseline,
                baselineFiltered);
        }
        catch (Exception e)
        {
            logger.LogWarning(e, "Failed to get baseline experiment for project {projectName}.", projectName);
        }

        // get the experiment info
        var experiment = await storageService.GetExperimentAsync(projectName, experimentName, cancellationToken: cancellationToken);
        var experimentFiltered = experiment.Filter(includeTags, excludeTags)?.ToList() ?? [];
        experiment.MetricDefinitions = comparison.MetricDefinitions;

        // get the experiment baseline
        if (string.Equals(experiment.Baseline, ":project", StringComparison.OrdinalIgnoreCase))
        {
            comparison.ExperimentBaseline = comparison.ProjectBaseline;
        }
        else
        {
            comparison.ExperimentBaseline = new ComparisonByRefEntity
            {
                Project = projectName,
                Experiment = experiment.Name,
                Set = experiment.BaselineSet ?? experiment.FirstSet,
                Results = experiment.AggregateSetByRef(experiment.BaselineSet ?? experiment.FirstSet, experimentFiltered),
            };
            AddDerivedGroupsByRef(
                derivedGroups,
                comparison.ExperimentBaseline,
                experimentFiltered);
        }

        // get the set experiment
        comparison.ExperimentSet = new ComparisonByRefEntity
        {
            Project = projectName,
            Experiment = experiment.Name,
            Set = setName,
            Results = experiment.AggregateSetByRef(setName, experimentFiltered),
        };
        AddDerivedGroupsByRef(
            derivedGroups,
            comparison.ExperimentSet,
            experimentFiltered);

        await derivedMetricService.ApplyAsync(
            derivedGroups,
            comparison.MetricDefinitions,
            cancellationToken);

        return comparison;
    }

    /// <summary>
    /// Gets per-result details for a named set in an experiment, with optional support doc URI formatting.
    /// </summary>
    /// <param name="projectName">The project name.</param>
    /// <param name="experimentName">The experiment name.</param>
    /// <param name="setName">The set name.</param>
    /// <param name="includeTagsStr">Comma-separated include tag names.</param>
    /// <param name="excludeTagsStr">Comma-separated exclude tag names.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The individual results for the named set.</returns>
    public async Task<IEnumerable<Result>> GetNamedSetAsync(
        string projectName,
        string experimentName,
        string setName,
        string includeTagsStr = "",
        string excludeTagsStr = "",
        CancellationToken cancellationToken = default)
    {
        // init
        var metricDefinitions = (await storageService.GetMetricsAsync(projectName, cancellationToken))
            .ToDictionary(x => x.Name);

        // get the experiment and filter the results
        var experiment = await storageService.GetExperimentAsync(projectName, experimentName, cancellationToken: cancellationToken);
        var (includeTags, excludeTags) = await LoadTagsAsync(projectName, includeTagsStr, excludeTagsStr, cancellationToken);
        var experimentFiltered = experiment.Filter(includeTags, excludeTags);
        experiment.MetricDefinitions = metricDefinitions;

        // get the results
        var results = experiment.AggregateSetByEachResult(setName, experimentFiltered)
            ?? Enumerable.Empty<Result>();

        // add the support docs
        var config = await configFactory.GetAsync(cancellationToken);
        if (!string.IsNullOrEmpty(config.PATH_TEMPLATE))
        {
            foreach (var result in results)
            {
                if (!string.IsNullOrEmpty(result.GroundTruthUri)) result.GroundTruthUri = string.Format(config.PATH_TEMPLATE, result.GroundTruthUri);
                if (!string.IsNullOrEmpty(result.InferenceUri)) result.InferenceUri = string.Format(config.PATH_TEMPLATE, result.InferenceUri);
                if (!string.IsNullOrEmpty(result.EvaluationUri)) result.EvaluationUri = string.Format(config.PATH_TEMPLATE, result.EvaluationUri);
            }
        }

        return results;
    }

    private static void AddDerivedGroup(
        ICollection<DerivedMetricGroup> groups,
        Result? target,
        IEnumerable<Result> results)
    {
        if (target is null) return;
        var metricResults = results
            .Where(result => result.Metrics is { Count: > 0 })
            .ToList();
        groups.Add(new DerivedMetricGroup(
            groups.Count.ToString(System.Globalization.CultureInfo.InvariantCulture),
            metricResults,
            target));
    }

    private static bool IsSameEntity(
        ComparisonEntity? left,
        ComparisonEntity? right) =>
        left is not null &&
        right is not null &&
        left.Project == right.Project &&
        left.Experiment == right.Experiment &&
        left.Set == right.Set;

    private static void AddDerivedGroupsByRef(
        ICollection<DerivedMetricGroup> groups,
        ComparisonByRefEntity? entity,
        IReadOnlyCollection<Result> results)
    {
        if (entity?.Results is null || string.IsNullOrEmpty(entity.Set)) return;
        AddDerivedGroupsByRef(groups, entity.Results, entity.Set, results);
    }

    private static void AddDerivedGroupsByRef(
        ICollection<DerivedMetricGroup> groups,
        IDictionary<string, Result>? targets,
        string? set,
        IReadOnlyCollection<Result> results)
    {
        if (targets is null || string.IsNullOrEmpty(set)) return;
        var resultsByRef = results
            .Where(result => result.Set == set && !string.IsNullOrEmpty(result.Ref))
            .GroupBy(result => result.Ref!)
            .ToDictionary(group => group.Key, group => group.AsEnumerable());
        foreach (var (reference, target) in targets)
        {
            resultsByRef.TryGetValue(reference, out var matchingResults);
            AddDerivedGroup(
                groups,
                target,
                matchingResults ?? []);
        }
    }
}
