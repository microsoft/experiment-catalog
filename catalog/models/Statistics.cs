using System;
using System.Collections.Generic;
using Azure.Storage.Blobs.Models;
using Newtonsoft.Json;

namespace Catalog;

public class Statistics : StorageRecord
{
    [JsonProperty("baseline_experiment", NullValueHandling = NullValueHandling.Ignore)]
    public string? BaselineExperiment { get; set; }

    [JsonProperty("baseline_set", NullValueHandling = NullValueHandling.Ignore)]
    public string? BaselineSet { get; set; }

    [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
    public string? Set { get; set; }

    [JsonProperty("baseline_result_count")]
    public int BaselineResultCount { get; set; }

    [JsonProperty("set_result_count")]
    public int SetResultCount { get; set; }

    [JsonProperty("num_samples")]
    public int NumSamples { get; set; }

    [JsonProperty("confidence_level")]
    public decimal ConfidenceLevel { get; set; }

    [JsonProperty("metrics", NullValueHandling = NullValueHandling.Ignore)]
    public Dictionary<string, Metric>? Metrics { get; set; }

    [JsonProperty("created", NullValueHandling = NullValueHandling.Ignore)]
    public DateTime Created { get; set; } = DateTime.UtcNow;
}