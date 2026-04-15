using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class ComparisonByRef
{
    [JsonProperty("metric_definitions", NullValueHandling = NullValueHandling.Ignore)]
    public Dictionary<string, MetricDefinition>? MetricDefinitions { get; set; }

    [JsonProperty("project_baseline", NullValueHandling = NullValueHandling.Ignore)]
    public ComparisonByRefEntity? ProjectBaseline { get; set; }

    [JsonProperty("experiment_baseline", NullValueHandling = NullValueHandling.Ignore)]
    public ComparisonByRefEntity? ExperimentBaseline { get; set; }

    [JsonProperty("experiment_set", NullValueHandling = NullValueHandling.Ignore)]
    public ComparisonByRefEntity? ExperimentSet { get; set; }
}