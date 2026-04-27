# MCP Services

This document describes the MCP capabilities for experiment comparison and analysis, and how the integration was implemented.

## Tests

The following queries have been tested:

- how many projects do I have?
- what projects do I have?
- list the projects I have
- what experiments do I have in amltest?
- list experiments under sprint-02
- what permutations of the test_aml_run experiment exist?
- how good was the 20250805220419 permuation?
- how did the 20250807071317 permutation compare to the baseline?
- what were the top 5 ground truths that saw improvement in the recall?
- create me a new project called "sprint-02"
- create me an experiment under sprint-02
- set the experiment known as "baseline" as the baseline for this project
- what tags are used in this project?
- what metrics are defined?
- what 3 tags would have the greatest impact on my recall metric?

## Implementation Guide

Follow these steps to add MCP (Model Context Protocol) support to an existing ASP.NET Core web API. This pattern exposes the same business logic through both REST endpoints and MCP tool calls.

### 1. Add the NuGet package

Add the `ModelContextProtocol.AspNetCore` package to the project file:

```xml
<PackageReference Include="ModelContextProtocol.AspNetCore" Version="0.7.0-preview.1" />
```

### 2. Extract business logic into service classes

Move logic out of controllers into dedicated service classes so both controllers and MCP tools can share the same code. Two services were created in the `services/` folder:

| Service             | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `AnalysisService`   | Tag impact analysis (meaningful tags)                            |
| `ExperimentService` | Comparison, per-ref comparison, named set retrieval, set listing |

Controllers become thin wrappers that delegate to these services. MCP tool classes do the same.

### 3. Create MCP tool classes

Create classes in a `mcp/` folder. Each class groups related tools and follows this pattern:

- Annotate the class with `[McpServerToolType]`
- Use constructor injection to receive the shared services
- Annotate each public method with `[McpServerTool(Name = "...")]` and `[Description("...")]`
- Annotate each parameter with `[Description("...")]`
- Return domain objects directly (the MCP SDK serializes them for you)

Three tool classes were created:

| Class              | Tools                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectsTools`    | ListProjects, AddProject, ListTags, GetMetricDefinitions                                                                                                              |
| `ExperimentsTools` | ListExperiments, GetExperiment, AddExperiment, ListSetsForExperiment, SetExperimentAsBaseline, SetBaselineForExperiment, CompareExperiment, CompareByRef, GetNamedSet |
| `AnalysisTools`    | CalculateStatistics, MeaningfulTags                                                                                                                                   |

### 4. Validate tool parameters explicitly

ASP.NET controllers validate parameters automatically through the model validation pipeline, which processes `DataAnnotations` attributes such as `[Required]`, `[ValidName]`, and `[ValidProjectName]`. The MCP SDK does not have an equivalent pipeline. Tool arguments arrive as raw `JsonElement` values and are deserialized into method parameters without running any `ValidationAttribute` logic. The SDK documentation confirms this: arguments "should be considered unvalidated and untrusted."

Adding `[Required, ValidName, ValidProjectName]` to MCP tool parameters has no effect because nothing invokes those attributes at runtime. Custom validators like `ValidProjectNameAttribute` also depend on `ValidationContext.GetService()` to resolve `IStorageService`, which the SDK never provides.

Instead, validate parameters explicitly at the start of each tool method using a shared helper class:

```csharp
public static class McpValidationHelper
{
    public static void ValidateRequiredName(string? value, string parameterName) { ... }
    public static void ValidateProjectName(string? value, IStorageService storageService) { ... }
    public static void ValidateExperimentName(string? value, IStorageService storageService) { ... }
    public static void ValidateOptionalNames(IEnumerable<string>? values, string parameterName) { ... }
}
```

Each tool class injects `IStorageService` and exposes thin wrapper methods:

```csharp
public class ExperimentsTools(IStorageService storageService, ExperimentService experimentService)
{
    private void ValidateProjectName(string? project) =>
        McpValidationHelper.ValidateProjectName(project, storageService);
    private void ValidateExperimentName(string? experiment) =>
        McpValidationHelper.ValidateExperimentName(experiment, storageService);

    [McpServerTool(Name = "GetExperiment"), Description("...")]
    public async Task<Experiment> GetExperiment(string project, string experiment, ...)
    {
        ValidateProjectName(project);
        ValidateExperimentName(experiment);
        return await storageService.GetExperimentAsync(project, experiment, false, cancellationToken);
    }
}
```

Validation failures throw `HttpException(400, ...)`, which the exception filter (see next step) catches and returns as an MCP error result.

### 5. Create an exception filter for MCP

MCP tool calls do not pass through ASP.NET middleware, so `HttpExceptionMiddleware` does not catch exceptions thrown during tool execution. Create an `McpToolExceptionFilter` that mirrors the same error-handling behavior:

- Catch `HttpWithResponseException`, `HttpException`, and generic `Exception`
- Return a `CallToolResult` with `IsError = true` and a text message
- Register the filter via `.AddCallToolFilter(McpToolExceptionFilter.Create())`

### 6. Register services and MCP in Program.cs

Add the following registrations:

```csharp
// register the shared services
builder.Services.AddSingleton<AnalysisService>();
builder.Services.AddSingleton<ExperimentService>();

