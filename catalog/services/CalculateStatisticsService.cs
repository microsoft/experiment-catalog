using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NetBricks;

namespace Catalog;

/// <summary>
/// Background service that calculates p-values for experiment metrics using permutation tests.
/// P-values help determine statistical significance when comparing experiment results against baselines.
/// </summary>
public class CalculateStatisticsService(
    IConfigFactory<IConfig> configFactory,
    IStorageService storageService,
    ILogger<CalculateStatisticsService> logger
) : BackgroundService
{
    private readonly ConcurrentQueue<CalculateStatisticsRequest> requestQueue = new();

    /// <summary>
    /// Enqueues a request for p-value calculation to be processed by the background service.
    /// </summary>
    /// <param name="request">The request containing project, experiment, and set information.</param>
    public void Enqueue(CalculateStatisticsRequest request)
    {
        requestQueue.Enqueue(request);
        logger.LogInformation(
            "enqueued p-value calculation request for '{Project}/{Experiment}'.",
            request.Project, request.Experiment);
    }

    /// <summary>
    /// Calculates statistics for all applicable metrics by comparing an experiment set against a baseline set.
    /// Uses a permutation test (two-tailed) to determine statistical significance.
    /// </summary>
    /// <param name="baseline">The baseline experiment containing reference results.</param>
    /// <param name="baselineSet">The specific set within the baseline experiment to compare against.</param>
    /// <param name="experiment">The experiment being evaluated.</param>
    /// <param name="experimentSet">The specific set within the experiment to evaluate.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A Statistics object containing statistics for each metric, or null if calculation fails.</returns>
    public async Task<Statistics?> CalculateAsync(
        Experiment baseline,
        string? baselineSet,
        Experiment experiment,
        string? experimentSet,
        CancellationToken cancellationToken = default)
    {
        // validate that both sets have results
        var baselineResultCount = baseline.Results?.Count(x => x.Set == baselineSet);
        var setResultCount = experiment.Results?.Count(x => x.Set == experimentSet);
        if (baselineResultCount is null || setResultCount is null)
        {
            logger.LogWarning(
                "cannot calculate p-values: missing results for baseline set '{BaselineSet}' or experiment set '{ExperimentSet}'.",
                baselineSet, experimentSet);
            return null;
        }

        // validate that metric definitions exist
        if (experiment.MetricDefinitions is null || experiment.MetricDefinitions.Count == 0)
        {
            logger.LogWarning(
                "cannot calculate p-values: experiment '{Experiment}' has no metric definitions.",
                experiment.Name);
            return null;
        }

        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // initialize the p-values result object
        var statistics = new Statistics
        {
            BaselineExperiment = baseline.Name,
            BaselineSet = baselineSet,
            Set = experimentSet,
            BaselineResultCount = baselineResultCount ?? 0,
            SetResultCount = setResultCount ?? 0,
            NumSamples = config.CALC_PVALUES_USING_X_SAMPLES,
            ConfidenceLevel = config.CONFIDENCE_LEVEL,
            Metrics = new Dictionary<string, Metric>(),
        };

        // aggregate results by reference for both baseline and experiment sets
        var baselineResult = baseline.AggregateSetByRef(baselineSet);
        var experimentResult = experiment.AggregateSetByRef(experimentSet);
        if (baselineResult is null || experimentResult is null)
        {
            logger.LogWarning(
                "cannot calculate statistics: failed to aggregate results for baseline set '{BaselineSet}' or experiment set '{ExperimentSet}'.",
                baselineSet, experimentSet);
            return null;
        }

        // identify metrics eligible for p-value calculation (must use Average aggregation and not be tagged 'no-p')
        var eligibleMetrics = GetEligibleMetrics(experimentResult, experiment.MetricDefinitions);

        // calculate p-values and confidence intervals for each eligible metric
        foreach (var metric in eligibleMetrics)
        {
            var metricStats = await CalculateMetricStatisticsAsync(
                metric,
                baselineResult,
                experimentResult,
                cancellationToken);
            if (metricStats is not null)
            {
                statistics.Metrics.Add(metric, metricStats);
            }
        }

        logger.LogDebug(
            "calculated statistics for {MetricCount} metrics comparing '{Experiment}/{Set}' against baseline '{BaselineExperiment}/{BaselineSet}'.",
            statistics.Metrics.Count, experiment.Name, experimentSet, baseline.Name, baselineSet);

        return statistics;
    }

    /// <summary>
    /// Identifies metrics that are eligible for p-value calculation.
    /// A metric is eligible if it uses the Average aggregate function and is not tagged with 'no-p'.
    /// </summary>
    private IEnumerable<string> GetEligibleMetrics(
        IDictionary<string, Result> experimentResult,
        IDictionary<string, MetricDefinition> metricDefinitions)
    {
        return experimentResult.Values
            .Where(x => x.Metrics is not null)
            .SelectMany(x => x.Metrics!.Keys)
            .Distinct()
            .Where(metricName =>
            {
                metricDefinitions.TryGetValue(metricName, out var definition);

                // exclude metrics tagged with 'no-p'
                if (definition?.Tags?.Contains("no-p") == true)
                    return false;

                // only include metrics that use Average aggregation
                return definition?.AggregateFunction == AggregateFunctions.Average;
            });
    }

    /// <summary>
    /// Calculates confidence interval and p-value for a single metric.
    /// </summary>
    /// <returns>A Metric object with p-value and confidence interval, or null if calculation fails.</returns>
    private async Task<Metric?> CalculateMetricStatisticsAsync(
        string metric,
        IDictionary<string, Result> baselineResult,
        IDictionary<string, Result> experimentResult,
        CancellationToken cancellationToken)
    {
        // collect paired observations (values that exist in both baseline and experiment)
        var (baselineValues, experimentValues) = await CollectPairedObservationsAsync(
            metric,
            baselineResult,
            experimentResult,
            cancellationToken);

        // check for paired observations
        if (baselineValues.Count == 0)
        {
            logger.LogWarning("no valid paired observations found for metric '{Metric}'.", metric);
            return null;
        }

        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // only calculate statistics if there are enough paired observations
        if (baselineValues.Count < config.MIN_ITERATIONS_TO_CALC_PVALUES)
        {
            logger.LogWarning(
                "metric '{Metric}' has only {Count} paired observations; statistics may be unreliable (recommend >= {Min}); skipping.",
                metric, baselineValues.Count, config.MIN_ITERATIONS_TO_CALC_PVALUES);
            return null;
        }

        // calculate paired differences (experiment - baseline for each pair)
        var pairedDifferences = baselineValues
            .Zip(experimentValues, (b, e) => e - b)
            .ToList();

        // calculate p-value using permutation test
        var pvalue = await CalculatePValueAsync(pairedDifferences, cancellationToken);

        // calculate confidence interval using bootstrap
        var (ciLower, ciUpper) = await CalculateConfidenceIntervalAsync(pairedDifferences, cancellationToken);

        return new Metric
        {
            PValue = Math.Round(pvalue, config.PRECISION_FOR_CALC_VALUES),
            CILower = Math.Round(ciLower, config.PRECISION_FOR_CALC_VALUES),
            CIUpper = Math.Round(ciUpper, config.PRECISION_FOR_CALC_VALUES)
        };
    }

    /// <summary>
    /// Calculates the p-value using a paired permutation test (sign-flipping).
    /// This test respects the paired structure of the data by randomly flipping the sign of each
    /// paired difference to generate the null distribution.
    /// </summary>
    /// <returns>The calculated p-value.</returns>
    private async Task<decimal> CalculatePValueAsync(
        List<decimal> pairedDifferences,
        CancellationToken cancellationToken)
    {
        // generate the null distribution using paired permutation test (sign-flipping)
        var nullDistribution = await GenerateNullDistributionPairedAsync(
            pairedDifferences,
            cancellationToken);

        // calculate the observed mean difference
        var observedMeanDifference = pairedDifferences.Average();

        // calculate two-tailed p-value: proportion of permuted differences as extreme as observed
        // using (count + 1) / (n + 1) to ensure p-value is never exactly 0 and is more conservative
        var extremeCount = nullDistribution.Count(diff => Math.Abs(diff) >= Math.Abs(observedMeanDifference));
        var config = await configFactory.GetAsync(cancellationToken);
        return (decimal)(extremeCount + 1) / (config.CALC_PVALUES_USING_X_SAMPLES + 1);
    }

    /// <summary>
    /// Calculates the confidence interval for the mean difference using bootstrap resampling.
    /// Uses the percentile method to determine the lower and upper bounds.
    /// </summary>
    /// <returns>A tuple containing the lower and upper confidence interval bounds.</returns>
    private async Task<(decimal ciLower, decimal ciUpper)> CalculateConfidenceIntervalAsync(
        List<decimal> pairedDifferences,
        CancellationToken cancellationToken)
    {
        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        var bootstrapMeans = new List<decimal>(config.CALC_PVALUES_USING_X_SAMPLES);
        var n = pairedDifferences.Count;

        // generate bootstrap samples and calculate mean for each
        for (var i = 0; i < config.CALC_PVALUES_USING_X_SAMPLES; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            // resample with replacement
            decimal sum = 0;
            for (var j = 0; j < n; j++)
            {
                var idx = Random.Shared.Next(n);
                sum += pairedDifferences[idx];
            }
            bootstrapMeans.Add(sum / n);
        }

        // sort bootstrap means to find percentiles
        bootstrapMeans.Sort();

        // calculate percentile indices for the confidence interval
        // e.g., for 95% CI: lower = 2.5th percentile, upper = 97.5th percentile
        var alpha = 1m - config.CONFIDENCE_LEVEL;
        var lowerIndex = (int)Math.Floor((double)(alpha / 2) * config.CALC_PVALUES_USING_X_SAMPLES);
        var upperIndex = (int)Math.Ceiling((double)(1 - alpha / 2) * config.CALC_PVALUES_USING_X_SAMPLES) - 1;

        // clamp indices to valid range
        lowerIndex = Math.Max(0, Math.Min(lowerIndex, config.CALC_PVALUES_USING_X_SAMPLES - 1));
        upperIndex = Math.Max(0, Math.Min(upperIndex, config.CALC_PVALUES_USING_X_SAMPLES - 1));

        return (bootstrapMeans[lowerIndex], bootstrapMeans[upperIndex]);
    }

    /// <summary>
    /// Collects paired observations for a metric from baseline and experiment results.
    /// Only includes references that exist in both result sets with valid metric values.
    /// </summary>
    private Task<(List<decimal> baselineValues, List<decimal> experimentValues)> CollectPairedObservationsAsync(
        string metric,
        IDictionary<string, Result> baselineResult,
        IDictionary<string, Result> experimentResult,
        CancellationToken cancellationToken)
    {
        var baselineValues = new List<decimal>();
        var experimentValues = new List<decimal>();

        foreach (var reference in experimentResult.Keys)
        {
            cancellationToken.ThrowIfCancellationRequested();

            // skip references not present in baseline
            if (!baselineResult.ContainsKey(reference))
                continue;

            // try to get the metric value from baseline
            Metric? baselineMetric = null;
            baselineResult[reference].Metrics?.TryGetValue(metric, out baselineMetric);
            if (baselineMetric?.Value is null)
                continue;

            // try to get the metric value from experiment
            Metric? experimentMetric = null;
            experimentResult[reference].Metrics?.TryGetValue(metric, out experimentMetric);
            if (experimentMetric?.Value is null)
                continue;

            baselineValues.Add((decimal)baselineMetric.Value);
            experimentValues.Add((decimal)experimentMetric.Value);
        }

        return Task.FromResult((baselineValues, experimentValues));
    }

    /// <summary>
    /// Generates a null distribution for a paired permutation test using sign-flipping.
    /// For each permutation, randomly flips the sign of each paired difference (simulating
    /// the null hypothesis that there's no systematic difference between conditions).
    /// </summary>
    private async Task<List<decimal>> GenerateNullDistributionPairedAsync(
        List<decimal> pairedDifferences,
        CancellationToken cancellationToken)
    {
        var config = await configFactory.GetAsync(cancellationToken);
        var nullDistribution = new List<decimal>(config.CALC_PVALUES_USING_X_SAMPLES);
        var permutedDifferences = new decimal[pairedDifferences.Count];

        for (var i = 0; i < config.CALC_PVALUES_USING_X_SAMPLES; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            // randomly flip the sign of each paired difference
            for (var j = 0; j < pairedDifferences.Count; j++)
            {
                // 50% chance to flip the sign (multiply by -1 or +1)
                var sign = Random.Shared.Next(2) == 0 ? -1 : 1;
                permutedDifferences[j] = pairedDifferences[j] * sign;
            }

            // record the mean difference for this permutation
            nullDistribution.Add(permutedDifferences.Average());
        }

        return nullDistribution;
    }

    /// <summary>
    /// Represents a group of experiments within a project that need p-value calculation.
    /// </summary>
    private record ProjectGroup
    {
        public required string Name { get; set; }
        public Experiment? Baseline { get; set; }
        public IList<Experiment> Experiments { get; set; } = new List<Experiment>();
    }

    /// <summary>
    /// Retrieves all recent experiments grouped by project that are candidates for p-value calculation.
    /// An experiment is considered a candidate if it was recently modified but has been idle long enough.
    /// </summary>
    private async Task<IList<ProjectGroup>> GetRecentExperimentsByProjectAsync(CancellationToken cancellationToken = default)
    {
        logger.LogInformation("searching for recent experiments that need p-value calculation...");
        var projectGroups = new List<ProjectGroup>();

        // retrieve all projects
        logger.LogDebug("fetching list of projects from storage...");
        var projects = await storageService.GetProjectsAsync(cancellationToken);
        logger.LogInformation("found {ProjectCount} projects to examine.", projects.Count);

        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        foreach (var project in projects)
        {
            // skip test projects (they don't need p-value calculation)
            if (config.TEST_PROJECTS is not null && config.TEST_PROJECTS.Contains(project.Name))
            {
                logger.LogDebug("skipping test project '{Project}'.", project.Name);
                continue;
            }

            // retrieve the baseline experiment for this project
            var baseline = await storageService.GetProjectBaselineAsync(project.Name, cancellationToken);

            // check each experiment in the project for eligibility
            var experiments = await storageService.GetExperimentsAsync(project.Name, cancellationToken);
            foreach (var experiment in experiments)
            {
                var isEligible = await IsExperimentEligibleForPValueCalculationAsync(experiment, cancellationToken);
                if (!isEligible) continue;

                // add to or create the project group
                var projectGroup = projectGroups.FirstOrDefault(x => x.Name == project.Name);
                if (projectGroup is null)
                {
                    projectGroup = new ProjectGroup
                    {
                        Name = project.Name,
                        Baseline = baseline,
                    };
                    projectGroups.Add(projectGroup);
                }

                logger.LogDebug("found eligible experiment '{Project}/{Experiment}'.", projectGroup.Name, experiment.Name);
                projectGroup.Experiments.Add(experiment);
            }
        }

        logger.LogInformation(
            "found {ExperimentCount} recent experiments across {ProjectCount} projects.",
            projectGroups.Sum(x => x.Experiments.Count),
            projectGroups.Count);

        return projectGroups;
    }

    /// <summary>
    /// Determines if an experiment is eligible for p-value calculation.
    /// An experiment must be recently modified but idle for a minimum period.
    /// </summary>
    private async Task<bool> IsExperimentEligibleForPValueCalculationAsync(Experiment experiment, CancellationToken cancellationToken = default)
    {
        // must have a modification timestamp
        if (!experiment.Modified.HasValue)
            return false;

        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // must have been modified recently (within the configured window)
        var recentThreshold = DateTime.UtcNow.AddMinutes(-config.MINUTES_TO_BE_RECENT);
        if (experiment.Modified.Value < recentThreshold)
            return false;

        // must have been idle for the minimum required period (no active changes)
        var minutesSinceLastModified = (DateTimeOffset.UtcNow - experiment.Modified.Value).TotalMinutes;
        if (minutesSinceLastModified < config.MINUTES_TO_BE_IDLE)
            return false;

        return true;
    }

    /// <summary>
    /// Processes a single queued p-value calculation request.
    /// </summary>
    private async Task ProcessQueuedRequestAsync(CalculateStatisticsRequest request, CancellationToken cancellationToken)
    {
        // load the experiment with results
        var experiment = await storageService.GetExperimentAsync(
            request.Project,
            request.Experiment,
            cancellationToken: cancellationToken);

        // load and attach metric definitions
        experiment.MetricDefinitions = (await storageService.GetMetricsAsync(request.Project, cancellationToken))
            .ToDictionary(x => x.Name);

        // determine the baseline
        var baseline = string.Equals(experiment.Baseline, ":project", StringComparison.OrdinalIgnoreCase)
            ? await storageService.GetProjectBaselineAsync(request.Project, cancellationToken)
            : experiment;
        baseline.MetricDefinitions = experiment.MetricDefinitions;
        var baselineSet = baseline.BaselineSet ?? baseline.LastSet;
        var baselineResultCount = baseline.Results?.Count(x => x.Set == baselineSet);

        // process each set in the experiment
        foreach (var set in experiment.Sets)
        {
            await ProcessSetAsync(
                request.Project,
                experiment,
                set,
                baseline,
                baselineSet,
                baselineResultCount,
                cancellationToken);
        }
    }

    /// <summary>
    /// Processes all projects, calculating missing p-values for recent experiments.
    /// </summary>
    private async Task ProcessAllProjectsAsync(CancellationToken cancellationToken)
    {
        var projectGroups = await GetRecentExperimentsByProjectAsync(cancellationToken);
        foreach (var projectGroup in projectGroups)
        {
            await ProcessProjectGroupAsync(projectGroup, cancellationToken);
        }
    }

    /// <summary>
    /// Processes a single project group, calculating p-values for all eligible experiments.
    /// </summary>
    private async Task ProcessProjectGroupAsync(ProjectGroup projectGroup, CancellationToken cancellationToken)
    {
        logger.LogInformation("processing project '{Project}' for missing p-values...", projectGroup.Name);

        // validate project has required baseline and experiments
        if (projectGroup.Baseline is null || projectGroup.Experiments.Count == 0)
        {
            logger.LogWarning(
                "skipping project '{Project}': missing baseline or no experiments to process.",
                projectGroup.Name);
            return;
        }

        // load metric definitions for the project (shared across all experiments)
        var metricDefinitions = (await storageService.GetMetricsAsync(projectGroup.Name, cancellationToken))
            .ToDictionary(x => x.Name);

        // process each recent experiment
        foreach (var recentExperiment in projectGroup.Experiments)
        {
            await ProcessExperimentAsync(projectGroup, recentExperiment, metricDefinitions, cancellationToken);
        }

        logger.LogInformation("completed processing project '{Project}'.", projectGroup.Name);
    }

    /// <summary>
    /// Processes a single experiment, calculating p-values for each set that needs them.
    /// </summary>
    private async Task ProcessExperimentAsync(
        ProjectGroup projectGroup,
        Experiment recentExperiment,
        Dictionary<string, MetricDefinition> metricDefinitions,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "processing experiment '{Project}/{Experiment}' for missing p-values...",
            projectGroup.Name, recentExperiment.Name);

        // attach metric definitions to the project baseline
        projectGroup.Baseline!.MetricDefinitions = metricDefinitions;

        // load the full experiment with results and existing p-values
        var experiment = await storageService.GetExperimentAsync(
            projectGroup.Name,
            recentExperiment.Name,
            cancellationToken: cancellationToken);
        experiment.MetricDefinitions = metricDefinitions;

        // determine the baseline experiment and set for comparison
        var (baseline, baselineSet) = DetermineBaseline(projectGroup.Baseline, experiment);
        if (baseline is null)
        {
            logger.LogWarning(
                "skipping experiment '{Project}/{Experiment}': unable to determine baseline.",
                projectGroup.Name, recentExperiment.Name);
            return;
        }

        var baselineResultCount = baseline.Results?.Count(x => x.Set == baselineSet);

        // process each set in the experiment
        foreach (var set in experiment.Sets)
        {
            await ProcessSetAsync(
                projectGroup.Name,
                experiment,
                set,
                baseline,
                baselineSet,
                baselineResultCount,
                cancellationToken);
        }

        logger.LogInformation(
            "completed processing experiment '{Project}/{Experiment}'.",
            projectGroup.Name, recentExperiment.Name);
    }

    /// <summary>
    /// Determines the baseline experiment and set for comparison.
    /// If the experiment references ':project', uses the project baseline; otherwise, uses the experiment itself.
    /// </summary>
    private (Experiment? baseline, string? baselineSet) DetermineBaseline(
        Experiment projectBaseline,
        Experiment experiment)
    {
        var usesProjectBaseline = string.Equals(experiment.Baseline, ":project", StringComparison.OrdinalIgnoreCase);

        if (usesProjectBaseline)
        {
            // use the project-level baseline
            var baselineSet = projectBaseline.BaselineSet ?? projectBaseline.LastSet;
            return (projectBaseline, baselineSet);
        }
        else
        {
            // use the experiment's own baseline set
            var baselineSet = experiment.BaselineSet ?? experiment.FirstSet;
            return (experiment, baselineSet);
        }
    }

    /// <summary>
    /// Processes a single set within an experiment, calculating p-values if they don't already exist.
    /// </summary>
    private async Task ProcessSetAsync(
        string projectName,
        Experiment experiment,
        string set,
        Experiment baseline,
        string? baselineSet,
        int? baselineResultCount,
        CancellationToken cancellationToken)
    {
        // skip if this set is the baseline set (can't compare baseline to itself)
        if (baseline == experiment && set == baselineSet)
        {
            logger.LogDebug(
                "skipping set '{Project}/{Experiment}/{Set}': this is the baseline set.",
                projectName, experiment.Name, set);
            return;
        }

        // check if p-values already exist with matching parameters
        var setResultCount = experiment.Results?.Count(x => x.Set == set);
        var alreadyExists = await StatisticsAlreadyExistAsync(
            experiment, baseline.Name, baselineSet,
            set, baselineResultCount, setResultCount,
            cancellationToken);
        if (alreadyExists)
        {
            logger.LogDebug(
                "set '{Project}/{Experiment}/{Set}' already has current p-values.",
                projectName, experiment.Name, set);
            return;
        }

        // calculate p-values for this set
        logger.LogInformation(
            "calculating statistics for set '{Project}/{Experiment}/{Set}'...",
            projectName, experiment.Name, set);
        var statistics = await CalculateAsync(baseline, baselineSet, experiment, set, cancellationToken);
        if (statistics is not null)
        {
            await storageService.AddStatisticsAsync(projectName, experiment.Name, statistics, cancellationToken);
            logger.LogInformation(
                "successfully calculated and saved statistics ({count}) for set '{Project}/{Experiment}/{Set}'.",
                statistics.Metrics?.Count() ?? 0, projectName, experiment.Name, set);
        }
        else
        {
            logger.LogError(
                "failed to calculate p-values for set '{Project}/{Experiment}/{Set}'.",
                projectName, experiment.Name, set);
        }
    }

    /// <summary>
    /// Checks if valid p-values already exist for the given set with matching parameters.
    /// P-values are considered stale if the result counts, sample size, or confidence level have changed.
    /// </summary>
    private async Task<bool> StatisticsAlreadyExistAsync(
        Experiment experiment,
        string baselineName,
        string? baselineSet,
        string set,
        int? baselineResultCount,
        int? setResultCount,
        CancellationToken cancellationToken = default)
    {
        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        return experiment.Statistics?.Any(pv =>
            pv.BaselineExperiment == baselineName &&
            pv.BaselineSet == baselineSet &&
            pv.Set == set &&
            pv.BaselineResultCount == baselineResultCount &&
            pv.SetResultCount == setResultCount &&
            pv.NumSamples == config.CALC_PVALUES_USING_X_SAMPLES &&
            pv.ConfidenceLevel == config.CONFIDENCE_LEVEL) ?? false;
    }

    /// <summary>
    /// Main execution loop for the background service.
    /// Processes queued requests and periodically scans for recent experiments that need p-value calculation.
    /// </summary>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var lastPeriodicScan = DateTime.UtcNow;

        // get configuration
        var config = await configFactory.GetAsync(stoppingToken);

        // main loop
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // process a single queued request if there is one each iteration
                if (requestQueue.TryDequeue(out var request))
                {
                    await MaintenanceLock.Semaphore.WaitAsync(stoppingToken);
                    try
                    {
                        logger.LogInformation("processing queued statistical calculations for '{p}/{e}'...", request.Project, request.Experiment);
                        await ProcessQueuedRequestAsync(request, stoppingToken);
                        logger.LogInformation("completed queued statistical calculations for '{p}/{e}'.", request.Project, request.Experiment);
                    }
                    finally
                    {
                        MaintenanceLock.Semaphore.Release();
                    }
                }

                // run periodic scan if enough time has passed
                var minutesSinceLastScan = (DateTime.UtcNow - lastPeriodicScan).TotalMinutes;
                if (config.CALC_PVALUES_EVERY_X_MINUTES > 0 && minutesSinceLastScan >= config.CALC_PVALUES_EVERY_X_MINUTES)
                {
                    await MaintenanceLock.Semaphore.WaitAsync(stoppingToken);
                    try
                    {
                        logger.LogInformation("starting CalculateStatisticsService cycle...");
                        await ProcessAllProjectsAsync(stoppingToken);
                        logger.LogInformation("completed CalculateStatisticsService cycle.");
                        lastPeriodicScan = DateTime.UtcNow;
                    }
                    finally
                    {
                        MaintenanceLock.Semaphore.Release();
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                logger.LogInformation("CalculateStatisticsService is shutting down.");
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "an error occurred during CalculateStatisticsService cycle. will retry after delay.");
            }

            // short delay to check for new queued requests
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}