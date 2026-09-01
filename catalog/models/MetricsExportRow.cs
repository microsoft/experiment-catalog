using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class MetricsExportRow
{
    [JsonProperty("set", Required = Required.Always)]
    public required string Set { get; set; }

    [JsonProperty("ref", Required = Required.Always)]
    public required string Ref { get; set; }

    [JsonProperty("iteration", Required = Required.Always)]
    public required int Iteration { get; set; }

    [JsonProperty("metrics", Required = Required.Always)]
    public required Dictionary<string, object> Metrics { get; set; }
}
