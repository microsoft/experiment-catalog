using Newtonsoft.Json;

namespace Catalog;

public record RefFilter(
    [property: JsonProperty("set")] string Set,
    [property: JsonProperty("metric")] string Metric);
