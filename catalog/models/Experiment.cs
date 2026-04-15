using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.IO.Compression;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;
using Newtonsoft.Json;

namespace Catalog;

public class Experiment()
{
    public static readonly string[] namesIndicatingClassification = ["accuracy", "precision", "recall"];

    [JsonProperty("name", Required = Required.Always)]
    [Required, ValidName, ValidExperimentName]
    public required string Name { get; set; }

    [JsonProperty("hypothesis", Required = Required.Always)]
    public required string Hypothesis { get; set; }

    [JsonProperty("results", NullValueHandling = NullValueHandling.Ignore)]
    public List<Result>? Results { get; set; }

    [JsonProperty("statistics", NullValueHandling = NullValueHandling.Ignore)]
    public List<Statistics>? Statistics { get; set; }

    [JsonProperty("baseline", NullValueHandling = NullValueHandling.Ignore)]
    [ValidName, ValidExperimentName]
    public string? Baseline { get; set; }

    [JsonProperty("annotations", NullValueHandling = NullValueHandling.Ignore)]
    public List<Annotation>? Annotations { get; set; }

    [JsonProperty("created", NullValueHandling = NullValueHandling.Ignore)]
    public DateTimeOffset Created { get; set; } = DateTimeOffset.UtcNow;

    [JsonProperty("modified", NullValueHandling = NullValueHandling.Ignore)]
    public DateTimeOffset? Modified { get; set; } = null;

    [JsonIgnore]
    public Dictionary<string, MetricDefinition>? MetricDefinitions { get; set; }

    [JsonIgnore]
    public List<Result>? Saved { get; set; }

    [JsonIgnore]
    public Dictionary<string, object>? Metadata { get; set; }

