using System;
using System.Linq;
using Catalog;
using Newtonsoft.Json;
using Xunit;

namespace Catalog.Tests;

public class HiddenSetTests
{
    [Fact]
    public void HideMarkerExcludesSetFromListsWithoutRemovingResults()
    {
        var experiment = new Experiment { Name = "experiment", Hypothesis = "test" };
        experiment.ApplyStorageRecord("{\"x\":\"R\",\"set\":\"old\",\"ref\":\"a\"}");
        experiment.ApplyStorageRecord("{\"x\":\"R\",\"set\":\"new\",\"ref\":\"b\"}");
        experiment.ApplyStorageRecord("{\"x\":\"X\",\"set\":\"old\"}");
        experiment.ApplyStorageRecord("{\"x\":\"R\",\"set\":\"old\",\"ref\":\"c\"}");

        Assert.Equal(["new"], experiment.Sets);
        Assert.Equal("new", experiment.FirstSet);
        Assert.Equal("new", experiment.LastSet);
        Assert.Equal(3, experiment.Results?.Count);
        Assert.Equal(2, experiment.Results?.Count(result => result.Set == "old"));
        Assert.Empty(experiment.Statistics ?? []);
        Assert.DoesNotContain("HiddenSets", JsonConvert.SerializeObject(experiment));
    }

    [Fact]
    public void HideMarkerDoesNotBecomeAResultOrStatistic()
    {
        var experiment = new Experiment { Name = "experiment", Hypothesis = "test" };
        experiment.ApplyStorageRecord("{\"x\":\"X\",\"set\":\"old\"}");
        experiment.ApplyStorageRecord("{\"x\":\"P\",\"set\":\"old\"}");

        Assert.Empty(experiment.Results ?? []);
        Assert.Single(experiment.Statistics!);
        Assert.Contains("old", experiment.HiddenSets);
    }

    [Fact]
    public void InvalidHideMarkerFailsInsteadOfCreatingAnUnnamedSet()
    {
        var experiment = new Experiment { Name = "experiment", Hypothesis = "test" };
        Assert.ThrowsAny<JsonException>(() => experiment.ApplyStorageRecord("{\"x\":\"X\"}"));
        Assert.Empty(experiment.Results ?? []);
    }
}
