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
    public static readonly string[] namesIndicatingClassification = ["accuracy", "precision", "recall", "f1"];

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
            EnsureClassificationMetrics(key, metrics);
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

        if (definition.AggregateFunction is AggregateFunctions.Precision or AggregateFunctions.MicroPrecision ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("precision", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(IsClassificationOrRetrieval)
            )
        )
        {
            metric = ReduceConfusionMetric(key, metrics, AggregateFunctions.Precision);
            if (definition.AggregateFunction == AggregateFunctions.Default)
            {
                definition.AggregateFunction = AggregateFunctions.Precision;
            }
            return true;
        }

        return false;
    }

    private bool TryReduceAsRecall(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction is AggregateFunctions.Recall or AggregateFunctions.MicroRecall ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("recall", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(IsClassificationOrRetrieval)
            )
        )
        {
            metric = ReduceConfusionMetric(key, metrics, AggregateFunctions.Recall);
            if (definition.AggregateFunction == AggregateFunctions.Default)
            {
                definition.AggregateFunction = AggregateFunctions.Recall;
            }
            return true;
        }

        return false;
    }

    private bool TryReduceAsF1(string key, MetricDefinition definition, List<Metric> metrics, out Metric metric)
    {
        metric = new Metric();

        if (definition.AggregateFunction is AggregateFunctions.F1 or AggregateFunctions.MicroF1 ||
            (
                definition.AggregateFunction == AggregateFunctions.Default &&
                key.Contains("f1", StringComparison.InvariantCultureIgnoreCase) &&
                metrics.Exists(IsClassificationOrRetrieval)
            )
        )
        {
            metric = ReduceConfusionMetric(key, metrics, AggregateFunctions.F1);
            if (definition.AggregateFunction == AggregateFunctions.Default)
            {
                definition.AggregateFunction = AggregateFunctions.F1;
            }
            return true;
        }

        return false;
    }

    private bool TryReduceAsMacro(
        string key,
        MetricDefinition definition,
        IReadOnlyCollection<Result> results,
        out Metric metric)
    {
        metric = new Metric();
        var microFunction = definition.AggregateFunction switch
        {
            AggregateFunctions.MacroPrecision => AggregateFunctions.Precision,
            AggregateFunctions.MacroRecall => AggregateFunctions.Recall,
            AggregateFunctions.MacroF1 => AggregateFunctions.F1,
            _ => (AggregateFunctions?)null,
        };
        if (microFunction is null) return false;

        var scores = results
            .Where(result =>
                !string.IsNullOrEmpty(result.Ref) &&
                result.Metrics?.ContainsKey(key) == true)
            .GroupBy(result => result.Ref)
            .Select(group => ReduceConfusionMetric(
                key,
                group.Select(result => result.Metrics![key]).ToList(),
                microFunction.Value).Value)
            .OfType<decimal>()
            .ToList();

        if (scores.Count == 0)
        {
            throw new HttpException(400, $"Metric '{key}' requires retrieval or classification values with refs.");
        }

        metric = CreateAverageSummary(definition, scores, useValueAsNormalized: true);
        return true;
    }

    private bool TryReduceAsAverageByRef(
        string key,
        MetricDefinition definition,
        IReadOnlyCollection<Result> results,
        out Metric metric)
    {
        metric = new Metric();
        if (definition.AggregateFunction != AggregateFunctions.AverageByRef) return false;

        var metricResults = results
            .Where(result =>
                !string.IsNullOrEmpty(result.Ref) &&
                result.Metrics?.ContainsKey(key) == true)
            .ToList();
        if (metricResults.Any(result => result.Metrics![key].Value is null))
        {
            throw new HttpException(400, $"AverageByRef metric '{key}' requires numeric values.");
        }

        var refAverages = metricResults
            .GroupBy(result => result.Ref)
            .Select(group => group.Average(result => result.Metrics![key].Value!.Value))
            .ToList();
        if (refAverages.Count == 0)
        {
            throw new HttpException(400, $"AverageByRef metric '{key}' requires numeric values with refs.");
        }

        metric = CreateAverageSummary(definition, refAverages, useValueAsNormalized: false);
        return true;
    }

    private static Metric CreateAverageSummary(
        MetricDefinition definition,
        List<decimal> values,
        bool useValueAsNormalized)
    {
        var average = values.Average();
        var stdDev = values.StdDev(value => value);
        var rangeMin = values.Min();
        var rangeMax = values.Max();
        decimal? normalized = useValueAsNormalized
            ? average
            : definition.TryNormalize(average, out var normalizedValue)
                ? normalizedValue
                : null;

        return new Metric
        {
            Count = values.Count,
            Value = average,
            Normalized = normalized,
            StdDev = stdDev,
            CoefficientOfVariation = average != 0 && stdDev.HasValue
                ? stdDev.Value / Math.Abs(average)
                : null,
            Range = rangeMax - rangeMin,
            RangeMin = rangeMin,
            RangeMax = rangeMax,
        };
    }

    private static Metric ReduceConfusionMetric(
        string key,
        List<Metric> metrics,
        AggregateFunctions aggregateFunction)
    {
        var counts = GetConfusionCounts(key, metrics);
        var value = aggregateFunction switch
        {
            AggregateFunctions.Precision => counts.TruePositive.DivBy(
                counts.TruePositive + counts.FalsePositive),
            AggregateFunctions.Recall => counts.TruePositive.DivBy(
                counts.TruePositive + counts.FalseNegative),
            AggregateFunctions.F1 => (2 * counts.TruePositive).DivBy(
                (2 * counts.TruePositive) + counts.FalsePositive + counts.FalseNegative),
            _ => throw new InvalidOperationException($"Unsupported confusion-matrix aggregate '{aggregateFunction}'."),
        };

        return new Metric
        {
            Count = metrics.Count,
            Value = value,
            Normalized = value,
        };
    }

    private static ConfusionCounts GetConfusionCounts(string key, List<Metric> metrics)
    {
        var usesClassification = metrics.Exists(metric => metric.Classification is not null);
        var usesRetrieval = metrics.Exists(metric => metric.Retrieval is not null);
        if (usesRetrieval &&
            (usesClassification || metrics.Exists(metric => metric.Value is not null)))
        {
            throw new HttpException(
                400,
                $"Metric '{key}' must consistently use classification or retrieval values for this aggregate.");
        }

        var counts = new ConfusionCounts();
        foreach (var metric in metrics)
        {
            if (metric.Classification is not null)
            {
                counts = metric.Classification switch
                {
                    "t+" => counts with { TruePositive = counts.TruePositive + 1 },
                    "t-" => counts with { TrueNegative = counts.TrueNegative + 1 },
                    "f+" => counts with { FalsePositive = counts.FalsePositive + 1 },
                    "f-" => counts with { FalseNegative = counts.FalseNegative + 1 },
                    _ => throw new HttpException(400, $"Metric '{key}' has an invalid classification value."),
                };
                continue;
            }

            if (!usesRetrieval) continue;
            var retrieval = metric.Retrieval!;
            var found = retrieval.Found.ToHashSet(StringComparer.Ordinal);
            var expected = retrieval.Expected.ToHashSet(StringComparer.Ordinal);
            counts = counts with
            {
                TruePositive = counts.TruePositive + found.Intersect(expected).Count(),
                FalsePositive = counts.FalsePositive + found.Except(expected).Count(),
                FalseNegative = counts.FalseNegative + expected.Except(found).Count(),
            };
        }

        return counts;
    }

    private static bool IsClassificationOrRetrieval(Metric metric) =>
        metric.Classification is not null || metric.Retrieval is not null;

    private static void EnsureClassificationMetrics(string key, List<Metric> metrics)
    {
        if (metrics.Any(metric => metric.Retrieval is not null))
        {
            throw new HttpException(400, $"Accuracy metric '{key}' requires classification values.");
        }
    }

    private readonly record struct ConfusionCounts(
        int TruePositive = 0,
        int TrueNegative = 0,
        int FalsePositive = 0,
        int FalseNegative = 0);

    private Metric ReduceAsAverage(string key, MetricDefinition definition, List<Metric> metrics)
    {
        var average = metrics.Average(x => x.Value);
        var stdDev = metrics.StdDev(x => x.Value);
        var values = metrics.Select(x => x.Value).OfType<decimal>().ToList();
        decimal? normalized = definition.TryNormalize(average, out var x) ? x : null;
        definition.AggregateFunction = AggregateFunctions.Average;

        decimal? rangeMin = values.Count > 0 ? values.Min() : null;
        decimal? rangeMax = values.Count > 0 ? values.Max() : null;

        return new Metric
        {
            Count = metrics.Count,
            Value = average,
            Normalized = normalized,
            StdDev = stdDev,
            CoefficientOfVariation = average.HasValue && average.Value != 0 && stdDev.HasValue
                ? stdDev.Value / Math.Abs(average.Value)
                : null,
            Range = rangeMin.HasValue && rangeMax.HasValue ? rangeMax.Value - rangeMin.Value : null,
            RangeMin = rangeMin,
            RangeMax = rangeMax,
        };
    }

    private Metric Reduce(string key, List<Metric> metrics, IReadOnlyCollection<Result> results)
    {
        Metric metric;

        // use or create a metric definition
        this.MetricDefinitions ??= new Dictionary<string, MetricDefinition>();
        if (!this.MetricDefinitions.TryGetValue(key, out var definition))
        {
            definition = new MetricDefinition { Name = key, AggregateFunction = AggregateFunctions.Default };
            this.MetricDefinitions.Add(key, definition);
        }

        if (TryReduceAsMacro(key, definition, results, out metric)) return metric;
        if (TryReduceAsAverageByRef(key, definition, results, out metric)) return metric;
        if (TryReduceAsCost(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsCount(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsAccuracy(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsPrecision(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsRecall(key, definition, metrics, out metric)) return metric;
        if (TryReduceAsF1(key, definition, metrics, out metric)) return metric;
        if (metrics.Exists(metric => metric.Retrieval is not null))
        {
            throw new HttpException(400, $"Metric '{key}' has no compatible aggregate function.");
        }
        return ReduceAsAverage(key, definition, metrics);
    }

    private Result Aggregate(IEnumerable<Result> from, bool includeAnnotationsWithRef)
    {
        var source = from.ToList();
        var result = new Result();
        DateTime first = DateTime.MaxValue;
        DateTime last = DateTime.MinValue;
        var annotations = new List<Annotation>();

        var metrics = new Dictionary<string, List<Metric>>();
        foreach (var r in source)
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

        result.Metrics = metrics.ToDictionary(
            x => x.Key,
            x =>
            {
                var metric = this.Reduce(x.Key, x.Value, source);
                var aggregateFunction = this.MetricDefinitions![x.Key].AggregateFunction;
                metric.UniqueRefs = source
                    .Where(result =>
                        !string.IsNullOrEmpty(result.Ref) &&
                        result.Metrics?.TryGetValue(x.Key, out var sourceMetric) == true &&
                        ContributesToAggregate(sourceMetric, aggregateFunction))
                    .Select(result => result.Ref)
                    .Distinct(StringComparer.Ordinal)
                    .Count();
                return metric;
            });

        if (annotations.Count > 0)
        {
            result.Annotations = annotations;
        }
        result.Runtime = (int)(last - first).TotalSeconds;
        return result;
    }

    private static bool ContributesToAggregate(
        Metric metric,
        AggregateFunctions aggregateFunction) =>
        aggregateFunction switch
        {
            AggregateFunctions.Accuracy => metric.Classification is not null,
            AggregateFunctions.Precision or
            AggregateFunctions.Recall or
            AggregateFunctions.F1 or
            AggregateFunctions.MicroPrecision or
            AggregateFunctions.MicroRecall or
            AggregateFunctions.MicroF1 or
            AggregateFunctions.MacroPrecision or
            AggregateFunctions.MacroRecall or
            AggregateFunctions.MacroF1 =>
                metric.Classification is not null || metric.Retrieval is not null,
            _ => true,
        };

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
                var reduced = this.Reduce(
                    metric.Key,
                    new List<Metric> { metric.Value },
                    new List<Result> { result });
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