using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Catalog;

[ApiController]
[Route("api/analysis")]
public class AnalysisController : ControllerBase
{
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
}
