using System;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Catalog;

[ApiController]
[Route("api/analysis")]
public class AnalysisController : ControllerBase
{
    [HttpGet("projects/{projectName}/experiments/{experimentName}/metrics")]
    public async Task<IActionResult> GetExperimentMetrics(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromQuery] string format = "json",
        CancellationToken cancellationToken = default)
    {
        return await ExportMetrics(
            storageService,
            projectName,
            experimentName,
            null,
            format,
            cancellationToken);
    }

    [HttpGet("projects/{projectName}/experiments/{experimentName}/artifacts")]
    public async Task<IActionResult> GetExperimentArtifacts(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromQuery] string types = "inference,evaluation",
        [FromQuery] string format = "json",
        CancellationToken cancellationToken = default)
    {
        return await ExportArtifacts(
            storageService,
            projectName,
            experimentName,
            null,
            types,
            format,
            cancellationToken);
    }

    [HttpGet("projects/{projectName}/experiments/{experimentName}/sets/{setName}/artifacts")]
    public async Task<IActionResult> GetSetArtifacts(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromRoute, Required, ValidName] string setName,
        [FromQuery] string types = "inference,evaluation",
        [FromQuery] string format = "json",
        CancellationToken cancellationToken = default)
    {
        return await ExportArtifacts(
            storageService,
            projectName,
            experimentName,
            setName,
            types,
            format,
            cancellationToken);
    }

    [HttpGet("projects/{projectName}/experiments/{experimentName}/sets/{setName}/metrics")]
    public async Task<IActionResult> GetSetMetrics(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromRoute, Required, ValidName] string setName,
        [FromQuery] string format = "json",
        CancellationToken cancellationToken = default)
    {
        return await ExportMetrics(
            storageService,
            projectName,
            experimentName,
            setName,
            format,
            cancellationToken);
    }

    [HttpPost("statistics")]
    public IActionResult CalculateStatistics(
        [FromServices] CalculateStatisticsService calculateStatisticsService,
        [FromBody] CalculateStatisticsRequest request)
    {
        calculateStatisticsService.Enqueue(request);
        return StatusCode(201);
    }

    [HttpPost("meaningful-tags")]
    public async Task<IActionResult> MeaningfulTags(
        [FromServices] AnalysisService analysisService,
        [FromBody] MeaningfulTagsRequest request,
        CancellationToken cancellationToken)
    {
        var response = await analysisService.GetMeaningfulTagsAsync(request, cancellationToken);
        return Ok(response);
    }

    private async Task<IActionResult> ExportMetrics(
        IStorageService storageService,
        string projectName,
        string experimentName,
        string? setName,
        string format,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(format, "json", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("format must be either 'json' or 'csv'.");
        }

        var rows = await MetricsExportService.GetRowsAsync(
            storageService,
            projectName,
            experimentName,
            setName,
            cancellationToken);

        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = MetricsExportService.ToCsv(rows);
            var setSuffix = setName is null ? string.Empty : $"-{setName}";
            return File(
                Encoding.UTF8.GetBytes(csv),
                "text/csv; charset=utf-8",
                $"{experimentName}{setSuffix}-metrics.csv");
        }

        return Ok(rows);
    }

    private async Task<IActionResult> ExportArtifacts(
        IStorageService storageService,
        string projectName,
        string experimentName,
        string? setName,
        string types,
        string format,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(format, "json", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(format, "jsonl", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("format must be either 'json' or 'jsonl'.");
        }

        var requestedTypes = types
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (requestedTypes.Count == 0 ||
            requestedTypes.Any(type => !ArtifactManifestService.SupportedTypes.Contains(type)))
        {
            return BadRequest("types must contain 'inference', 'evaluation', or both.");
        }

        var rows = await ArtifactManifestService.GetRowsAsync(
            storageService,
            projectName,
            experimentName,
            requestedTypes,
            setName,
            cancellationToken);

        if (string.Equals(format, "jsonl", StringComparison.OrdinalIgnoreCase))
        {
            var jsonLines = ArtifactManifestService.ToJsonLines(rows);
            var setSuffix = setName is null ? string.Empty : $"-{setName}";
            var typeSuffix = string.Join(
                '-',
                ArtifactManifestService.SupportedTypes.Where(requestedTypes.Contains));
            return File(
                Encoding.UTF8.GetBytes(jsonLines),
                "application/x-ndjson; charset=utf-8",
                $"{experimentName}{setSuffix}-{typeSuffix}-artifacts.jsonl");
        }

        return Ok(rows);
    }
}
