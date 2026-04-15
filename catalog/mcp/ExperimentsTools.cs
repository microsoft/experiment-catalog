using System.Collections.Generic;
using System.ComponentModel;
using System.Threading;
using System.Threading.Tasks;
using ModelContextProtocol.Server;

namespace Catalog;

/// <summary>
/// MCP tools for experiment management operations.
/// </summary>
[McpServerToolType]
public class ExperimentsTools(IStorageService storageService, ExperimentService experimentService)
{
    private void ValidateProjectName(string? project) => McpValidationHelper.ValidateProjectName(project, storageService);
    private void ValidateExperimentName(string? experiment) => McpValidationHelper.ValidateExperimentName(experiment, storageService);

    /// <summary>
    /// Lists all experiments in a project.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of experiments.</returns>
    [McpServerTool(Name = "ListExperiments"), Description("List all experiments in a project.")]
    public async Task<IList<Experiment>> ListExperiments(
        [Description("The project name")] string project,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);

        return await storageService.GetExperimentsAsync(project, cancellationToken);
    }

    /// <summary>
    /// Gets a specific experiment by name.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The experiment details.</returns>
    [McpServerTool(Name = "GetExperiment"), Description("Get a specific experiment by name.")]
    public async Task<Experiment> GetExperiment(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);

        return await storageService.GetExperimentAsync(project, experiment, false, cancellationToken);
    }

    /// <summary>
    /// Adds a new experiment to a project.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="name">The experiment name.</param>
    /// <param name="hypothesis">The experiment hypothesis.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the experiment was added.</returns>
    [McpServerTool(Name = "AddExperiment"), Description("Add a new experiment to a project.")]
    public async Task<string> AddExperiment(
        [Description("The project name")] string project,
        [Description("The experiment name")] string name,
        [Description("The experiment hypothesis")] string hypothesis,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(name);

        var experiment = new Experiment { Name = name, Hypothesis = hypothesis };
        await storageService.AddExperimentAsync(project, experiment, cancellationToken);
        return $"Experiment '{name}' added to project '{project}'.";
    }

    /// <summary>
    /// Lists the distinct set names (permutations) for an experiment.
    /// Use this to discover available permutations, not to validate a set name before comparison.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of set names.</returns>
    [McpServerTool(Name = "ListSetsForExperiment"), Description("List the distinct set names (permutations) for an experiment. Use only when the user wants to see which permutations exist. Do not call this to validate a set name before comparison; call CompareExperiment directly instead.")]
    public async Task<IList<string>> ListSetsForExperiment(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);

        return await experimentService.ListSetsForExperimentAsync(project, experiment, cancellationToken);
    }

    /// <summary>
    /// Sets an experiment as the project baseline.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the experiment was set as baseline.</returns>
    [McpServerTool(Name = "SetExperimentAsBaseline"), Description("Set an experiment as the project baseline.")]
    public async Task<string> SetExperimentAsBaseline(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);

        await storageService.SetExperimentAsBaselineAsync(project, experiment, cancellationToken);
        return $"Experiment '{experiment}' set as baseline for project '{project}'.";
    }

    /// <summary>
    /// Sets the baseline set for an experiment.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="set">The set name to use as baseline.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the baseline set was configured.</returns>
    [McpServerTool(Name = "SetBaselineForExperiment"), Description("Set the baseline set for an experiment.")]
    public async Task<string> SetBaselineForExperiment(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        [Description("The set name to use as baseline")] string set,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);
        McpValidationHelper.ValidateRequiredName(set, "set");

        await storageService.SetBaselineForExperiment(project, experiment, set, cancellationToken);
        return $"Set '{set}' configured as baseline for experiment '{experiment}' in project '{project}'.";
    }

    /// <summary>
    /// Compares an experiment's sets (permutations) against the baseline using aggregate metrics.
    /// This is the default tool for comparing permutations to the baseline.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="includeTags">Optional comma-separated tag names to include.</param>
    /// <param name="excludeTags">Optional comma-separated tag names to exclude.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The comparison result.</returns>
    [McpServerTool(Name = "CompareExperiment"), Description("Compare an experiment's sets (permutations) against the baseline using aggregate metrics. This is the default tool for any question about how a permutation or set compared to the baseline. Returns aggregate metrics, project baseline, experiment baseline, and statistics.")]
    public async Task<Comparison> CompareExperiment(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        [Description("Optional comma-separated tag names to include")] string includeTags = "",
        [Description("Optional comma-separated tag names to exclude")] string excludeTags = "",
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);

        return await experimentService.CompareAsync(project, experiment, includeTags, excludeTags, cancellationToken);
    }

    /// <summary>
    /// Breaks down a comparison per ref (ground truth), showing which individual ground truths improved or regressed.
    /// Only use when the user specifically asks about individual ground truth performance.
    /// For aggregate comparison of a permutation to the baseline, use <see cref="CompareExperiment"/> instead.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="set">The set name to compare.</param>
    /// <param name="includeTags">Optional comma-separated tag names to include.</param>
    /// <param name="excludeTags">Optional comma-separated tag names to exclude.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The per-ref comparison result with baseline and set metrics for each ground truth.</returns>
    [McpServerTool(Name = "CompareByRef"), Description("Break down a comparison per ref (ground truth) to identify which individual ground truths improved or regressed. Only use when the user asks about individual ground truth performance. For comparing a permutation to the baseline, use CompareExperiment instead.")]
    public async Task<ComparisonByRef> CompareByRef(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        [Description("The set name to compare")] string set,
        [Description("Optional comma-separated tag names to include")] string includeTags = "",
        [Description("Optional comma-separated tag names to exclude")] string excludeTags = "",
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);
        McpValidationHelper.ValidateRequiredName(set, "set");

        return await experimentService.CompareByRefAsync(project, experiment, set, includeTags, excludeTags, cancellationToken);
    }

    /// <summary>
    /// Gets per-result details for a named set in an experiment.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="experiment">The experiment name.</param>
    /// <param name="set">The set name.</param>
    /// <param name="includeTags">Optional comma-separated tag names to include.</param>
    /// <param name="excludeTags">Optional comma-separated tag names to exclude.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The individual results for the named set.</returns>
    [McpServerTool(Name = "GetNamedSet"), Description("Get per-result details for a named set in an experiment.")]
    public async Task<IEnumerable<Result>> GetNamedSet(
        [Description("The project name")] string project,
        [Description("The experiment name")] string experiment,
        [Description("The set name")] string set,
        [Description("Optional comma-separated tag names to include")] string includeTags = "",
        [Description("Optional comma-separated tag names to exclude")] string excludeTags = "",
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);
        McpValidationHelper.ValidateRequiredName(set, "set");

        return await experimentService.GetNamedSetAsync(project, experiment, set, includeTags, excludeTags, cancellationToken);
    }
}
