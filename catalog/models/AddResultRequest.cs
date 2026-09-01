using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Catalog;

public class AddResultRequest
{
    private const int MaxRetrievalItems = 10_000;
    private const int MaxRetrievalIdLength = 500;
    private static readonly string[] classifications = ["t+", "t-", "f+", "f-"];

    [JsonProperty("ref", NullValueHandling = NullValueHandling.Ignore)]
    [ValidName]
    public string? Ref { get; set; }

    [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
    [ValidName]
    public string? Set { get; set; }

    [JsonProperty("ground_truth_uri", NullValueHandling = NullValueHandling.Ignore)]
    public string? GroundTruthUri { get; set; }

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
            if (TryParseRetrievalValue(metric.Value, out var retrieval))
            {
                metrics[metric.Key] = new Metric { Retrieval = retrieval };
                continue;
            }

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

    private static bool TryParseRetrievalValue(object value, out RetrievalValue retrieval)
    {
        retrieval = null!;
        JObject? json = value switch
        {
            JObject jsonObject => jsonObject,
            IDictionary<string, object> dictionary => JObject.FromObject(dictionary),
            _ => null,
        };
        if (json is null) return false;

        var propertyNames = json.Properties().Select(property => property.Name).ToHashSet(StringComparer.Ordinal);
        if (!propertyNames.SetEquals(["found", "expected"]))
        {
            throw new HttpException(400, "Retrieval metric values require exactly 'found' and 'expected' arrays.");
        }

        if (json["found"] is not JArray found ||
            json["expected"] is not JArray expected ||
            found.Any(token => token.Type != JTokenType.String) ||
            expected.Any(token => token.Type != JTokenType.String))
        {
            throw new HttpException(400, "Retrieval metric 'found' and 'expected' must be arrays of document IDs.");
        }

        retrieval = new RetrievalValue
        {
            Found = found.Select(token => token.Value<string>()!).ToList(),
            Expected = expected.Select(token => token.Value<string>()!).ToList(),
        };
        ValidateRetrievalIds(retrieval.Found, "found");
        ValidateRetrievalIds(retrieval.Expected, "expected");
        return true;
    }

    private static void ValidateRetrievalIds(IReadOnlyCollection<string> ids, string field)
    {
        if (ids.Count > MaxRetrievalItems)
        {
            throw new HttpException(400, $"Retrieval metric '{field}' cannot contain more than {MaxRetrievalItems} IDs.");
        }

        if (ids.Any(id => string.IsNullOrWhiteSpace(id) || id.Length > MaxRetrievalIdLength))
        {
            throw new HttpException(
                400,
                $"Retrieval metric '{field}' IDs must be non-empty and at most {MaxRetrievalIdLength} characters.");
        }

        if (ids.Distinct(StringComparer.Ordinal).Count() != ids.Count)
        {
            throw new HttpException(400, $"Retrieval metric '{field}' cannot contain duplicate IDs.");
        }
    }
}