using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Web;
using ParseMarkdown.Services;

var builder = WebApplication.CreateBuilder(args);

// Add Entra ID authentication if configured
var tenantId = builder.Configuration["AZURE_TENANT_ID"] ?? Environment.GetEnvironmentVariable("AZURE_TENANT_ID");
var clientId = builder.Configuration["AZURE_CLIENT_ID"] ?? Environment.GetEnvironmentVariable("AZURE_CLIENT_ID");

if (!string.IsNullOrEmpty(tenantId) && !string.IsNullOrEmpty(clientId))
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddMicrosoftIdentityWebApi(options =>
        {
            options.TokenValidationParameters.ValidateAudience = true;
            options.TokenValidationParameters.ValidAudiences = [clientId, $"api://{clientId}"];
        }, 
        identityOptions =>
        {
            identityOptions.Instance = "https://login.microsoftonline.com/";
            identityOptions.TenantId = tenantId;
            identityOptions.ClientId = clientId;
        });
    
    builder.Services.AddAuthorization();
}

// Add services
builder.Services.AddSingleton<MarkdownParser>();
builder.Services.AddHealthChecks();

var app = builder.Build();

// Health check endpoint for Container Apps
app.MapHealthChecks("/health");

// Configure authentication if enabled
var authEnabled = !string.IsNullOrEmpty(tenantId) && !string.IsNullOrEmpty(clientId);
if (authEnabled)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Map the ParseMarkdown endpoint
var endpoint = app.MapPost("/api/ParseMarkdown", async (HttpContext context, MarkdownParser parser) =>
{
    try
    {
        var request = await context.Request.ReadFromJsonAsync<SkillRequest>();
        
        if (request?.Values is null || request.Values.Count == 0)
        {
            return Results.BadRequest(new { error = "Expected 'values' array in request body" });
        }

        var response = new SkillResponse
        {
            Values = request.Values.Select(record => parser.ProcessRecord(record)).ToList()
        };

        return Results.Ok(response);
    }
    catch (System.Text.Json.JsonException ex)
    {
        return Results.BadRequest(new { error = $"Invalid JSON in request body: {ex.Message}" });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Unexpected error processing request");
        return Results.StatusCode(500);
    }
});

// Require authorization when auth is enabled
if (authEnabled)
{
    endpoint.RequireAuthorization();
}

app.Run();
