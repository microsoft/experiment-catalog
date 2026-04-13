using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Identity.Client.Extensions.Msal;
using NetBricks;

namespace Catalog;

public class AzureBlobStorageMaintenanceService(
    IConfigFactory<IConfig> configFactory,
    IStorageService storageService,
    ILogger<AzureBlobStorageMaintenanceService> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // check if the service is disabled
        if (storageService is not AzureBlobStorageService azureBlobStorageService)
        {
            logger.LogInformation("AzureBlobStorageMaintenanceService is disabled because the storage service is not AzureBlobStorageService.");
            return;
        }
        var config = await configFactory.GetAsync(stoppingToken);
        if (config.AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES <= 0
            && config.AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES <= 0)
        {
            logger.LogInformation("AzureBlobStorageMaintenanceService is disabled because both optimization and cache cleanup intervals are set to 0.");
            return;
        }

        // init
        var lastCacheCleanup = DateTime.UtcNow;
        var lastOptimization = DateTime.UtcNow;

        // main loop
        while (!stoppingToken.IsCancellationRequested)
        {
            // run cache cleanup
            try
            {
                var minutesSinceLastCacheCleanup = (DateTime.UtcNow - lastCacheCleanup).TotalMinutes;
                if (config.AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES > 0
                    && minutesSinceLastCacheCleanup >= config.AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES)
                {
                    await MaintenanceLock.Semaphore.WaitAsync(stoppingToken);
                    try
                    {
                        logger.LogInformation("starting AzureBlobStorageMaintenanceService cache cleanup...");
                        await azureBlobStorageService.CleanupCacheAsync(stoppingToken);
                        logger.LogInformation("completed AzureBlobStorageMaintenanceService cache cleanup.");
                        lastCacheCleanup = DateTime.UtcNow;
                    }
                    finally
                    {
                        MaintenanceLock.Semaphore.Release();
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                logger.LogInformation("AzureBlobStorageMaintenanceService is shutting down.");
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "there was an error during the cache cleanup in AzureBlobStorageMaintenanceService...");
            }

            // run optimization
            try
            {
                var minutesSinceLastOptimization = (DateTime.UtcNow - lastOptimization).TotalMinutes;
                if (config.AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES > 0
                    && minutesSinceLastOptimization >= config.AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES)
                {
                    await MaintenanceLock.Semaphore.WaitAsync(stoppingToken);
                    try
                    {
                        logger.LogInformation("starting AzureBlobStorageMaintenanceService optimization...");
                        await azureBlobStorageService.OptimizeAsync(stoppingToken);
                        logger.LogInformation("completed AzureBlobStorageMaintenanceService optimization.");
                        lastOptimization = DateTime.UtcNow;
                    }
                    finally
                    {
                        MaintenanceLock.Semaphore.Release();
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                logger.LogInformation("AzureBlobStorageMaintenanceService is shutting down.");
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "there was an error during optimization in AzureBlobStorageMaintenanceService...");
            }

            // short delay before checking again
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}