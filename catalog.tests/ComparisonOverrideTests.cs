using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Catalog;
using Microsoft.Extensions.Logging.Abstractions;
using NetBricks;
using Newtonsoft.Json;
using Xunit;

namespace Catalog.Tests;

public class ComparisonOverrideTests
{
    [Fact]
    public async Task CompareAsync_OverrideUsesSelectedSetAndOmitsStoredStatistics()
    {
        var service = CreateService(out _);
        var defaultComparison = await service.CompareAsync("current", "experiment");
        Assert.Equal(0.01m, defaultComparison.Sets!.First(x => x.Set == "candidate").Result!.Metrics!["score"].PValue);
        Assert.Null(defaultComparison.ComparisonTarget);

        var overrideComparison = await service.CompareAsync(
            "current", "experiment", target: new ComparisonTarget("current", "other", "reference"));
        Assert.Equal("other", overrideComparison.ComparisonTarget!.Experiment);
        var candidateMetric = overrideComparison.Sets!.First(x => x.Set == "candidate").Result!.Metrics!["score"];
        Assert.Equal(4m, candidateMetric.Value);
        Assert.Null(candidateMetric.PValue);
        Assert.Equal(1, candidateMetric.Wins);
        Assert.Equal("baseline", overrideComparison.ExperimentBaseline!.Set);
    }

    [Fact]
    public async Task CompareAsync_CrossProjectIgnoresTagsOnTargetAndUsesCurrentDefinitions()
    {
        var service = CreateService(out var storage);
        var comparison = await service.CompareAsync(
            "current", "experiment", "focus", "",
            target: new ComparisonTarget("foreign", "other", "reference"));

        var candidateMetric = comparison.Sets!.First(x => x.Set == "candidate").Result!.Metrics!["score"];
        Assert.Equal(3m, candidateMetric.Value);
        Assert.Equal(6m, comparison.ComparisonTarget!.Result!.Metrics!["score"].Value);
        Assert.Equal(2, comparison.ComparisonTarget.Count);
        Assert.Equal(1, candidateMetric.Wins);
        Assert.Equal("current", Assert.Single(storage.MetricProjects));

        var sameProject = await service.CompareAsync(
            "current", "experiment", "focus", "",
            target: new ComparisonTarget("current", "other", "reference"));
        Assert.Equal(2m, sameProject.ComparisonTarget!.Result!.Metrics!["score"].Value);
    }

    [Fact]
    public async Task CompareByRefAsync_UsesSelectedTargetAndRejectsMissingSet()
    {
        var service = CreateService(out _);
        var comparison = await service.CompareByRefAsync(
            "current", "experiment", "candidate", target: new ComparisonTarget("foreign", "other", "reference"));
        Assert.Equal(2m, comparison.ComparisonTarget!.Results!["a"].Metrics!["score"].Value);
        Assert.Equal(10m, comparison.ComparisonTarget.Results["b"].Metrics!["score"].Value);
        Assert.Equal(1m, comparison.ExperimentBaseline!.Results!["a"].Metrics!["score"].Value);

        var filtered = await service.CompareByRefAsync(
            "current", "experiment", "candidate", "focus", "",
            target: new ComparisonTarget("current", "other", "reference"));
        var filteredTarget = Assert.IsType<ComparisonByRefEntity>(filtered.ComparisonTarget);
        Assert.Single(filteredTarget.Results!);
        Assert.Contains("a", filteredTarget.Results!.Keys);

        await Assert.ThrowsAsync<HttpException>(() => service.CompareAsync(
            "current", "experiment", target: new ComparisonTarget("foreign", "other", "missing")));
    }

    [Fact]
    public async Task MeaningfulTagsAsync_UsesUnfilteredCrossProjectTarget()
    {
        CreateService(out var storage);
        var analysisService = new AnalysisService(storage, new NoDerivedMetrics());
        var response = await analysisService.GetMeaningfulTagsAsync(new MeaningfulTagsRequest
        {
            Project = "current",
            Experiment = "experiment",
            Set = "candidate",
            Metric = "score",
            ComparisonTarget = new ComparisonTarget("foreign", "other", "reference"),
        });
        var tag = Assert.Single(response.Tags!);
        Assert.Equal(-3m, tag.Diff);
        Assert.Equal(-3m, tag.Impact);
    }

    [Fact]
    public async Task GetNamedSetAsync_UsesCurrentProjectDefinitionsForImportedIterations()
    {
        var service = CreateService(out var storage);
        var results = await service.GetNamedSetAsync(
            "foreign", "other", "reference", metricProject: "current");
        Assert.Equal(2, results.Count());
        Assert.Equal("current", Assert.Single(storage.MetricProjects));
    }

