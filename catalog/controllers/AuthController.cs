using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using NetBricks;

namespace Catalog;

[ApiController]
[Route("auth")]
public class AuthController() : ControllerBase
{
    private const string CodeVerifierCookieName = "oidc_code_verifier";
    private const string StateCookieName = "oidc_state";
    private const string ReturnUrlCookieName = "oidc_return_url";
    public const string TokenCookieName = "id_token";

    [AllowAnonymous]
    [HttpGet("status")]
    public async Task<AuthStatus> Status(
        [FromServices] IConfigFactory<IConfig> configFactory,
        [FromServices] IAuthenticationService authService,
        [FromServices] ILogger<AuthController> logger,
        CancellationToken cancellationToken)
    {
        // manually authenticate to populate HttpContext.User even though endpoint allows anonymous
        var authResult = await authService.AuthenticateAsync(HttpContext, JwtBearerDefaults.AuthenticationScheme);
        if (authResult.Succeeded)
        {
            HttpContext.User = authResult.Principal;
        }

        // get config to determine if authentication is required
        var config = await configFactory.GetAsync(cancellationToken);
        return new AuthStatus
        {
            IsRequired = config.IsAuthenticationEnabled,
            Username = HttpContext.User?.Identity?.Name
        };
    }

    [AllowAnonymous]
    [HttpGet("login")]
    public async Task<IActionResult> Login(
        [FromServices] IConfigFactory<IConfig> configFactory,
        [FromServices] IHttpClientFactory httpClientFactory,
        [FromQuery(Name = "return-url")] string? returnUrl,
        CancellationToken cancellationToken)
    {
        var config = await configFactory.GetAsync(cancellationToken);
        if (!config.IsAuthenticationEnabled)
        {
            return StatusCode(500, "Authentication is not enabled.");
        }
        if (string.IsNullOrEmpty(config.OIDC_CLIENT_ID))
        {
            return StatusCode(500, "OIDC Client ID is not configured.");
        }

        // generate PKCE code verifier and challenge
        var codeVerifier = GenerateCodeVerifier();
        var codeChallenge = GenerateCodeChallenge(codeVerifier);

        // generate state for CSRF protection
        var state = GenerateState();

        // store code verifier, state, and return URL in secure cookies
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            MaxAge = TimeSpan.FromMinutes(10)
        };
        Response.Cookies.Append(CodeVerifierCookieName, codeVerifier, cookieOptions);
        Response.Cookies.Append(StateCookieName, state, cookieOptions);

        // ensure return URL is local or localhost to prevent open redirect attacks
        var safeReturnUrl = IsAllowedReturnUrl(returnUrl) ? returnUrl : "/";
        Response.Cookies.Append(ReturnUrlCookieName, safeReturnUrl!, cookieOptions);

        // build scopes 
        var scopes = new List<string> { "openid", "profile", "email" };

        // discover the authorization endpoint from the OIDC authority
        var discoveryDoc = await GetDiscoveryDocumentAsync(config.OIDC_AUTHORITY!, httpClientFactory);
        var authorizationEndpoint = discoveryDoc.GetProperty("authorization_endpoint").GetString();

        // build authorization URL
        // Use X-Forwarded-Proto header if present (when behind a reverse proxy like Azure Container Apps)
        var scheme = Request.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? Request.Scheme;
        var redirectUri = $"{scheme}://{Request.Host}/auth/callback";
        var authUrl = $"{authorizationEndpoint}" +
            $"?response_type=code" +
            $"&client_id={Uri.EscapeDataString(config.OIDC_CLIENT_ID)}" +
            $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
            $"&scope={Uri.EscapeDataString(string.Join(" ", scopes))}" +
            $"&state={Uri.EscapeDataString(state)}" +
            $"&code_challenge={Uri.EscapeDataString(codeChallenge)}" +
            $"&code_challenge_method=S256";

