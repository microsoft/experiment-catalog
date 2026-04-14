using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using NetBricks;
using Newtonsoft.Json;

namespace Catalog;

public class AzureBlobStorageService(
    IConfigFactory<IConfig> configFactory,
    DefaultAzureCredential defaultAzureCredential,
    ConcurrencyService concurrencyService,
    ILogger<AzureBlobStorageService> logger) : IStorageService
{
    private BlobServiceClient? blobServiceClient;

    private async Task<BlobServiceClient> GetBlobServiceClientAsync(CancellationToken cancellationToken = default)
    {
        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // create the blob service client using connection string if it doesn't exist
        if (this.blobServiceClient is null && !string.IsNullOrEmpty(config.AZURE_STORAGE_ACCOUNT_CONNSTRING))
        {
            this.blobServiceClient = new BlobServiceClient(config.AZURE_STORAGE_ACCOUNT_CONNSTRING);
        }

        // create the blob service client using account name if it doesn't exist
        if (this.blobServiceClient is null && !string.IsNullOrEmpty(config.AZURE_STORAGE_ACCOUNT_NAME))
        {
            string blobServiceUri = $"https://{config.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net";
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
            var client = await GetBlobServiceClientAsync(cancellationToken);
            return client;
        }
        finally
        {
            connectLock.Release();
        }
    }

    private async Task<BlobContainerClient> ConnectAsync(string projectName, CancellationToken cancellationToken = default)
    {
        var connectLock = await concurrencyService.GetConnectLock(cancellationToken);
        try
        {
            await connectLock.WaitAsync(cancellationToken);

            // create the service client
            this.blobServiceClient = await GetBlobServiceClientAsync(cancellationToken);

            // create the container client
            var containerClient = this.blobServiceClient.GetBlobContainerClient(projectName);

            // ensure the container exists
            if (!await containerClient.ExistsAsync(cancellationToken))
            {
                throw new HttpException(404, "project not found.");
            }

            return containerClient;
        }
        finally
        {
            connectLock.Release();
        }
    }

    /// <summary>
    /// Validates an Azure blob container name per Azure naming rules.
    /// Rules: 3-63 chars, lowercase letters/numbers/hyphens, starts with letter or number,
    /// no consecutive hyphens, cannot end with hyphen.
    /// </summary>
    public static bool TryValidateAzureContainerName(string? containerName, out string? errorMessage)
    {
        if (string.IsNullOrEmpty(containerName))
        {
            errorMessage = "container name cannot be null or empty.";
            return false;
        }

        if (containerName.Length < 3 || containerName.Length > 63)
        {
            errorMessage = $"container name '{containerName}' must be between 3 and 63 characters.";
            return false;
        }

        if (!char.IsLetterOrDigit(containerName[0]))
        {
            errorMessage = $"container name '{containerName}' must start with a letter or number.";
            return false;
        }

        if (containerName.EndsWith('-'))
        {
            errorMessage = $"container name '{containerName}' cannot end with a hyphen.";
            return false;
        }

        for (int i = 0; i < containerName.Length; i++)
        {
            char c = containerName[i];
            if (!char.IsLower(c) && !char.IsDigit(c) && c != '-')
            {
                errorMessage = $"container name '{containerName}' contains invalid character '{c}'. Only lowercase letters, numbers, and hyphens are allowed.";
                return false;
            }

            if (c == '-' && i > 0 && containerName[i - 1] == '-')
            {
                errorMessage = $"container name '{containerName}' cannot have consecutive hyphens.";
                return false;
            }
        }

        errorMessage = null;
        return true;
    }

    /// <summary>
    /// Validates an Azure blob name per Azure naming rules.
    /// Rules: 1-1024 chars, cannot end with dot or forward slash.
    /// </summary>
    public static bool TryValidateAzureBlobName(string? blobName, out string? errorMessage)
    {
        if (string.IsNullOrEmpty(blobName))
        {
            errorMessage = "blob name cannot be null or empty.";
            return false;
        }

        if (blobName.Length > 1024)
        {
            errorMessage = $"blob name must be 1024 characters or fewer (was {blobName.Length}).";
            return false;
        }

        if (blobName.EndsWith('.') || blobName.EndsWith('/'))
        {
            errorMessage = $"blob name '{blobName}' cannot end with a dot or forward slash.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public bool TryValidProjectName(string? projectName, out string? errorMessage)
    {
        if (!TryValidateAzureContainerName(projectName, out var containerError))
        {
            errorMessage = "the project name must be a valid Azure container name; " + containerError;
            return false;
        }

        errorMessage = null;
        return true;
    }

    public bool TryValidExperimentName(string? experimentName, out string? errorMessage)
    {
        if (!TryValidateAzureBlobName(experimentName, out var blobError))
        {
            errorMessage = "the experiment name must be a valid Azure blob name; " + blobError;
            return false;
        }

        errorMessage = null;
        return true;
    }

    public async Task<IList<Project>> GetProjectsAsync(CancellationToken cancellationToken = default)
    {
        var client = await this.ConnectAsync(cancellationToken);
        var projects = new List<Project>();
        await foreach (var blobContainerItem in client.GetBlobContainersAsync(
            BlobContainerTraits.Metadata,
            cancellationToken: cancellationToken))
        {
            if (blobContainerItem.Properties.Metadata.TryGetValue("exp_catalog_type", out var type) && type == "project")
            {
                projects.Add(new Project { Name = blobContainerItem.Name });
            }
        }
        return projects;
    }

    public async Task AddProjectAsync(Project project, CancellationToken cancellationToken = default)
    {
        var client = await this.ConnectAsync(cancellationToken);
        var containerClient = client.GetBlobContainerClient(project.Name);
        await containerClient.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var metadata = new Dictionary<string, string>
        {
            { "exp_catalog_type", "project" }
        };
        await containerClient.SetMetadataAsync(metadata, cancellationToken: cancellationToken);
    }

    public async Task<IList<string>> ListTagsAsync(string projectName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var tags = new List<string>();
        await foreach (var blobItem in containerClient.GetBlobsAsync(cancellationToken: cancellationToken))
        {
            var tag = blobItem.Name;
            if (!tag.StartsWith("tag_")) continue;
            if (!tag.EndsWith(".json")) continue;
            tags.Add(tag[4..^5]);
        }
        return tags;
    }

    public async Task AddTagAsync(string projectName, Tag tag, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var blobClient = containerClient.GetBlobClient($"tag_{tag.Name}.json");
        var serializedJson = JsonConvert.SerializeObject(tag);
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(serializedJson));
        await blobClient.UploadAsync(stream, overwrite: true, cancellationToken: cancellationToken);
    }

    private static async Task<Tag> LoadTagAsync(BlobContainerClient containerClient, string tagName, CancellationToken cancellationToken = default)
    {
        var blobClient = containerClient.GetBlobClient($"tag_{tagName}.json");
        var response = await blobClient.DownloadAsync(cancellationToken: cancellationToken);
        using var memoryStream = new MemoryStream();
        await response.Value.Content.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;
        using var streamReader = new StreamReader(memoryStream);
        var serializedJson = await streamReader.ReadToEndAsync(cancellationToken);
        var tag = JsonConvert.DeserializeObject<Tag>(serializedJson)
            ?? throw new Exception("the tag contents were not valid.");
        return tag;
    }

    public async Task<IList<Tag>> GetTagsAsync(string projectName, IEnumerable<string> tags, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var concurrencyLock = await concurrencyService.GetConcurrencyLock(cancellationToken);

        var tasks = tags.Select(async tag =>
        {
            await concurrencyLock.WaitAsync(cancellationToken);
            try
            {
                return await LoadTagAsync(containerClient, tag, cancellationToken);
            }
            catch (Azure.RequestFailedException ex) when (ex.Status == 404)
            {
                logger.LogWarning("tag {tag} not found in project {project}; it will be loaded with no refs.", tag, projectName);
                return new Tag { Name = tag };
            }
            finally
            {
                concurrencyLock.Release();
            }
        });

        return await Task.WhenAll(tasks);
    }

    public async Task AddMetricsAsync(string projectName, IList<MetricDefinition> metrics, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var blobClient = containerClient.GetBlobClient($"metric_definitions.json");
        var serializedJson = JsonConvert.SerializeObject(metrics);
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(serializedJson));
        await blobClient.UploadAsync(stream, overwrite: true, cancellationToken: cancellationToken);
    }

    public async Task<IList<MetricDefinition>> GetMetricsAsync(string projectName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var blobClient = containerClient.GetBlobClient("metric_definitions.json");
        if (!await blobClient.ExistsAsync(cancellationToken)) return new List<MetricDefinition>();
        var response = await blobClient.DownloadAsync(cancellationToken: cancellationToken);
        using var memoryStream = new MemoryStream();
        await response.Value.Content.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;
        using var streamReader = new StreamReader(memoryStream);
        var serializedJson = await streamReader.ReadToEndAsync(cancellationToken);
        var metric = JsonConvert.DeserializeObject<List<MetricDefinition>>(serializedJson)
            ?? throw new Exception("the metric contents were not valid.");
        return metric;
    }

    public async Task<IList<Experiment>> GetExperimentsAsync(string projectName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);

        // get experiment names
        var experimentNames = new List<string>();
        await foreach (var blobItem in containerClient.GetBlobsAsync(cancellationToken: cancellationToken))
        {
            var experimentName = blobItem.Name;
            if (!experimentName.EndsWith(".jsonl")) continue;
            if (experimentName.Contains("-optimizing")) continue;
            experimentNames.Add(experimentName[..^6]);
        }

        // load the experiments
        var concurrencyLock = await concurrencyService.GetConcurrencyLock(cancellationToken);
        var tasks = experimentNames.Select(async experimentName =>
        {
            await concurrencyLock.WaitAsync(cancellationToken);
            try
            {
                return await LoadExperimentAsync(containerClient, experimentName, includeResults: false, cancellationToken: cancellationToken);
            }
            finally
            {
                concurrencyLock.Release();
            }
        });

        return await Task.WhenAll(tasks);
    }

    public async Task AddExperimentAsync(string projectName, Experiment experiment, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var appendBlobClient = containerClient.GetAppendBlobClient($"{experiment.Name}.jsonl");
        var response = await appendBlobClient.ExistsAsync(cancellationToken);
        if (response.Value) throw new HttpException(409, "experiment already exists.");
        await appendBlobClient.CreateAsync(new AppendBlobCreateOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = "application/x-ndjson" }
        }, cancellationToken);
        var serializedJson = JsonConvert.SerializeObject(experiment);
        using var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(serializedJson + "\n"));
        await appendBlobClient.AppendBlockAsync(memoryStream, cancellationToken: cancellationToken);
    }

    public async Task SetExperimentAsBaselineAsync(string projectName, string experimentName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var metadata = new Dictionary<string, string>
        {
            { "exp_catalog_type", "project" },
            { "baseline", experimentName }
        };
        await containerClient.SetMetadataAsync(metadata, cancellationToken: cancellationToken);
    }

    public async Task SetBaselineForExperiment(string projectName, string experimentName, string setName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);

        // ensure experiment is not being optimized
        var optimizing = containerClient.GetAppendBlobClient($"{experimentName}-optimizing.jsonl");
        if (await optimizing.ExistsAsync(cancellationToken))
        {
            throw new HttpException(409, "experiment is currently being optimized.");
        }

        // set the metadata for baseline
        var appendBlobClient = containerClient.GetAppendBlobClient($"{experimentName}.jsonl");
        var response = await appendBlobClient.ExistsAsync(cancellationToken);
        if (!response.Value) throw new HttpException(404, "experiment not found.");
        var metadata = new Dictionary<string, string>
        {
            { "baseline", setName }
        };
        await appendBlobClient.SetMetadataAsync(metadata, cancellationToken: cancellationToken);
    }

    private async Task AddStorageRecord(string projectName, string experimentName, string json, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);

        // ensure experiment is not being optimized
        var optimizing = containerClient.GetAppendBlobClient($"{experimentName}-optimizing.jsonl");
        if (await optimizing.ExistsAsync(cancellationToken))
        {
            throw new HttpException(409, "experiment is currently being optimized.");
        }

        // add the result to the experiment
        var appendBlobClient = containerClient.GetAppendBlobClient($"{experimentName}.jsonl");
        var response = await appendBlobClient.ExistsAsync(cancellationToken);
        if (!response.Value) throw new HttpException(404, "experiment not found.");
        using var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(json + "\n"));
        await appendBlobClient.AppendBlockAsync(memoryStream, cancellationToken: cancellationToken);
    }

    public async Task AddResultAsync(string projectName, string experimentName, Result result, CancellationToken cancellationToken = default)
    {
        result.X = "R";
        var serializedJson = JsonConvert.SerializeObject(result);
        await AddStorageRecord(projectName, experimentName, serializedJson, cancellationToken);
    }

    public async Task AddStatisticsAsync(string projectName, string experimentName, Statistics statistics, CancellationToken cancellationToken = default)
    {
        statistics.X = "P";
        var serializedJson = JsonConvert.SerializeObject(statistics);
        await AddStorageRecord(projectName, experimentName, serializedJson, cancellationToken);
    }

    private async Task<Experiment> LoadExperimentAsync(
        BlobContainerClient containerClient,
        string experimentName,
        bool includeResults = true,
        CancellationToken cancellationToken = default)
    {
        var blobName = $"{experimentName}.jsonl";
        var appendBlobClient = containerClient.GetAppendBlobClient(blobName);
        var properties = await appendBlobClient.GetPropertiesAsync(cancellationToken: cancellationToken);

        // get content stream
        await using var contentStream = await GetExperimentContentStreamAsync(
            appendBlobClient,
            containerClient.Name,
            blobName,
            properties.Value.ETag,
            includeResults,
            cancellationToken);

        // parse the experiment info
        using var streamReader = new StreamReader(contentStream, leaveOpen: true);
        var experimentLine = await streamReader.ReadLineAsync(cancellationToken)
            ?? throw new Exception("no experiment info was found in the file.");
        var experiment = JsonConvert.DeserializeObject<Experiment>(experimentLine)
            ?? throw new Exception("the experiment info was corrupt.");

        // parse lines
        if (includeResults)
        {
            experiment.Results = new List<Result>();
            experiment.Statistics = new List<Statistics>();

            string? line;
            while ((line = await streamReader.ReadLineAsync(cancellationToken)) is not null)
            {
                var result = JsonConvert.DeserializeObject<Result>(line);
                if (result is null) continue;

                if (result.X == "P")
                {
                    var statistics = JsonConvert.DeserializeObject<Statistics>(line);
                    if (statistics is not null)
                    {
                        experiment.Statistics.Add(statistics);
                    }
                }
                else
                {
                    experiment.Results.Add(result);
                }
            }
        }

        // add metadata
        if (properties.Value.Metadata.TryGetValue("baseline", out var baseline))
        {
            experiment.Baseline = baseline;
        }
        experiment.Metadata = new Dictionary<string, object>
        {
            { "block_count", properties.Value.BlobCommittedBlockCount },
            { "blob_size", properties.Value.ContentLength },
        };
        experiment.Modified = properties.Value.LastModified;

        return experiment;
    }

    private async Task<Stream> GetExperimentContentStreamAsync(
        AppendBlobClient appendBlobClient,
        string containerName,
        string blobName,
        ETag etag,
        bool includeResults,
        CancellationToken cancellationToken)
    {
        // get configuration
        var config = await configFactory.GetAsync(cancellationToken);

        // try to use cached file if cache folder is configured
        // NOTE: if we don't include results, we just pull from the blob directly
        if (includeResults && !string.IsNullOrEmpty(config.AZURE_STORAGE_CACHE_FOLDER))
        {
            //var sanitizedETag = etag.ToString().Trim('"').Replace("0x", "");
            var sanitizedETag = etag.ToString().Trim('"');
            var blobNameWithoutExt = Path.GetFileNameWithoutExtension(blobName);
            var blobExt = Path.GetExtension(blobName);
            var cachedFileTemplate = Path.Combine(config.AZURE_STORAGE_CACHE_FOLDER, $"{containerName}_{blobNameWithoutExt}_");
            var cachedFilePath = Path.Combine(config.AZURE_STORAGE_CACHE_FOLDER, $"{containerName}_{blobNameWithoutExt}_{sanitizedETag}{blobExt}");
            try
            {
                if (TryGetCachedFileStream(cachedFilePath, out var cachedStream))
                {
                    return cachedStream;
                }
                return await DownloadAndCacheBlobAsync(appendBlobClient, cachedFileTemplate, cachedFilePath, cancellationToken);
            }
            catch (IOException ex)
            {
                // cache file may have been deleted by maintenance or another process, fall back to blob
                logger.LogWarning(ex, "cache contention detected for {file}, falling back to blob download.", cachedFilePath);
            }
        }

        // no cache folder configured (or cache failed), download directly to memory
        return await DownloadToMemoryAsync(appendBlobClient, includeResults, cancellationToken);
    }

    private bool TryGetCachedFileStream(
        string cachedFilePath,
        out Stream stream)
    {
        stream = Stream.Null;

        if (!File.Exists(cachedFilePath))
        {
            logger.LogDebug("no cached file found for {file}, downloading from blob.", cachedFilePath);
            return false;
        }

        logger.LogDebug("using cached file for {file}.", cachedFilePath);

        // read entire file into memory for consistent, fast performance
        // NOTE: this avoids slow line-by-line disk I/O and OS file cache variability
        // NOTE: this may throw IOException if file is deleted between exists check and read (contention)
        var fileBytes = File.ReadAllBytes(cachedFilePath);
        stream = new MemoryStream(fileBytes, writable: false);
        return true;
    }

    private async Task<Stream> DownloadToMemoryAsync(
        AppendBlobClient appendBlobClient,
        bool includeResults,
        CancellationToken cancellationToken)
    {
        HttpRange range = includeResults ? default : new HttpRange(0, 4096);
        var response = await appendBlobClient.DownloadAsync(range, cancellationToken: cancellationToken);
        var memoryStream = new MemoryStream();
        await response.Value.Content.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;
        return memoryStream;
    }

    private async Task<Stream> DownloadAndCacheBlobAsync(
        AppendBlobClient appendBlobClient,
        string cachedFileTemplate,
        string cachedFilePath,
        CancellationToken cancellationToken)
    {
        var response = await appendBlobClient.DownloadAsync(cancellationToken: cancellationToken);

        // ensure cache folder exists
        var cacheFolder = Path.GetDirectoryName(cachedFilePath);
        if (!string.IsNullOrEmpty(cacheFolder) && !Directory.Exists(cacheFolder))
        {
            Directory.CreateDirectory(cacheFolder);
        }

        // delete old cached files for this blob (different ETags)
        if (!string.IsNullOrEmpty(cacheFolder))
        {
            var searchPattern = Path.GetFileName(cachedFileTemplate) + "*";
            foreach (var oldFile in Directory.EnumerateFiles(cacheFolder, searchPattern))
            {
                try
                {
                    File.Delete(oldFile);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "failed to delete old cached file: {file}", oldFile);
                }
            }
        }

        // download to file
        {
            using var fileStream = new FileStream(cachedFilePath, FileMode.Create, FileAccess.Write, FileShare.None);
            await response.Value.Content.CopyToAsync(fileStream, cancellationToken);
        }

        // read cached file into memory for consistent, fast performance
        // NOTE: this may throw IOException if file is deleted by maintenance (contention)
        var fileBytes = await File.ReadAllBytesAsync(cachedFilePath, cancellationToken);
        return new MemoryStream(fileBytes, writable: false);
    }

    public async Task CleanupCacheAsync(CancellationToken cancellationToken = default)
    {
        var config = await configFactory.GetAsync(cancellationToken);

        if (string.IsNullOrEmpty(config.AZURE_STORAGE_CACHE_FOLDER))
        {
            return;
        }

        if (!Directory.Exists(config.AZURE_STORAGE_CACHE_FOLDER))
        {
            return;
        }

        var maxAge = TimeSpan.FromHours(config.AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS);
        var cutoffTime = DateTime.UtcNow - maxAge;
        var deletedCount = 0;

        await Task.Run(() =>
        {
            foreach (var file in Directory.EnumerateFiles(config.AZURE_STORAGE_CACHE_FOLDER, "*", SearchOption.TopDirectoryOnly))
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var fileInfo = new FileInfo(file);
                    if (fileInfo.LastWriteTimeUtc < cutoffTime)
                    {
                        fileInfo.Delete();
                        deletedCount++;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "failed to delete cached file: {File}", file);
                }
            }
        }, cancellationToken);

        if (deletedCount > 0)
        {
            logger.LogInformation("cleaned up {c} cached files older than {h} hours", deletedCount, config.AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS);
        }
    }

    public async Task<Experiment> GetProjectBaselineAsync(string projectName, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);

        // identify the baseline experiment
        var properties = await containerClient.GetPropertiesAsync(cancellationToken: cancellationToken);
        if (!properties.Value.Metadata.TryGetValue("baseline", out var baselineExperimentName))
        {
            throw new HttpException(404, "no baseline experiment has been identified.");
        }

        // load the baseline experiment
        var experiment = await LoadExperimentAsync(containerClient, baselineExperimentName, cancellationToken: cancellationToken);
        return experiment;
    }

    public async Task<Experiment> GetExperimentAsync(string projectName, string experimentName, bool includeResults = true, CancellationToken cancellationToken = default)
    {
        var containerClient = await this.ConnectAsync(projectName, cancellationToken);
        var experiment = await LoadExperimentAsync(containerClient, experimentName, includeResults, cancellationToken: cancellationToken);
        return experiment;
    }

    private async Task CopyAsync(AppendBlobClient sourceBlobClient, AppendBlobClient targetBlobClient, CancellationToken cancellationToken = default)
    {
        // log beginning of copy operation
        logger.LogInformation("attempting to copy {s} to {t}...", sourceBlobClient.Uri, targetBlobClient.Uri);
        var count = 0;

        // get the metadata
        var properties = await sourceBlobClient.GetPropertiesAsync(cancellationToken: cancellationToken);

        // open the source blob
        using var readStream = await sourceBlobClient.OpenReadAsync(cancellationToken: cancellationToken);
        using var reader = new StreamReader(readStream);
        var content = new StringBuilder();

        // read from the source blob
        string? line;
        while ((line = await reader.ReadLineAsync(cancellationToken)) is not null)
        {
            if (content.Length + line.Length < 4 * 1024 * 1024)
            {
                content.Append(line + "\n");
                continue;
            }

            // write to the target blob
            using var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(content.ToString()));
            await targetBlobClient.AppendBlockAsync(memoryStream, cancellationToken: cancellationToken);
            content.Clear();
            content.Append(line + "\n");
            count++;
        }

        // flush anything left over
        if (content.Length > 0)
        {
            using var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(content.ToString()));
            await targetBlobClient.AppendBlockAsync(memoryStream, cancellationToken: cancellationToken);
            count++;
        }

        // set the metadata
        await targetBlobClient.SetMetadataAsync(properties.Value.Metadata, cancellationToken: cancellationToken);

        // log end of copy operation
        logger.LogInformation(
            "successfully copied {s} to {t} (now with {x} blocks).",
            sourceBlobClient.Uri,
            targetBlobClient.Uri,
            count);
    }

    public async Task OptimizeExperimentAsync(string projectName, string experimentName, CancellationToken cancellationToken = default)
    {
        try
        {
            logger.LogDebug("attempting to optimize project {p}, experiment {e}...", projectName, experimentName);

            // open the source blob
            var containerClient = await this.ConnectAsync(projectName, cancellationToken);
            var sourceBlobClient = containerClient.GetAppendBlobClient($"{experimentName}.jsonl");

            // create the target blob
            var targetBlobClient = containerClient.GetAppendBlobClient($"{experimentName}-optimizing.jsonl");
            await targetBlobClient.CreateAsync(cancellationToken: cancellationToken);

            // copy from source to target
            await this.CopyAsync(sourceBlobClient, targetBlobClient, cancellationToken);

            // delete the source blob and then recreate it
            await sourceBlobClient.DeleteAsync(cancellationToken: cancellationToken);
            await sourceBlobClient.CreateAsync(cancellationToken: cancellationToken);

            // copy from the target to source
#pragma warning disable S2234 // Parameters should be passed in the correct order
            await this.CopyAsync(targetBlobClient, sourceBlobClient, cancellationToken);
#pragma warning restore S2234 // intended to support copying back

            // delete the target blob
            await targetBlobClient.DeleteAsync(cancellationToken: cancellationToken);

            logger.LogDebug("successfully optimized project {p}, experiment {e}.", projectName, experimentName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "error optimizing project {p}, experiment {e}...", projectName, experimentName);
            throw;
        }
    }

    private async Task<bool> ShouldBlobBeOptimizedAsync(Experiment experiment, CancellationToken cancellationToken)
    {
        if (experiment.Metadata is null || !experiment.Modified.HasValue) return false;
        var blockCount = (int)experiment.Metadata["block_count"];
        var blobSize = (long)experiment.Metadata["blob_size"];
        var minSinceLastModified = (DateTimeOffset.UtcNow - experiment.Modified.Value).TotalMinutes;
        logger.LogDebug(
            "experiment {e} had a block count of {x}, size of {y}, and was last modified {z} min ago.",
            experiment.Name,
            blockCount,
            blobSize,
            minSinceLastModified);
        if (blockCount < 2) return false;
        var config = await configFactory.GetAsync(cancellationToken);
        if (minSinceLastModified < config.MINUTES_TO_BE_IDLE) return false;
        if ((blobSize / blockCount) >= config.REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE * 1024) return false;
        return true;
    }

    public async Task OptimizeAsync(CancellationToken cancellationToken = default)
    {
        logger.LogDebug("starting optimize operation...");

        // look at each project
        logger.LogDebug("attempting to get a list of projects...");
        var projects = await this.GetProjectsAsync(cancellationToken);
        logger.LogDebug("successfully obtained a list of {x} projects.", projects.Count);
        foreach (var project in projects)
        {
            // look at each experiment in the project
            var experiments = await this.GetExperimentsAsync(project.Name, cancellationToken);
            foreach (var experiment in experiments)
            {
                // determine if we should optimize the experiment
                var shouldOptimize = await this.ShouldBlobBeOptimizedAsync(experiment, cancellationToken);
                if (!shouldOptimize) continue;

                // optimize the experiment
                try
                {
                    await this.OptimizeExperimentAsync(project.Name, experiment.Name, cancellationToken);
                }
                catch (Exception)
                {
                    // still try and optimize other experiments
                }
            }
        }

        logger.LogDebug("completed optimize operation.");
    }
}