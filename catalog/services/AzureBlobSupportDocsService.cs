using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Extensions.Logging;
using NetBricks;
using Newtonsoft.Json;

namespace Catalog;

public class AzureBlobSupportDocsService(
    IConfigFactory<IConfig> configFactory,
    DefaultAzureCredential defaultAzureCredential,
    ConcurrencyService concurrencyService,
    ILogger<AzureBlobStorageService> logger) : ISupportDocsService
{
    private BlobServiceClient? blobServiceClient;

    private async Task<BlobServiceClient> GetBlobServiceClientAsync(CancellationToken cancellationToken = default)
    {
        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // create the blob service client using connection string if it doesn't exist
        if (this.blobServiceClient is null && !string.IsNullOrEmpty(config.AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS))
        {
            this.blobServiceClient = new BlobServiceClient(config.AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS);
        }

        // create the blob service client using account name if it doesn't exist
        if (this.blobServiceClient is null && !string.IsNullOrEmpty(config.AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS))
        {
            string blobServiceUri = $"https://{config.AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS}.blob.core.windows.net";
            this.blobServiceClient = new BlobServiceClient(new Uri(blobServiceUri), defaultAzureCredential);
        }

        // throw if no connection string or account name was provided
        if (this.blobServiceClient is null)
        {
            throw new Exception("no connection string or account name was provided.");
        }

        return this.blobServiceClient;
    }

    private async Task<BlobServiceClient> ConnectAsync(CancellationToken cancellationToken = default)
    {
        var connectLock = await concurrencyService.GetConnectLock(cancellationToken);
        try
        {
            await connectLock.WaitAsync(cancellationToken);
            var client = await GetBlobServiceClientAsync();
            return client;
        }
        finally
        {
            connectLock.Release();
        }
    }

    public async Task<byte[]> GetSupportingDocumentAsync(string url, CancellationToken cancellationToken = default)
    {
        var client = await this.ConnectAsync(cancellationToken);

        // verify the URL is for the correct storage account
        if (!url.StartsWith($"https://{client.AccountName}.blob.core.windows.net/", StringComparison.OrdinalIgnoreCase))
        {
            throw new HttpException(400, $"the URL does not point to the storage account used for the supporting documents (https://{client.AccountName}.blob.core.windows.net/).");
        }

        // extract container name and blob name from the URI path
        var blobUri = new Uri(url);
        var pathSegments = blobUri.AbsolutePath.TrimStart('/').Split('/', 2);
        if (pathSegments.Length < 2)
        {
            throw new HttpException(400, "the URL does not contain a valid container and blob path.");
        }

        // validate and log the attempt
        var containerName = pathSegments[0];
        if (!AzureBlobStorageService.TryValidateAzureContainerName(containerName, out var containerError))
        {
            throw new HttpException(400, containerError!);
        }
        var blobName = pathSegments[1];
        if (!AzureBlobStorageService.TryValidateAzureBlobName(blobName, out var blobError))
        {
            throw new HttpException(400, blobError!);
        }
        logger.LogDebug("attempting to download blob {b} from container {c}...", blobName, containerName);

        // download the blob
        var containerClient = client.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobName);
        var response = await blobClient.DownloadAsync(cancellationToken: cancellationToken);
        using var memoryStream = new MemoryStream();
        await response.Value.Content.CopyToAsync(memoryStream);
        var result = memoryStream.ToArray();
        logger.LogDebug("successfully downloaded blob {b} from container {c}.", blobName, containerName);
        return result;
    }
}