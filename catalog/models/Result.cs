using System;
using System.Collections.Generic;
using Azure.Storage.Blobs.Models;
using Newtonsoft.Json;

namespace Catalog;

public class Result : StorageRecord
{
    [JsonProperty("ref", NullValueHandling = NullValueHandling.Ignore)]
    [ValidName]
    public string? Ref { get; set; }

    [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
    [ValidName]
    public string? Set { get; set; }

    [JsonProperty("inference_uri", NullValueHandling = NullValueHandling.Ignore)]
    public string? InferenceUri { get; set; }

    [JsonProperty("evaluation_uri", NullValueHandling = NullValueHandling.Ignore)]
    public string? EvaluationUri { get; set; }

    [JsonProperty("metrics", NullValueHandling = NullValueHandling.Ignore)]
    public Dictionary<string, Metric>? Metrics { get; set; }

    [JsonProperty("annotations", NullValueHandling = NullValueHandling.Ignore)]
    public List<Annotation>? Annotations { get; set; }

    [JsonProperty("policy_results", NullValueHandling = NullValueHandling.Ignore)]
    public Dictionary<string, PolicyResult>? PolicyResults { get; set; }

    [JsonProperty("created", NullValueHandling = NullValueHandling.Ignore)]
    public DateTime Created { get; set; } = DateTime.UtcNow;

    [JsonProperty("runtime", NullValueHandling = NullValueHandling.Ignore)]
    public int? Runtime { get; set; }
}