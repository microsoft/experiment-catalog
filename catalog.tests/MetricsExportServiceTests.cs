using System;
using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class MetricsExportServiceTests
{
    [Fact]
    public void CreateRows_ReturnsRawMetricsWithIterationsAndNoAnnotationRecords()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "test",
            Results =
            [
                CreateResult("set-a", "ref-1", ("score", new Metric { Value = 0.8m })),
                new Result
                {
                    Set = "set-a",
                    Annotations = [new Annotation { Text = "annotation" }],
                },
                CreateResult(
                    "set-a",
                    "ref-1",
                    ("score", new Metric { Value = 0.9m }),
                    ("accuracy", new Metric { Classification = "t+" })),
                CreateResult("set-b", "ref-1", ("score", new Metric { Value = 0.7m })),
            ],
        };

        var rows = MetricsExportService.CreateRows(experiment);

        Assert.Collection(
            rows,
            row =>
            {
                Assert.Equal("set-a", row.Set);
                Assert.Equal("ref-1", row.Ref);
                Assert.Equal(1, row.Iteration);
                Assert.Equal(0.8m, row.Metrics["score"]);
            },
            row =>
            {
                Assert.Equal("set-a", row.Set);
                Assert.Equal("ref-1", row.Ref);
                Assert.Equal(2, row.Iteration);
                Assert.Equal(0.9m, row.Metrics["score"]);
                Assert.Equal("t+", row.Metrics["accuracy"]);
            },
            row =>
            {
                Assert.Equal("set-b", row.Set);
                Assert.Equal("ref-1", row.Ref);
                Assert.Equal(1, row.Iteration);
            });
    }

    [Fact]
    public void CreateRows_FiltersToRequestedSet()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "test",
            Results =
            [
                CreateResult("set-a", "ref-1", ("score", new Metric { Value = 1m })),
                CreateResult("set-b", "ref-1", ("score", new Metric { Value = 2m })),
            ],
        };

        var row = Assert.Single(MetricsExportService.CreateRows(experiment, "set-b"));

        Assert.Equal("set-b", row.Set);
        Assert.Equal(2m, row.Metrics["score"]);
    }

    [Fact]
    public void CreateRows_AssignsIterationsBeforeFilteringMetriclessResults()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "test",
            Results =
            [
                new Result
                {
                    Set = "set-a",
                    Ref = "ref-1",
                    InferenceUri = "https://example/inference.json",
                },
                CreateResult("set-a", "ref-1", ("score", new Metric { Value = 1m })),
            ],
        };

        var row = Assert.Single(MetricsExportService.CreateRows(experiment));

        Assert.Equal(2, row.Iteration);
    }

    [Fact]
    public void ToCsv_CreatesWideTableWithStableMetricColumnsAndEscaping()
    {
        var rows = new List<MetricsExportRow>
        {
            new()
            {
                Set = "set-a",
                Ref = "ref,1",
                Iteration = 1,
                Metrics = new Dictionary<string, object>
                {
                    ["score"] = 0.8m,
                    ["accuracy"] = "t+",
                },
            },
            new()
            {
                Set = "set-a",
                Ref = "ref-2",
                Iteration = 1,
                Metrics = new Dictionary<string, object>
                {
                    ["score"] = 0.9m,
                },
            },
        };

        var csv = MetricsExportService.ToCsv(rows);

        Assert.Equal(
            $"set,ref,iteration,accuracy,score{Environment.NewLine}" +
            $"set-a,\"ref,1\",1,t+,0.8{Environment.NewLine}" +
            $"set-a,ref-2,1,,0.9{Environment.NewLine}",
            csv);
    }

    [Fact]
    public void CreateRowsAndToCsv_PreserveRetrievalValues()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "test",
            Results =
            [
                new Result
                {
                    Set = "set-a",
                    Ref = "ref-1",
                    Metrics = new Dictionary<string, Metric>
                    {
                        ["retrieval"] = new()
                        {
                            Retrieval = new RetrievalValue
                            {
                                Found = ["A", "B"],
                                Expected = ["B", "C"],
                            },
                        },
                    },
                },
            ],
        };

        var rows = MetricsExportService.CreateRows(experiment);
        var retrieval = Assert.IsType<RetrievalValue>(Assert.Single(rows).Metrics["retrieval"]);
        var csv = MetricsExportService.ToCsv(rows);

        Assert.Equal(["A", "B"], retrieval.Found);
        Assert.Equal(
            $"set,ref,iteration,retrieval.found,retrieval.expected{Environment.NewLine}" +
            $"set-a,ref-1,1,\"[\"\"A\"\",\"\"B\"\"]\",\"[\"\"B\"\",\"\"C\"\"]\"{Environment.NewLine}",
            csv);
    }

    [Fact]
    public void ToCsv_DisambiguatesReservedMetricNames()
    {
        var rows = new List<MetricsExportRow>
        {
            new()
            {
                Set = "set-a",
                Ref = "ref-1",
                Iteration = 1,
                Metrics = new Dictionary<string, object>
                {
                    ["set"] = 1m,
                },
            },
        };

        var csv = MetricsExportService.ToCsv(rows);

        Assert.StartsWith("set,ref,iteration,metric.set", csv);
    }

    private static Result CreateResult(
        string set,
        string reference,
        params (string Name, Metric Metric)[] metrics)
    {
        var values = new Dictionary<string, Metric>();
        foreach (var (name, metric) in metrics) values[name] = metric;

        return new Result
        {
            Set = set,
            Ref = reference,
            Metrics = values,
        };
    }
}
