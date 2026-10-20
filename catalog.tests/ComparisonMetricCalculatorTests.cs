using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ComparisonMetricCalculatorTests
{
    [Fact]
    public void ApplyWinAndTieCounts_CountsHigherValuesAndExactTies()
    {
        var aggregate = Aggregate("score");
        var candidate = ByRef(("a", 2m), ("b", 1m), ("c", 4m), ("candidate-only", 10m));
        var baseline = ByRef(("a", 1m), ("b", 1m), ("c", 5m), ("baseline-only", 0m));

        ComparisonMetricCalculator.ApplyWinAndTieCounts(
            aggregate,
            candidate,
            baseline,
            new Dictionary<string, MetricDefinition>());

        Assert.Equal(1, aggregate.Metrics!["score"].Wins);
        Assert.Equal(1, aggregate.Metrics["score"].Ties);
    }

    [Fact]
    public void ApplyWinAndTieCounts_RespectsLowerIsBetter()
    {
        var aggregate = Aggregate("latency");
        var definitions = new Dictionary<string, MetricDefinition>
        {
            ["latency"] = new()
            {
                Name = "latency",
                Tags = ["lower-is-better"],
            },
        };

        ComparisonMetricCalculator.ApplyWinAndTieCounts(
            aggregate,
            ByRef(("a", 10m), ("b", 30m)),
            ByRef(("a", 20m), ("b", 20m)),
            definitions);

        Assert.Equal(1, aggregate.Metrics!["latency"].Wins);
        Assert.Equal(0, aggregate.Metrics["latency"].Ties);
    }

    [Fact]
    public void ApplyWinAndTieCounts_OmitsCountsWithoutPairedValues()
    {
        var aggregate = Aggregate("score");

        ComparisonMetricCalculator.ApplyWinAndTieCounts(
            aggregate,
            ByRef(("candidate-only", 1m)),
            ByRef(("baseline-only", 1m)),
            new Dictionary<string, MetricDefinition>());

        Assert.Null(aggregate.Metrics!["score"].Wins);
        Assert.Null(aggregate.Metrics["score"].Ties);
    }

    private static Result Aggregate(string metricName) => new()
    {
        Metrics = new Dictionary<string, Metric>
        {
            [metricName] = new() { Value = 1m },
        },
    };

    private static IDictionary<string, Result> ByRef(
        params (string Reference, decimal Value)[] values)
    {
        var results = new Dictionary<string, Result>();
        foreach (var (reference, value) in values)
        {
            results[reference] = new Result
            {
                Ref = reference,
                Metrics = new Dictionary<string, Metric>
                {
                    ["score"] = new() { Value = value },
                    ["latency"] = new() { Value = value },
                },
            };
        }
        return results;
    }
}
