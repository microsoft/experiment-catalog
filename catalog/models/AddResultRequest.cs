using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;

namespace Catalog;

public class AddResultRequest
{
    private static readonly string[] classifications = ["t+", "t-", "f+", "f-"];

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
    [ValidNames]
    public Dictionary<string, object>? Metrics { get; set; }

    [JsonProperty("annotations", NullValueHandling = NullValueHandling.Ignore)]
    public List<Annotation>? Annotations { get; set; }

    public Dictionary<string, Metric>? ToMetrics()
    {
        if (this.Metrics is null) return null;
        var metrics = new Dictionary<string, Metric>();
        foreach (var metric in this.Metrics)
        {
            var str = metric.Value.ToString();
            if (double.TryParse(str, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
            {
                metrics[metric.Key] = new Metric { Value = (decimal)d };
            }
            else if (classifications.Contains(str)
                && Array.Exists(Experiment.namesIndicatingClassification, x => metric.Key.Contains(x, StringComparison.InvariantCultureIgnoreCase)))
            {
                metrics[metric.Key] = new Metric { Classification = str };
            }
            else
            {
                throw new HttpException(400, "Invalid metric value.");
            }
        }
        return metrics;
    }
}