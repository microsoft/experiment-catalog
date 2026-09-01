using System;
using System.Linq;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Catalog;

[ApiController]
[Route("api/projects/{projectName}/experiments/{experimentName}/results")]
public class ResultsController : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Add(
        [FromServices] IStorageService storageService,
        [FromRoute, Required, ValidName, ValidProjectName] string projectName,
        [FromRoute, Required, ValidName, ValidExperimentName] string experimentName,
        [FromBody] AddResultRequest request,
        CancellationToken cancellationToken)
    {
        if (projectName is null || experimentName is null || request is null)
        {
            return BadRequest("a project name, experiment name, and result (as body) are required.");
        }

        if (
            (request.Annotations is null || request.Annotations.Count == 0) &&
            (request.Ref is null || request.Set is null || request.Metrics is null))
        {
            return BadRequest("ref, set, and metrics are required when there is not an annotation.");
        }

        var metrics = request.ToMetrics();
        if (metrics?.Any(metric => metric.Value.Retrieval is not null) == true)
        {
            var definitions = (await storageService.GetMetricsAsync(projectName, cancellationToken))
                .ToDictionary(definition => definition.Name, StringComparer.Ordinal);
            foreach (var metric in metrics.Where(metric => metric.Value.Retrieval is not null))
            {
                definitions.TryGetValue(metric.Key, out var definition);
                if (!SupportsRetrievalAggregation(metric.Key, definition))
                {
                    return BadRequest(
                        $"Retrieval metric '{metric.Key}' requires Precision, Recall, F1, a Micro alias, " +
                        "or MacroPrecision, MacroRecall, or MacroF1 aggregation.");
                }
            }
        }

        var result = new Result
        {
            Ref = request.Ref,
            Set = request.Set,
            GroundTruthUri = request.GroundTruthUri,
            InferenceUri = request.InferenceUri,
            EvaluationUri = request.EvaluationUri,
            Metrics = metrics,
            Annotations = request.Annotations,
        };

        await storageService.AddResultAsync(projectName, experimentName, result, cancellationToken);
        return Ok();
    }

    private static bool SupportsRetrievalAggregation(
        string metricName,
        MetricDefinition? definition)
    {
        if (definition is not null &&
            definition.AggregateFunction != AggregateFunctions.Default)
        {
            return definition.AggregateFunction is
                AggregateFunctions.Precision or
                AggregateFunctions.Recall or
                AggregateFunctions.F1 or
                AggregateFunctions.MicroPrecision or
                AggregateFunctions.MicroRecall or
                AggregateFunctions.MicroF1 or
                AggregateFunctions.MacroPrecision or
                AggregateFunctions.MacroRecall or
                AggregateFunctions.MacroF1;
        }

        return metricName.Contains("precision", StringComparison.InvariantCultureIgnoreCase) ||
            metricName.Contains("recall", StringComparison.InvariantCultureIgnoreCase) ||
            metricName.Contains("f1", StringComparison.InvariantCultureIgnoreCase);
    }
}