// register the MCP server
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly()
    .AddCallToolFilter(McpToolExceptionFilter.Create());
```

`WithToolsFromAssembly()` discovers all classes annotated with `[McpServerToolType]` automatically.

### 7. Map the MCP endpoint

After `app.MapControllers()`, add:

```csharp
app.MapMcp("/mcp");
```

This exposes the MCP Streamable HTTP endpoint at `/mcp`.

### 8. Update CORS for MCP Inspector

If you use the MCP Inspector for testing, add its origin to the CORS policy:

```csharp
corsBuilder.WithOrigins(
    "http://localhost:6020",
    "http://localhost:6274"  // MCP Inspector
)
```

### 9. Handle enum serialization for MCP

The MCP SDK uses `System.Text.Json` rather than `Newtonsoft.Json`. If any tool parameters use enums, add the `System.Text.Json` converter attribute alongside any existing Newtonsoft attributes:

```csharp
[System.Text.Json.Serialization.JsonConverter(typeof(JsonStringEnumConverter))]
public enum MeaningfulTagsComparisonMode { Baseline, Zero, Average }
```

### 10. Authentication

#### Local development (auth disabled)

When running against localhost you can leave authentication off by omitting the `OIDC_AUTHORITY` environment variable. Without an authority the fallback policy is not set and the `/mcp` endpoint is open, so MCP clients connect without any token exchange.

#### Deployed service (auth enabled)

When the catalog is deployed with authentication enabled (`OIDC_AUTHORITY`, `OIDC_CLIENT_ID`, and optionally `OIDC_CLIENT_SECRET` are set), the MCP endpoint requires an OAuth 2.0 access token. The MCP SDK's authentication handler advertises the token requirements through `ProtectedResourceMetadata`, and compliant MCP clients (such as VS Code with GitHub Copilot) perform the OAuth flow automatically.

##### Code changes

Register the MCP authentication scheme alongside JWT Bearer in `Program.cs`:

```csharp
builder.Services.AddSingleton<IConfigureOptions<McpAuthenticationOptions>, McpAuthenticationConfigurator>();
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = McpAuthenticationDefaults.AuthenticationScheme;
    })
    .AddJwtBearer()
    .AddMcp();
```

Create `McpAuthenticationConfigurator` to populate the protected resource metadata from the app's OIDC settings. It advertises the authorization server and an API scope of `api://{OIDC_CLIENT_ID}/.default` so that MCP clients know where to obtain a token and which scope to request.

##### Azure AD app registration

Configure the app registration that represents the catalog API:

1. **Expose an API** — set the Application ID URI to `api://<client-id>` and add a scope (for example `api://<client-id>/all` with "Admins and users" consent). This scope is what MCP clients request when obtaining an access token.
2. **Authorized client applications** — add the VS Code client application ID and authorize it for the scope created above. This allows VS Code to acquire tokens for the API without a user consent prompt.
3. **Redirect URIs** — ensure the following are registered under the **Web** platform:
   - `https://vscode.dev/redirect` (VS Code web)
   - `http://localhost:33418` (VS Code desktop OAuth redirect)
4. **Mobile and desktop applications** — enable the MSAL redirect URI (`msal<client-id>://auth`).
5. **Allow public client flows** — set to **Yes** so VS Code can authenticate as a public client without a client secret.

##### VS Code settings

Add the following to your VS Code `settings.json` (workspace or user level) so that the Microsoft authentication extension uses the MSAL flow without a broker, which is required for the MCP OAuth handshake:

```json
{
  "microsoft-authentication.implementation": "msal-no-broker"
}
```

##### Summary

| Scenario           | OIDC_AUTHORITY | MCP auth behavior                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------------------ |
| Local development  | Not set        | MCP endpoint is open, no token needed                                                |
| Deployed with auth | Set            | MCP clients perform OAuth 2.0 automatically using the advertised scope and authority |

### 11. Create the VS Code MCP client configuration

VS Code needs a `.vscode/mcp.json` file to know where the MCP server is running. This file is excluded from the repository (via `.gitignore`) because the URL varies by environment. Create it manually:

```json
{
  "servers": {
    "experiment-catalog": {
      "type": "http",
      "url": "http://localhost:6010/mcp"
    }
  }
}
```

Replace the port with whatever the service is listening on locally. For a deployed instance, use the full URL (for example `https://my-catalog.azurewebsites.net/mcp`).

### 12. Add Copilot agent and skill files (optional)

To enable GitHub Copilot Chat to use the MCP tools via an agent:

- Create `.github/agents/ask-catalog.agent.md` with the agent definition, tool references, and tool selection guidance
- Create `.github/skills/experiment-catalog/SKILL.md` with domain context (hierarchy, terminology, workflows) so the agent can reason about the data model
