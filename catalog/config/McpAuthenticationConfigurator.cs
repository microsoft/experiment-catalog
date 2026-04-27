using System;
using System.Threading;
using Microsoft.Extensions.Options;
using ModelContextProtocol.AspNetCore.Authentication;
using ModelContextProtocol.Authentication;
using NetBricks;

namespace Catalog;

/// <summary>
/// Configures MCP authentication options using the application's OIDC settings.
/// </summary>
/// <remarks>
/// When authentication is enabled, this sets up the
/// <see cref="ProtectedResourceMetadata"/> so that MCP clients can discover
/// the OAuth authorization server and complete the OAuth 2.0 flow.
/// </remarks>
public class McpAuthenticationConfigurator(IConfigFactory<IConfig> configFactory)
    : IConfigureNamedOptions<McpAuthenticationOptions>
{
    /// <inheritdoc/>
    public void Configure(string? name, McpAuthenticationOptions options)
    {
        if (name != McpAuthenticationDefaults.AuthenticationScheme)
        {
            return;
        }
        Configure(options);
    }

    /// <inheritdoc/>
    public void Configure(McpAuthenticationOptions options)
    {
        var config = configFactory.GetAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
        if (!config.IsAuthenticationEnabled)
        {
            return;
        }

        // the API scope ensures Azure AD issues a JWT access token whose audience
        // matches this API rather than an opaque Microsoft Graph token.
        // OIDC_CLIENT_ID is required for MCP authentication to work with Azure AD.
        options.ResourceMetadata = new ProtectedResourceMetadata
        {
            AuthorizationServers = { config.OIDC_AUTHORITY! }
        };
        if (!string.IsNullOrEmpty(config.OIDC_CLIENT_ID))
        {
            options.ResourceMetadata.ScopesSupported = [$"api://{config.OIDC_CLIENT_ID}/.default"];
        }
    }
}
