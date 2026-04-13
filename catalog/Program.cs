using System;
using System.Linq;
using System.Threading.Tasks;
using Catalog;
using dotenv.net;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using ModelContextProtocol;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.AspNetCore.Authentication;
using ModelContextProtocol.Protocol;
using NetBricks;

// load environment variables from .env file
DotEnv.Load();

// create the web application
var builder = WebApplication.CreateBuilder(args);

// add config using new NetBricks pattern
builder.Services.AddHttpClient();
builder.Services.AddDefaultAzureCredential();
builder.Services.AddConfig<IConfig, Config>();

// configure Kestrel using IConfigFactory
builder.Services.AddSingleton<IConfigureOptions<KestrelServerOptions>, KestrelConfigurator>();

// add logging
builder.Logging.ClearProviders();
builder.Services.AddSingleLineConsoleLogger();
builder.Logging.AddFilter("Microsoft.AspNetCore.Mvc.ModelBinding", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Server.Kestrel.Connections", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Server.Kestrel.Transport.Sockets", LogLevel.Warning);

// configure OpenTelemetry logging early using IConfiguration (before full config is available)
// NOTE: It is unfortunate, but there appears to be no way to add OpenTelemetry in an async
// manner such that config could pull from App Config or Key Vault at startup.
var openTelemetryConnectionString = builder.Configuration["OPEN_TELEMETRY_CONNECTION_STRING"];
if (!string.IsNullOrEmpty(openTelemetryConnectionString))
{
    builder.Logging.AddOpenTelemetry(openTelemetryConnectionString);
    builder.Services.AddOpenTelemetry("catalog", builder.Environment.ApplicationName, openTelemetryConnectionString);
}

// add services to the container
builder.Services.AddSingleton<IStorageService, AzureBlobStorageService>();
builder.Services.AddSingleton<ISupportDocsService, AzureBlobSupportDocsService>();
builder.Services.AddSingleton<CalculateStatisticsService>();
builder.Services.AddSingleton<AnalysisService>();
builder.Services.AddSingleton<ExperimentService>();
builder.Services.AddSingleton<ConcurrencyService>();
builder.Services.AddHostedService<AzureBlobStorageMaintenanceService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CalculateStatisticsService>());

// add MCP server with analysis tools
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly()
    .WithRequestFilters(filters => filters.AddCallToolFilter(McpToolExceptionFilter.Create()));

// add controllers with swagger
builder.Services.AddControllers().AddNewtonsoftJson();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token"
    });
    options.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecuritySchemeReference("Bearer", doc),
            new System.Collections.Generic.List<string>()
        }
    });
}).AddSwaggerGenNewtonsoftSupport();

// add authentication with deferred configuration
builder.Services.AddSingleton<IConfigureOptions<JwtBearerOptions>, JwtBearerConfigurator>();
builder.Services.AddSingleton<IConfigureOptions<McpAuthenticationOptions>, McpAuthenticationConfigurator>();
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = McpAuthenticationDefaults.AuthenticationScheme;
    })
    .AddJwtBearer()
    .AddMcp();
builder.Services.AddAuthorization();
builder.Services.AddSingleton<IConfigureOptions<AuthorizationOptions>, AuthorizationConfigurator>();

// add CORS services
builder.Services.AddCors(options =>
{
    options.AddPolicy("default-policy",
    corsBuilder =>
    {
        corsBuilder.WithOrigins(
                "http://localhost:6020",
                "http://localhost:6274"  // MCP Inspector
            )
               .AllowAnyHeader()
               .AllowAnyMethod()
               .AllowCredentials();
    });
});

// build with swagger
var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();

// use CORS
app.UseCors("default-policy");

// add endpoints
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseMiddleware<HttpExceptionMiddleware>();

// add authentication and authorization middleware
app.UseAuthentication();
app.UseAuthorization();

// map controllers and MCP
app.MapControllers();
app.MapMcp("/mcp");

// run
app.Run();