    private bool TryReduceAsCost(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction == AggregateFunctions.Cost ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("cost", StringComparison.InvariantCultureIgnoreCase)
            )
        )
        {
            metric.Count = metrics.Count;
            metric.Value = metrics.Sum(x => x.Value);
            definition.AggregateFunction = AggregateFunctions.Cost;
            return true;
        }

        return false;
    }

    private bool TryReduceAsCount(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction == AggregateFunctions.Count ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("count", StringComparison.InvariantCultureIgnoreCase)
            )
        )
        {
            metric.Count = metrics.Count;
            metric.Value = metrics.Sum(x => x.Value);
            definition.AggregateFunction = AggregateFunctions.Count;
            return true;
        }

        return false;
    }

    private bool TryReduceAsAccuracy(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction == AggregateFunctions.Accuracy ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("accuracy", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(x => x.Classification is not null)
            )
        )
        {
            var t = metrics.Count(x => x.Classification is not null && x.Classification.StartsWith('t'));
            var a = metrics.Count(x => x.Classification is not null);
            metric.Count = metrics.Count;
            metric.Value = t.DivBy(a);
            metric.Normalized = metric.Value;
            definition.AggregateFunction = AggregateFunctions.Accuracy;
            return true;
        }

        return false;
    }

    private bool TryReduceAsPrecision(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction == AggregateFunctions.Precision ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("precision", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(x => x.Classification is not null)
            )
        )
        {
            var tp = metrics.Count(x => x.Classification is not null && x.Classification == "t+");
            var p = metrics.Count(x => x.Classification is not null && x.Classification.EndsWith('+'));
            metric.Count = metrics.Count;
            metric.Value = tp.DivBy(p);
            metric.Normalized = metric.Value;
            definition.AggregateFunction = AggregateFunctions.Precision;
            return true;
        }

        return false;
    }

    private bool TryReduceAsRecall(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction == AggregateFunctions.Recall ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("recall", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(x => x.Classification is not null)
            )
        )
        {
            var tp = metrics.Count(x => x.Classification is not null && x.Classification == "t+");
            var fn = metrics.Count(x => x.Classification is not null && x.Classification == "f-");
            metric.Count = metrics.Count;
            metric.Value = tp.DivBy(tp + fn);
            metric.Normalized = metric.Value;
            definition.AggregateFunction = AggregateFunctions.Recall;
            return true;
        }

        return false;
    }

    private Metric ReduceAsAverage(string key, MetricDefinition definition, List<Metric> metrics)
    {
        var average = metrics.Average(x => x.Value);
        decimal? normalized = definition.TryNormalize(average, out var x) ? x : null;
        definition.AggregateFunction = AggregateFunctions.Average;

        return new Metric
        {
            Count = metrics.Count,
            Value = average,
            Normalized = normalized,
            StdDev = metrics.StdDev(x => x.Value),
        };
    }

    private Metric Reduce(string key, List<Metric> metrics)
    {
        Metric metric;

        // use or create a metric definition
        this.MetricDefinitions ??= new Dictionary<string, MetricDefinition>();
        if (!this.MetricDefinitions.TryGetValue(key, out var definition))
        {
            definition = new MetricDefinition { Name = key, AggregateFunction = AggregateFunctions.Default };
            this.MetricDefinitions.Add(key, definition);
        }

        if (TryReduceAsCost(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsCount(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsAccuracy(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsPrecision(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsRecall(key, definition, metrics, out metric)) return metric;
        return ReduceAsAverage(key, definition, metrics);
    }

    private Result Aggregate(IEnumerable<Result> from, bool includeAnnotationsWithRef)
    {
        var result = new Result();
        DateTime first = DateTime.MaxValue;
        DateTime last = DateTime.MinValue;
        var annotations = new List<Annotation>();

        var metrics = new Dictionary<string, List<Metric>>();
        foreach (var r in from)
        {
            if (r.Annotations is not null
                && (includeAnnotationsWithRef || string.IsNullOrEmpty(r.Ref)))
            {
                annotations.AddRange(r.Annotations);
            }
            if (r.Metrics is null) continue;
            var hasMetric = false;
            foreach (var (key, metric) in r.Metrics)
            {
                if (!metrics.ContainsKey(key)) metrics[key] = [];
                metrics[key].Add(metric);
                hasMetric = true;
            }
            if (hasMetric)
            {
                if (r.Created < first) first = r.Created;
                if (r.Created > last) last = r.Created;
            }
        }

        result.Metrics = metrics.ToDictionary(x => x.Key, x => this.Reduce(x.Key, x.Value));

        if (annotations.Count > 0)
        {
            result.Annotations = annotations;
        }
        result.Runtime = (int)(last - first).TotalSeconds;
        return result;
    }

    public Result? AggregateSet(string? set, IEnumerable<Result>? results = null)
    {
        if (string.IsNullOrEmpty(set)) return null;
        results ??= this.Results;
        if (results is null) return null;

        var filtered = results.Where(x => x.Set == set);
        var result = this.Aggregate(filtered, false);
        result.Set = set;
        return result;
    }

    public IDictionary<string, Result>? AggregateSetByRef(string? set, IEnumerable<Result>? results = null)
    {
        if (string.IsNullOrEmpty(set)) return null;
        results ??= this.Results;
        if (results is null) return null;

        var output = new Dictionary<string, Result>();
        var filtered = results.Where(x => x.Set == set && !string.IsNullOrEmpty(x.Ref));
        foreach (var group in filtered.GroupBy(x => x.Ref))
        {
            var result = this.Aggregate(group, true);
            result.Ref = group.Key;
            result.Set = set;
            output.Add(group.Key!, result);
        }

        return output;
    }

    public IEnumerable<Result> AggregateAllSets(IEnumerable<Result>? results = null)
    {
        var output = new List<Result>();
        results ??= this.Results;
        if (results is null) return output;

        foreach (var set in this.Sets)
        {
            var result = this.AggregateSet(set, results);
            if (result is not null) output.Add(result);
        }

        return output;
    }

    public IEnumerable<Result>? AggregateSetByEachResult(string? set, IEnumerable<Result>? results = null)
    {
        if (string.IsNullOrEmpty(set)) return null;
        results ??= this.Results;
        if (results is null) return null;

        var filtered = results.Where(x => x.Set == set);
        foreach (var result in filtered)
        {
            if (result.Metrics is null) continue;
            foreach (var metric in result.Metrics)
            {
                var reduced = this.Reduce(metric.Key, new List<Metric> { metric.Value });
                result.Metrics[metric.Key] = reduced;
            }
        }

        return filtered;
    }

# pragma warning disable S3776 // Cognitive Complexity of this method is not too high
    public IEnumerable<Result>? Filter(IEnumerable<Tag>? includeTags, IEnumerable<Tag>? excludeTags)
    {
        var hasIncludeTags = includeTags is not null && includeTags.Any();
        var hasExcludeTags = excludeTags is not null && excludeTags.Any();
        if (!hasIncludeTags && !hasExcludeTags) return this.Results;
        return this.Results?
            .Where(x =>
            {
                var hasAnnotations = x.Annotations is not null && x.Annotations.Count > 0;
                var hasMetrics = x.Metrics is not null && x.Metrics.Count > 0;
                if (hasAnnotations && !hasMetrics) return true;
                if (x.Ref is null) return false;
                if (hasExcludeTags)
                {
                    foreach (var tag in excludeTags!)
                    {
                        if (tag.Refs is not null && tag.Refs.Contains(x.Ref)) return false;
                    }
                }
                if (hasIncludeTags)
                {
                    foreach (var tag in includeTags!)
                    {
                        if (tag.Refs is not null && tag.Refs.Contains(x.Ref)) return true;
                    }
                }
                if (hasIncludeTags) return false;
                if (hasExcludeTags) return true;
                return true;
            });
    }
# pragma warning restore S3776

    public IEnumerable<string> Sets
    {
        get => this.Results?
            .Select(x => x.Set)
            .Distinct()
            .Where(x => !string.IsNullOrEmpty(x))
            .Cast<string>()
            ?? Enumerable.Empty<string>();
    }

    public string? FirstSet
    {
        get => Results?.FirstOrDefault(r => !string.IsNullOrEmpty(r.Set))?.Set;
    }

    public string? LastSet
    {
        get => Results?.LastOrDefault(r => !string.IsNullOrEmpty(r.Set))?.Set;
    }

    public string? BaselineSet
    {
        get => this.Baseline;
    }
}