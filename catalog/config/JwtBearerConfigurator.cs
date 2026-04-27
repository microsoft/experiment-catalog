using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NetBricks;

namespace Catalog;

public class JwtBearerConfigurator(IConfigFactory<IConfig> configFactory)
    : IConfigureNamedOptions<JwtBearerOptions>
{
    public void Configure(string? name, JwtBearerOptions options)
    {
        if (name != JwtBearerDefaults.AuthenticationScheme)
        {
            return;
        }
        Configure(options);
    }

    public void Configure(JwtBearerOptions options)
    {
        var config = configFactory.GetAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
        if (!config.IsAuthenticationEnabled)
        {
            return;
        }

        // disable default claim type mapping so JWT claims keep their original names
        options.MapInboundClaims = false;

        // configure token validation parameters
        options.Authority = config.OIDC_AUTHORITY;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = config.OIDC_ISSUERS?.Length > 0,
            ValidateAudience = config.OIDC_AUDIENCES?.Length > 0,
            ValidateLifetime = config.OIDC_VALIDATE_LIFETIME,
            ValidateIssuerSigningKey = true,
            ValidAlgorithms = new[] { "RS256", "RS384", "RS512" },
            ClockSkew = TimeSpan.FromMinutes(config.OIDC_CLOCK_SKEW_IN_MINUTES)
        };

        // set valid issuers if configured, otherwise derive from authority
        if (config.OIDC_ISSUERS?.Length > 0)
        {
            options.TokenValidationParameters.ValidIssuers = config.OIDC_ISSUERS;
        }

        // set valid audience if configured
        if (config.OIDC_AUDIENCES?.Length > 0)
        {
            options.TokenValidationParameters.ValidAudiences = config.OIDC_AUDIENCES;
        }

        // set claim type mappings
        if (!string.IsNullOrEmpty(config.OIDC_NAME_CLAIM_TYPE))
        {
            options.TokenValidationParameters.NameClaimType = config.OIDC_NAME_CLAIM_TYPE;
        }
        if (!string.IsNullOrEmpty(config.OIDC_ROLE_CLAIM_TYPE))
        {
            options.TokenValidationParameters.RoleClaimType = config.OIDC_ROLE_CLAIM_TYPE;
        }

        // configure events for token retrieval from header or cookie
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // if token is already set (e.g., from Authorization header), use it
                if (!string.IsNullOrEmpty(context.Token))
                {
                    return Task.CompletedTask;
                }

                // try to get token from configured cookie
                if (!string.IsNullOrEmpty(config.OIDC_VALIDATE_COOKIE)
                    && context.Request.Cookies.TryGetValue(config.OIDC_VALIDATE_COOKIE, out var cookieToken)
                    && !string.IsNullOrEmpty(cookieToken))
                {
                    context.Token = cookieToken!;
                    return Task.CompletedTask;
                }

                // try to get token from configured header
                if (!string.IsNullOrEmpty(config.OIDC_VALIDATE_HEADER)
                    && context.Request.Headers.TryGetValue(config.OIDC_VALIDATE_HEADER, out var headerToken)
                    && !string.IsNullOrEmpty(headerToken))
                {
                    context.Token = headerToken!;
                    return Task.CompletedTask;
                }

                return Task.CompletedTask;
            }
        };
    }
}