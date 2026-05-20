using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using NetBricks;

namespace Catalog;

[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    [HttpGet]
    public async Task<UiSettings> GetSettings(
        [FromServices] IConfigFactory<IConfig> configFactory,
        CancellationToken cancellationToken)
    {
        var config = await configFactory.GetAsync(cancellationToken);
        return new UiSettings
        {
            ShowOnlyImportantMetricsByDefault = config.SHOW_ONLY_IMPORTANT_METRICS_BY_DEFAULT,
        };
    }
}
