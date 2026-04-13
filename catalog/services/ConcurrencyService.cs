using System;
using System.Threading;
using System.Threading.Tasks;
using NetBricks;

namespace Catalog;

public class ConcurrencyService(IConfigFactory<IConfig> configFactory) : IDisposable
{
    private SemaphoreSlim? connectLock;
    private SemaphoreSlim? concurrencyLock;
    private bool disposed;

    public Task<SemaphoreSlim> GetConnectLock(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        this.connectLock = new SemaphoreSlim(1, 1);
        return Task.FromResult(this.connectLock);
    }

    public async Task<SemaphoreSlim> GetConcurrencyLock(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        var config = await configFactory.GetAsync(cancellationToken);
        this.concurrencyLock = new SemaphoreSlim(config.CONCURRENCY, config.CONCURRENCY);
        return this.concurrencyLock;
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!disposed)
        {
            if (disposing)
            {
                connectLock?.Dispose();
                concurrencyLock?.Dispose();
            }
            disposed = true;
        }
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
}