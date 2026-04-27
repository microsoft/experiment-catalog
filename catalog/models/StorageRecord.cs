using Newtonsoft.Json;

namespace Catalog;

public class StorageRecord
{
    [JsonProperty("x", NullValueHandling = NullValueHandling.Ignore)]
    public string? X { get; set; }
}