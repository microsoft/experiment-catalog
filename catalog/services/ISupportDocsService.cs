using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Catalog;

public interface ISupportDocsService
{
    Task<byte[]> GetSupportingDocumentAsync(string url, CancellationToken cancellationToken = default);
}