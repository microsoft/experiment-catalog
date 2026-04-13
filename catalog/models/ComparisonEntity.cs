using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class ComparisonEntity
{
    [JsonProperty("project", Required = Required.Always)]
    public required string Project { get; set; }

    [JsonProperty("experiment", Required = Required.Always)]
    public required string Experiment { get; set; }

    [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
    public string? Set { get; set; }

    [JsonProperty("result", NullValueHandling = NullValueHandling.Ignore)]
    public Result? Result { get; set; }

    [JsonProperty("count", NullValueHandling = NullValueHandling.Ignore)]
    public int? Count { get; set; }
}