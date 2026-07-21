using System;
using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ExperimentAggregationTests
{
    [Fact]
    public void AggregateSet_AverageMetricIncludesVariationAndRange()
    {
        var experiment = new Experiment
        {
            Name = "exp",
            Hypothesis = "test",
            MetricDefinitions = new Dictionary<string, MetricDefinition>
            {
                ["score"] = new MetricDefinition
                {
                    Name = "score",
                    AggregateFunction = AggregateFunctions.Average,
                },
            },
            Results =
            [
                CreateResult("set-a", 10m),
                CreateResult("set-a", 20m),
                CreateResult("set-a", 40m),
            ],
        };

        var result = experiment.AggregateSet("set-a");

        Assert.NotNull(result?.Metrics);
        var metric = result.Metrics["score"];
        Assert.Equal(3, metric.Count);
        Assert.Equal(70m / 3m, metric.Value);
        Assert.Equal(30m, metric.Range);
        Assert.Equal(10m, metric.RangeMin);
        Assert.Equal(40m, metric.RangeMax);
        Assert.Equal(metric.StdDev!.Value / Math.Abs(metric.Value!.Value), metric.CoefficientOfVariation);
    }

    [Fact]
    public void AggregateSet_ZeroAverageOmitsCoefficientOfVariation()
    {
        var experiment = new Experiment
        {
            Name = "exp",
            Hypothesis = "test",
            MetricDefinitions = new Dictionary<string, MetricDefinition>
            {
                ["score"] = new MetricDefinition
                {
                    Name = "score",
                    AggregateFunction = AggregateFunctions.Average,
                },
            },
            Results =
            [
                CreateResult("set-a", -1m),
                CreateResult("set-a", 1m),
            ],
        };

        var result = experiment.AggregateSet("set-a");

        Assert.NotNull(result?.Metrics);
        var metric = result.Metrics["score"];
        Assert.Equal(0m, metric.Value);
        Assert.Null(metric.CoefficientOfVariation);
        Assert.Equal(2m, metric.Range);
        Assert.Equal(-1m, metric.RangeMin);
        Assert.Equal(1m, metric.RangeMax);
    }

    private static Result CreateResult(string set, decimal value) => new()
    {
        Set = set,
        Created = DateTime.UtcNow,
        Metrics = new Dictionary<string, Metric>
        {
            ["score"] = new() { Value = value },
        },
    };
}
