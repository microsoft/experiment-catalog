using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Catalog;

public class HttpException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public object? ResponsePayload { get; set; }
}

public class HttpWithResponseException(int statusCode, string message, object response) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public object Response { get; } = response;
}

public class HttpExceptionMiddleware(RequestDelegate next, ILogger<HttpExceptionMiddleware> logger)
{
    private readonly RequestDelegate next = next;
    private readonly ILogger<HttpExceptionMiddleware> logger = logger;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await this.next(context);
        }
        catch (HttpWithResponseException ex)
        {
            this.logger.LogWarning(ex, "HTTP exception with response...");
            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = "application/json";
            var response = JsonConvert.SerializeObject(ex.Response);
            await context.Response.WriteAsync(response);
        }
        catch (HttpException ex)
        {
            this.logger.LogWarning(ex, "HTTP exception...");
            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync(ex.Message);
        }
        catch (Exception ex)
        {
            this.logger.LogError(ex, "internal server exception...");
            context.Response.StatusCode = 500;
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("There was an error processing the request.");
        }
    }
}
