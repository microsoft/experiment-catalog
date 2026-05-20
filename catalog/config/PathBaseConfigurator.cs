using System;
using System.Threading;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using NetBricks;

namespace Catalog;

public class PathBaseConfigurator(IConfigFactory<IConfig> configFactory) : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return builder =>
        {
            var config = configFactory.GetAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
            if (!string.IsNullOrEmpty(config.PATH_BASE))
            {
                builder.UsePathBase(config.PATH_BASE);
            }

            next(builder);
        };
    }
}
