using System;
using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ArtifactManifestServiceTests
{
    [Fact]
    public void CreateRows_FiltersTypesSetsAndDuplicateUris()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "test",
            Results =
            [
                CreateResult("set-a", "ref-1", "https://example/inference-1.json", "https://example/evaluation-1.json"),
                CreateResult("set-a", "ref-1", "https://example/inference-1.json", null),
                CreateResult("set-b", "ref-1", "https://example/inference-2.json", null),
            ],
        };
        var types = new HashSet<string>(["inference"], StringComparer.OrdinalIgnoreCase);

        var rows = ArtifactManifestService.CreateRows(experiment, types, "set-a");

        var row = Assert.Single(rows);
        Assert.Equal("inference", row.Type);
        Assert.Equal("set-a", row.Set);
        Assert.Equal("ref-1", row.Ref);
        Assert.Equal(1, row.Iteration);
        Assert.Equal("https://example/inference-1.json", row.Uri);
    }

    [Fact]
    public void ToJsonLines_ProducesOneObjectPerLine()
    {
        var rows = new List<ArtifactManifestRow>
        {
            new()
            {
                Type = "evaluation",
                Set = "set-a",
                Ref = "ref-1",
                Iteration = 2,
                Uri = "https://example/evaluation.json",
            },
        };

        var jsonLines = ArtifactManifestService.ToJsonLines(rows);

        Assert.Equal(
            $"{{\"type\":\"evaluation\",\"set\":\"set-a\",\"ref\":\"ref-1\",\"iteration\":2,\"uri\":\"https://example/evaluation.json\"}}{Environment.NewLine}",
            jsonLines);
    }

    private static Result CreateResult(
        string set,
        string reference,
        string? inferenceUri,
        string? evaluationUri) => new()
        {
            Set = set,
            Ref = reference,
            InferenceUri = inferenceUri,
            EvaluationUri = evaluationUri,
            Metrics = new Dictionary<string, Metric>
            {
                ["score"] = new() { Value = 1m },
            },
        };
}
