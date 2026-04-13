using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Catalog;

/// <summary>
/// Marker class for logging from the MCP tool exception filter.
/// </summary>
public sealed class McpToolExceptionFilter
{
    private McpToolExceptionFilter() { }

    /// <summary>
    /// Creates a filter that handles exceptions from MCP tool calls similar to HttpExceptionMiddleware.
    /// </summary>
    /// <returns>The filter function.</returns>
    public static McpRequestFilter<CallToolRequestParams, CallToolResult> Create()
    {
        return next => async (context, cancellationToken) =>
        {
            var logger = context.Services?.GetService<ILogger<McpToolExceptionFilter>>();
            var toolName = context.Params?.Name ?? "unknown";

            try
            {
                return await next(context, cancellationToken);
            }
            catch (HttpWithResponseException ex)
            {
                logger?.LogWarning(ex, "MCP tool '{ToolName}' HTTP exception with response...", toolName);
                return new CallToolResult
                {
                    IsError = true,
                    Content = [new TextContentBlock { Text = ex.Message }]
                };
            }
            catch (HttpException ex)
            {
                logger?.LogWarning(ex, "MCP tool '{ToolName}' HTTP exception...", toolName);
                return new CallToolResult
                {
                    IsError = true,
                    Content = [new TextContentBlock { Text = ex.Message }]
                };
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "MCP tool '{ToolName}' internal exception...", toolName);
                return new CallToolResult
                {
                    IsError = true,
                    Content = [new TextContentBlock { Text = "There was an error processing the request." }]
                };
            }
        };
    }
}
