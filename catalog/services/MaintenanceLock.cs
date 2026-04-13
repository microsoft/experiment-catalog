using System.Threading;

namespace Catalog;

/// <summary>
/// Provides a global lock to ensure that maintenance tasks across different background services
/// do not run concurrently. This prevents resource contention and ensures data consistency
/// during operations like cache cleanup, optimization, and statistics calculation.
/// </summary>
public static class MaintenanceLock
{
    /// <summary>
    /// A semaphore that allows only one maintenance operation at a time.
    /// All background services should acquire this lock before performing heavy maintenance work.
    /// </summary>
    public static readonly SemaphoreSlim Semaphore = new(1, 1);
}
