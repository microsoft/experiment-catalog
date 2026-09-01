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

    [Fact]
    public void AggregateSet_AverageByRefWeightsRefsEqually()
    {
        var experiment = new Experiment
        {
            Name = "exp",
            Hypothesis = "test",
            MetricDefinitions = CreateDefinitions("score", AggregateFunctions.AverageByRef),
            Results =
            [
                CreateResult("set-a", "ref-1", 10m),
                CreateResult("set-a", "ref-2", 20m),
                CreateResult("set-a", "ref-2", 30m),
                CreateResult("set-a", "ref-2", 40m),
            ],
        };

        var metric = experiment.AggregateSet("set-a")!.Metrics!["score"];

        Assert.Equal(20m, metric.Value);
        Assert.Equal(2, metric.Count);
        Assert.Equal(10m, metric.RangeMin);
        Assert.Equal(30m, metric.RangeMax);
    }

    [Theory]
    [InlineData(AggregateFunctions.Precision, 0.75)]
    [InlineData(AggregateFunctions.Recall, 0.6)]
    [InlineData(AggregateFunctions.F1, 0.6666666666666666)]
    [InlineData(AggregateFunctions.MicroPrecision, 0.75)]
    [InlineData(AggregateFunctions.MicroRecall, 0.6)]
    [InlineData(AggregateFunctions.MicroF1, 0.6666666666666666)]
    public void AggregateSet_RetrievalMetricUsesMicroAggregation(
        AggregateFunctions aggregateFunction,
        double expected)
    {
        var experiment = CreateRetrievalExperiment(aggregateFunction);

        var metric = experiment.AggregateSet("set-a")!.Metrics!["retrieval"];

        Assert.Equal(2, metric.Count);
        Assert.Equal((decimal)expected, metric.Value!.Value, 14);
    }

    [Theory]
    [InlineData(AggregateFunctions.MacroPrecision, 0.8333333333333333)]
    [InlineData(AggregateFunctions.MacroRecall, 0.5833333333333333)]
    [InlineData(AggregateFunctions.MacroF1, 0.6666666666666666)]
    public void AggregateSet_RetrievalMetricUsesMacroAggregationAcrossRefs(
        AggregateFunctions aggregateFunction,
        double expected)
    {
        var experiment = CreateRetrievalExperiment(aggregateFunction);

        var metric = experiment.AggregateSet("set-a")!.Metrics!["retrieval"];

        Assert.Equal(2, metric.Count);
        Assert.Equal((decimal)expected, metric.Value!.Value, 14);
    }

    [Fact]
    public void AggregateSet_F1SupportsClassificationValues()
    {
        var experiment = new Experiment
        {
            Name = "exp",
            Hypothesis = "test",
            MetricDefinitions = CreateDefinitions("classification_f1", AggregateFunctions.F1),
            Results =
            [
                CreateClassificationResult("ref-1", "t+"),
                CreateClassificationResult("ref-1", "f+"),
                CreateClassificationResult("ref-2", "f-"),
            ],
        };

        var metric = experiment.AggregateSet("set-a")!.Metrics!["classification_f1"];

        Assert.Equal(0.5m, metric.Value);
    }

    [Fact]
    public void AggregateSet_RejectsAccuracyForRetrievalValues()
    {
        var experiment = CreateRetrievalExperiment(AggregateFunctions.Accuracy);

        var exception = Assert.Throws<HttpException>(() => experiment.AggregateSet("set-a"));

        Assert.Contains("requires classification values", exception.Message);
    }

    [Fact]
    public void AggregateSet_RejectsMixedRetrievalAndNumericValues()
    {
        var experiment = CreateRetrievalExperiment(AggregateFunctions.Precision);
        experiment.Results!.Add(new Result
        {
            Set = "set-a",
            Ref = "ref-3",
            Metrics = new Dictionary<string, Metric>
            {
                ["retrieval"] = new() { Value = 1m },
            },
        });

        var exception = Assert.Throws<HttpException>(() => experiment.AggregateSet("set-a"));

        Assert.Contains("must consistently use", exception.Message);
    }

    [Fact]
    public void AggregateSet_PreservesClassificationAggregationWithNumericHistory()
    {
        var experiment = new Experiment
        {
            Name = "exp",
            Hypothesis = "test",
            MetricDefinitions = CreateDefinitions("precision", AggregateFunctions.Precision),
            Results =
            [
                new Result
                {
                    Set = "set-a",
                    Ref = "ref-1",
                    Metrics = new Dictionary<string, Metric>
                    {
                        ["precision"] = new() { Classification = "t+" },
                    },
                },
                new Result
                {
                    Set = "set-a",
                    Ref = "ref-2",
                    Metrics = new Dictionary<string, Metric>
                    {
                        ["precision"] = new() { Value = 0.5m },
                    },
                },
            ],
        };

        var metric = experiment.AggregateSet("set-a")!.Metrics!["precision"];

        Assert.Equal(1m, metric.Value);
        Assert.Equal(2, metric.Count);
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

    private static Result CreateResult(string set, string reference, decimal value) => new()
    {
        Set = set,
        Ref = reference,
        Created = DateTime.UtcNow,
        Metrics = new Dictionary<string, Metric>
        {
            ["score"] = new() { Value = value },
        },
    };

    private static Experiment CreateRetrievalExperiment(AggregateFunctions aggregateFunction) => new()
    {
        Name = "exp",
        Hypothesis = "test",
        MetricDefinitions = CreateDefinitions("retrieval", aggregateFunction),
        Results =
        [
            CreateRetrievalResult(
                "ref-1",
                ["A", "B", "D"],
                ["B", "C", "D"]),
            CreateRetrievalResult(
                "ref-2",
                ["X"],
                ["X", "Y"]),
        ],
    };

    private static Dictionary<string, MetricDefinition> CreateDefinitions(
        string name,
        AggregateFunctions aggregateFunction) => new()
        {
            [name] = new MetricDefinition
            {
                Name = name,
                AggregateFunction = aggregateFunction,
            },
        };

    private static Result CreateRetrievalResult(
        string reference,
        List<string> found,
        List<string> expected) => new()
        {
            Set = "set-a",
            Ref = reference,
            Metrics = new Dictionary<string, Metric>
            {
                ["retrieval"] = new()
                {
                    Retrieval = new RetrievalValue
                    {
                        Found = found,
                        Expected = expected,
                    },
                },
            },
        };

    private static Result CreateClassificationResult(string reference, string classification) => new()
    {
        Set = "set-a",
        Ref = reference,
        Metrics = new Dictionary<string, Metric>
        {
            ["classification_f1"] = new() { Classification = classification },
        },
    };
}
