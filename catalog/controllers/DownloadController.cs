using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using NetBricks;

namespace Catalog;

[ApiController]
[Route("api/download")]
public class DownloadController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Download(
        [FromServices] IConfigFactory<IConfig> configFactory,
        [FromServices] ISupportDocsService supportDocsService,
        [FromQuery] string url,
        CancellationToken cancellationToken)
    {
        var config = await configFactory.GetAsync(cancellationToken);
        if (!config.ENABLE_DOWNLOAD)
        {
            return StatusCode(503, "Download is disabled.");
        }

        if (url is null)
        {
            return BadRequest("A URL is required.");
        }

        var result = await supportDocsService.GetSupportingDocumentAsync(url);
        var fileName = url.Substring(url.LastIndexOf('/') + 1);
        var contentType = GetContentType(fileName);
        Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";
        return File(result, contentType);
    }

    private static string GetContentType(string fileName)
    {
        var extension = Path.GetExtension(fileName)?.ToLowerInvariant();
        return extension switch
        {
            ".pdf" => "application/pdf",
            ".txt" => "text/plain",
            ".html" => "text/html",
            ".htm" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".mp4" => "video/mp4",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            _ => "application/octet-stream"
        };
    }
}
