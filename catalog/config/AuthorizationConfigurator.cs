using System.Threading;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using NetBricks;

namespace Catalog;

public class AuthorizationConfigurator(IConfigFactory<IConfig> configFactory) : IConfigureOptions<AuthorizationOptions>
{
    public void Configure(AuthorizationOptions options)
    {
        var config = configFactory.GetAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
        if (config.IsAuthenticationEnabled)
        {
            var policyBuilder = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser();

            // require at least one of the acceptable roles if configured
            if (config.OIDC_ACCEPTABLE_ROLES?.Length > 0)
            {
                policyBuilder.RequireRole(config.OIDC_ACCEPTABLE_ROLES);
            }

            options.FallbackPolicy = policyBuilder.Build();
        }
    }
}