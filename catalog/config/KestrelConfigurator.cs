using System.Threading;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Options;
using NetBricks;

namespace Catalog;

public class KestrelConfigurator(IConfigFactory<IConfig> configFactory) : IConfigureOptions<KestrelServerOptions>
{
    public void Configure(KestrelServerOptions options)
    {
        var config = configFactory.GetAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
        options.ListenAnyIP(config.PORT);
    }
}