        return Redirect(authUrl);
    }

    [AllowAnonymous]
    [HttpGet("callback")]
    public async Task<IActionResult> Callback(
        [FromServices] IConfigFactory<IConfig> configFactory,
        [FromServices] IHttpClientFactory httpClientFactory,
        [FromQuery] string code,
        [FromQuery] string state,
        CancellationToken cancellationToken)
    {
        var config = await configFactory.GetAsync(cancellationToken);
        if (!config.IsAuthenticationEnabled)
        {
            return StatusCode(500, "Authentication is not enabled.");
        }
        if (string.IsNullOrEmpty(config.OIDC_CLIENT_ID))
        {
            return StatusCode(500, "OIDC Client ID is not configured.");
        }

        // validate state
        if (!Request.Cookies.TryGetValue(StateCookieName, out var savedState) || savedState != state)
        {
            return BadRequest("Invalid state parameter.");
        }

        // get code verifier
        if (!Request.Cookies.TryGetValue(CodeVerifierCookieName, out var codeVerifier))
        {
            return BadRequest("Code verifier not found.");
        }

        // get return URL
        Request.Cookies.TryGetValue(ReturnUrlCookieName, out var returnUrl);
        returnUrl ??= "/";

        // clear the temporary cookies
        Response.Cookies.Delete(CodeVerifierCookieName);
        Response.Cookies.Delete(StateCookieName);
        Response.Cookies.Delete(ReturnUrlCookieName);

        // discover the token endpoint
        var discoveryDoc = await GetDiscoveryDocumentAsync(config.OIDC_AUTHORITY!, httpClientFactory);
        var tokenEndpoint = discoveryDoc.GetProperty("token_endpoint").GetString();

        // exchange code for tokens
        // use X-Forwarded-Proto header if present (when behind a reverse proxy like Azure Container Apps)
        var scheme = Request.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? Request.Scheme;
        var redirectUri = $"{scheme}://{Request.Host}/auth/callback";
        var tokenRequest = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = config.OIDC_CLIENT_ID,
            ["code_verifier"] = codeVerifier
        };

        // add client secret if configured (some providers require it even with PKCE)
        if (!string.IsNullOrEmpty(config.OIDC_CLIENT_SECRET))
        {
            tokenRequest["client_secret"] = config.OIDC_CLIENT_SECRET;
        }

        // send token request
        var httpClient = httpClientFactory.CreateClient();
        var tokenResponse = await httpClient.PostAsync(
            tokenEndpoint,
            new FormUrlEncodedContent(tokenRequest));

        if (!tokenResponse.IsSuccessStatusCode)
        {
            var error = await tokenResponse.Content.ReadAsStringAsync();
            return BadRequest($"Token exchange failed: {error}");
        }

        // parse token response
        var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
        var tokens = JsonDocument.Parse(tokenJson);

        // get id_token (always a JWT) for authentication
        // Note: access_token from Azure AD may be opaque unless requesting a specific API scope
        if (!tokens.RootElement.TryGetProperty("id_token", out var idTokenElement))
        {
            return BadRequest("Token response did not include an id_token. Ensure 'openid' scope is requested.");
        }
        var idToken = idTokenElement.GetString();
        if (string.IsNullOrEmpty(idToken))
        {
            return BadRequest("id_token is empty.");
        }

        // set id_token as a secure HTTP-only cookie
        var tokenCookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            MaxAge = TimeSpan.FromHours(1) // if we cannot extract exp claim, default to 1 hour
        };

        // extract exp claim from id_token to set cookie expiry (minus 5 minutes buffer)
        var exp = GetExpFromJwt(idToken);
        if (exp.HasValue)
        {
            var bufferSeconds = 5 * 60; // 5 minutes
            var expirySeconds = Math.Max(0, exp.Value - DateTimeOffset.UtcNow.ToUnixTimeSeconds() - bufferSeconds);
            tokenCookieOptions.MaxAge = TimeSpan.FromSeconds(expirySeconds);
        }

        Response.Cookies.Append(TokenCookieName, idToken, tokenCookieOptions);
        return Redirect(returnUrl);
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(TokenCookieName);
        return Ok();
    }

    private async Task<JsonElement> GetDiscoveryDocumentAsync(string authority, IHttpClientFactory httpClientFactory)
    {
        var httpClient = httpClientFactory.CreateClient();
        var discoveryUrl = $"{authority.TrimEnd('/')}/.well-known/openid-configuration";
        var response = await httpClient.GetStringAsync(discoveryUrl);
        return JsonDocument.Parse(response).RootElement;
    }

    private static string GenerateCodeVerifier()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Base64UrlEncode(bytes);
    }

    private static string GenerateCodeChallenge(string codeVerifier)
    {
        using var sha256 = SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier));
        return Base64UrlEncode(bytes);
    }

    private static string GenerateState()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Base64UrlEncode(bytes);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static long? GetExpFromJwt(string jwt)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var token = handler.ReadJwtToken(jwt);
            return new DateTimeOffset(token.ValidTo).ToUnixTimeSeconds();
        }
        catch
        {
            return null;
        }
    }

    private bool IsAllowedReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrEmpty(returnUrl))
        {
            return false;
        }

        // allow local URLs (relative paths)
        if (Url.IsLocalUrl(returnUrl))
        {
            return true;
        }

        // allow localhost URLs
        if (Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri))
        {
            return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("127.0.0.1", StringComparison.Ordinal);
        }

        return false;
    }
}