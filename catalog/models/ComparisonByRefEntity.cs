using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class ComparisonByRefEntity
{
    [JsonProperty("project", Required = Required.Always)]
    public required string Project { get; set; }

    [JsonProperty("experiment", Required = Required.Always)]
    public required string Experiment { get; set; }

    [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
    public string? Set { get; set; }

    [JsonProperty("results", NullValueHandling = NullValueHandling.Ignore)]
    public IDictionary<string, Result>? Results { get; set; }
}