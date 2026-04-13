using System.Collections.Generic;
using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace Catalog;

public class Comparison
{
    [JsonProperty("metric_definitions", NullValueHandling = NullValueHandling.Ignore)]
    public Dictionary<string, MetricDefinition>? MetricDefinitions { get; set; }

    [JsonProperty("project_baseline", NullValueHandling = NullValueHandling.Ignore)]
    public ComparisonEntity? ProjectBaseline { get; set; }

    [JsonProperty("experiment_baseline", NullValueHandling = NullValueHandling.Ignore)]
    public ComparisonEntity? ExperimentBaseline { get; set; }

    [JsonProperty("sets", NullValueHandling = NullValueHandling.Ignore)]
    public IEnumerable<ComparisonEntity>? Sets { get; set; }
}