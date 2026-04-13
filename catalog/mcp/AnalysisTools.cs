using System.Collections.Generic;
using System.ComponentModel;
using System.Threading;
using System.Threading.Tasks;
using ModelContextProtocol.Server;

namespace Catalog;

/// <summary>
/// MCP tools for experiment analysis operations.
/// </summary>
[McpServerToolType]
public class AnalysisTools(AnalysisService analysisService, CalculateStatisticsService calculateStatisticsService, IStorageService storageService)
{
    private void ValidateProjectName(string? project) => McpValidationHelper.ValidateProjectName(project, storageService);
    private void ValidateExperimentName(string? experiment) => McpValidationHelper.ValidateExperimentName(experiment, storageService);

    /// <summary>
    /// Enqueues a request to calculate statistics (p-values) for an experiment by comparing against the baseline.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the request was enqueued.</returns>
    [McpServerTool(Name = "CalculateStatistics"), Description("Enqueue a request to calculate statistics (p-values) for an experiment.")]
    public string CalculateStatistics(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);

        var request = new CalculateStatisticsRequest
        {
            Project = project,
            Experiment = experiment
        };

        calculateStatisticsService.Enqueue(request);
        return $"Statistics calculation enqueued for '{project}/{experiment}'";
    }

    /// <summary>
    /// Analyzes which tags have the most meaningful impact on a specific metric.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="set">The result set to analyze.</param>
    /// <param name="metric">The metric to analyze.</param>
    /// <param name="excludeTags">Optional tags to exclude from analysis.</param>
    /// <param name="compareTo">Comparison mode: Baseline, Zero, or Average.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of tags ordered by their impact on the metric.</returns>
    [McpServerTool(Name = "MeaningfulTags"), Description("Analyze which tags have the most meaningful impact on a specific metric.")]
    public async Task<MeaningfulTagsResponse> MeaningfulTags(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        [Description("The result set to analyze")] string set,
        [Description("The metric to analyze")] string metric,
        [Description("Optional tags to exclude from analysis")] IEnumerable<string>? excludeTags = null,
        [Description("Comparison mode: Baseline (compare to project baseline), Zero (compare to zero), or Average (compare to experiment average)")] MeaningfulTagsComparisonMode compareTo = MeaningfulTagsComparisonMode.Baseline,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);
        McpValidationHelper.ValidateRequiredName(set, "set");
        McpValidationHelper.ValidateRequiredName(metric, "metric");
        McpValidationHelper.ValidateOptionalNames(excludeTags, "excludeTags");

        var request = new MeaningfulTagsRequest
        {
            Project = project,
            Experiment = experiment,
            Set = set,
            Metric = metric,
            ExcludeTags = excludeTags,
            CompareTo = compareTo
        };

        return await analysisService.GetMeaningfulTagsAsync(request, cancellationToken);
    }
}
