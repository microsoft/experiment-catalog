using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Catalog;

[ApiController]
[Route("api/projects/{projectName}/experiments")]
public class ExperimentsController : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IList<Experiment>>> List(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName))
        {
            return BadRequest("a project name is required.");
        }

        var experiments = await storageService.GetExperimentsAsync(projectName, cancellationToken);
        return Ok(experiments);
    }

    [HttpGet("{experimentName}")]
    public async Task<ActionResult<Experiment>> Get(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName))
        {
            return BadRequest("a project name and experiment name are required.");
        }

        var experiment = await storageService.GetExperimentAsync(projectName, experimentName, false, cancellationToken);
        return Ok(experiment);
    }

    [HttpGet("{experimentName}/sets")]
    public async Task<ActionResult<IList<string>>> ListSetsForExperiment(
        [FromServices] ExperimentService experimentService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName))
        {
            return BadRequest("a project name and experiment name are required.");
        }

        var sets = await experimentService.ListSetsForExperimentAsync(projectName, experimentName, cancellationToken);
        return Ok(sets);
    }

    [HttpPost]
    public async Task<IActionResult> Add(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromBody] Experiment experiment,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName) || experiment is null)
        {
            return BadRequest("a project name and experiment (as body) are required.");
        }

        if (string.IsNullOrEmpty(experiment.Name) || string.IsNullOrEmpty(experiment.Hypothesis))
        {
            return BadRequest("an experiment name and hypothesis are required.");
        }

        await storageService.AddExperimentAsync(projectName, experiment, cancellationToken);
        return Ok();
    }

    [HttpPatch("{experimentName}/baseline")]
    public async Task<IActionResult> SetExperimentAsBaseline(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName))
        {
            return BadRequest("a project name and experiment name are required.");
        }

        await storageService.SetExperimentAsBaselineAsync(projectName, experimentName, cancellationToken);
        return Ok();
    }

    [HttpPatch("{experimentName}/sets/{setName}/baseline")]
    public async Task<IActionResult> SetBaselineForExperiment(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromRoute, Required, ValidName] string setName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName) || string.IsNullOrEmpty(setName))
        {
            return BadRequest("a project name, experiment name, and set name are required.");
        }

        await storageService.SetBaselineForExperiment(projectName, experimentName, setName, cancellationToken);
        return Ok();
    }

    /// <summary>
    /// Compares an experiment's sets (permutations) against the baseline using aggregate metrics.
    /// This is the default endpoint for comparing permutations to the baseline.
    /// </summary>
    [HttpGet("{experimentName}/compare")]
    public async Task<ActionResult<Comparison>> Compare(
        [FromServices] ExperimentService experimentService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        CancellationToken cancellationToken,
        [FromQuery(Name = "sets")] string sets = "",
        [FromQuery(Name = "include-tags")] string includeTagsStr = "",
        [FromQuery(Name = "exclude-tags")] string excludeTagsStr = "")
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName))
        {
            return BadRequest("a project name and experiment name are required.");
        }

        var comparison = await experimentService.CompareAsync(projectName, experimentName, includeTagsStr, excludeTagsStr, cancellationToken);
        return Ok(comparison);
    }

    /// <summary>
    /// Breaks down a comparison per ref (ground truth), showing which individual ground truths
    /// improved or regressed. Only use when investigating individual ground truth performance.
    /// For aggregate comparison of a permutation to the baseline, use the Compare endpoint instead.
    /// </summary>
    [HttpGet("{experimentName}/sets/{setName}/compare-by-ref")]
    public async Task<ActionResult<ComparisonByRef>> CompareByRef(
        [FromServices] ExperimentService experimentService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromRoute, Required, ValidName] string setName,
        CancellationToken cancellationToken,
        [FromQuery(Name = "include-tags")] string includeTagsStr = "",
        [FromQuery(Name = "exclude-tags")] string excludeTagsStr = "")
    {
        if (string.IsNullOrEmpty(projectName) || string.IsNullOrEmpty(experimentName) || string.IsNullOrEmpty(setName))
        {
            return BadRequest("a project name, experiment name, and set name are required.");
        }

        var comparison = await experimentService.CompareByRefAsync(projectName, experimentName, setName, includeTagsStr, excludeTagsStr, cancellationToken);
        return Ok(comparison);
    }

    [HttpGet("{experimentName}/sets/{setName}")]
    public async Task<ActionResult<Comparison>> GetNamedSet(
        [FromServices] ExperimentService experimentService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromRoute, Required, ValidName] string setName,
        CancellationToken cancellationToken,
        [FromQuery(Name = "include-tags")] string includeTagsStr = "",
        [FromQuery(Name = "exclude-tags")] string excludeTagsStr = "")
    {
        var results = await experimentService.GetNamedSetAsync(projectName, experimentName, setName, includeTagsStr, excludeTagsStr, cancellationToken);
        return Ok(results);
    }

    [HttpPut("{experimentName}/optimize")]
    public async Task<IActionResult> Optimize(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        CancellationToken cancellationToken)
    {
        await storageService.OptimizeExperimentAsync(projectName, experimentName, cancellationToken);
        return Ok();
    }
}