    [Fact]
    public void MeaningfulTagsRequest_DeserializesComparisonTarget()
    {
        var request = JsonConvert.DeserializeObject<MeaningfulTagsRequest>(
            """{"project":"current","experiment":"experiment","set":"candidate","metric":"score","comparison_target":{"project":"foreign","experiment":"other","set":"reference"}}""");
        Assert.Equal(new ComparisonTarget("foreign", "other", "reference"), request!.ComparisonTarget);
    }

    private static ExperimentService CreateService(out TestStorage storage)
    {
        var baseline = new Experiment
        {
            Name = "experiment",
            Hypothesis = "baseline",
            Results =
            [
                Row("baseline", "a", 1), Row("baseline", "b", 1),
                Row("candidate", "a", 3), Row("candidate", "b", 5),
            ],
            Statistics =
            [
                new Statistics
                {
                    BaselineExperiment = "experiment", BaselineSet = "baseline", Set = "candidate",
                    BaselineResultCount = 2, SetResultCount = 2, NumSamples = 10000, ConfidenceLevel = 0.95m,
                    Metrics = new() { ["score"] = new Metric { PValue = 0.01m } },
                },
            ],
        };
        var other = new Experiment
        {
            Name = "other",
            Hypothesis = "alternate",
            Results =
            [
                Row("reference", "a", 2), Row("reference", "b", 10),
            ],
        };
        storage = new TestStorage(baseline, other);
        return new ExperimentService(
            NullLogger<ExperimentService>.Instance,
            storage,
            new TestConfigFactory(),
            new NoDerivedMetrics());
    }

    private static Result Row(string set, string reference, decimal value) => new()
    {
        Set = set,
        Ref = reference,
        Metrics = new() { ["score"] = new Metric { Value = value } },
    };

    private sealed class TestConfigFactory : IConfigFactory<IConfig>
    {
        public Task<IConfig> GetAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IConfig>(new Config());
    }

    private sealed class NoDerivedMetrics : IDerivedMetricService
    {
        public Task ApplyAsync(
            IReadOnlyCollection<DerivedMetricGroup> groups,
            IReadOnlyDictionary<string, MetricDefinition> definitions,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class TestStorage(Experiment baseline, Experiment other) : IStorageService
    {
        public List<string> MetricProjects { get; } = [];
        public Task<Experiment> GetExperimentAsync(string project, string experiment, bool includeResults = true, CancellationToken cancellationToken = default) =>
            Task.FromResult(experiment == "other" ? other : baseline);
        public Task<Experiment> GetProjectBaselineAsync(string project, CancellationToken cancellationToken = default) =>
            Task.FromResult(baseline);
        public Task<IList<MetricDefinition>> GetMetricsAsync(string project, CancellationToken cancellationToken = default)
        {
            MetricProjects.Add(project);
            return Task.FromResult<IList<MetricDefinition>>(
                [new MetricDefinition { Name = "score", AggregateFunction = AggregateFunctions.Average, Min = 0, Max = 10 }]);
        }
        public Task<IList<Tag>> GetTagsAsync(string project, IEnumerable<string> names, CancellationToken cancellationToken = default) =>
            Task.FromResult<IList<Tag>>(names.Select(name => new Tag { Name = name, Refs = ["a"] }).ToList());
        public bool TryValidProjectName(string? name, out string? error) => throw new NotSupportedException();
        public bool TryValidExperimentName(string? name, out string? error) => throw new NotSupportedException();
        public Task<IList<Project>> GetProjectsAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Project> GetProjectAsync(string project, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task AddProjectAsync(Project project, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Project> SetProjectDisplayAsync(string project, ProjectDisplay display, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IList<string>> ListTagsAsync(string project, CancellationToken cancellationToken = default) =>
            Task.FromResult<IList<string>>(["focus"]);
        public Task AddTagAsync(string project, Tag tag, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task AddMetricsAsync(string project, IList<MetricDefinition> metrics, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IList<Experiment>> GetExperimentsAsync(string project, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task AddExperimentAsync(string project, Experiment experiment, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Experiment> SetExperimentDisplayAsync(string project, string experiment, CardDisplay display, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task SetExperimentAsBaselineAsync(string project, string experiment, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task SetBaselineForExperiment(string project, string experiment, string set, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task AddResultAsync(string project, string experiment, Result result, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task HideSetAsync(string project, string experiment, string set, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task AddStatisticsAsync(string project, string experiment, Statistics statistics, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task OptimizeExperimentAsync(string project, string experiment, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Stream> DownloadExperimentAsync(string project, string experiment, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
