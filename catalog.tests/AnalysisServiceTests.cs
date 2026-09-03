using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class AnalysisServiceTests
{
    [Fact]
    public async Task GetMeaningfulTagsAsync_AppliesDerivedMetricBeforeComparingTags()
    {
        var experiment = new Experiment
        {
            Name = "experiment",
            Hypothesis = "Derived metrics identify meaningful tag differences.",
            Results =
            [
                CreateResult("q1", 2m),
                CreateResult("q2", 4m),
            ],
        };
        var tags = new List<Tag>
        {
            new() { Name = "low", Refs = ["q1"] },
            new() { Name = "high", Refs = ["q2"] },
        };
        var service = new AnalysisService(
            new TestStorageService(experiment, tags),
            new AverageDerivedMetricService());

        var response = await service.GetMeaningfulTagsAsync(new MeaningfulTagsRequest
        {
            Project = "project",
            Experiment = "experiment",
            Set = "candidate",
            Metric = "derived_score",
            CompareTo = MeaningfulTagsComparisonMode.Average,
        });

        var diffs = response.Tags!.ToDictionary(diff => diff.Tag);
        Assert.Equal(-1m, diffs["low"].Diff);
        Assert.Equal(1m, diffs["high"].Diff);
        Assert.Equal(1, diffs["low"].Count);
        Assert.Equal(1, diffs["high"].Count);
    }

    private static Result CreateResult(string reference, decimal score) => new()
    {
        Set = "candidate",
        Ref = reference,
        Metrics = new Dictionary<string, Metric>
        {
            ["score"] = new() { Value = score },
        },
    };

    private sealed class AverageDerivedMetricService : IDerivedMetricService
    {
        public Task ApplyAsync(
            IReadOnlyCollection<DerivedMetricGroup> groups,
            IReadOnlyDictionary<string, MetricDefinition> metricDefinitions,
            CancellationToken cancellationToken = default)
        {
            foreach (var group in groups)
            {
                var values = group.Results
                    .Select(result => result.Metrics!["score"].Value!.Value)
                    .ToList();
                group.Target.Metrics!["derived_score"] = new Metric
                {
                    Value = values.Average(),
                    Count = values.Count,
                };
            }
            return Task.CompletedTask;
        }
    }

    private sealed class TestStorageService(
        Experiment experiment,
        IList<Tag> tags) : IStorageService
    {
        public Task<Experiment> GetExperimentAsync(
            string projectName,
            string experimentName,
            bool includeResults = true,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(experiment);

        public Task<IList<MetricDefinition>> GetMetricsAsync(
            string projectName,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IList<MetricDefinition>>([]);

        public Task<IList<string>> ListTagsAsync(
            string projectName,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IList<string>>(tags.Select(tag => tag.Name).ToList());

        public Task<IList<Tag>> GetTagsAsync(
            string projectName,
            IEnumerable<string> requestedTags,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IList<Tag>>(
                tags.Where(tag => requestedTags.Contains(tag.Name)).ToList());

        public bool TryValidProjectName(string? projectName, out string? errorMessage) =>
            throw new NotSupportedException();

        public bool TryValidExperimentName(string? experimentName, out string? errorMessage) =>
            throw new NotSupportedException();

        public Task<IList<Project>> GetProjectsAsync(CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddProjectAsync(Project project, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddTagAsync(
            string projectName,
            Tag tag,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddMetricsAsync(
            string projectName,
            IList<MetricDefinition> metrics,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IList<Experiment>> GetExperimentsAsync(
            string projectName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddExperimentAsync(
            string projectName,
            Experiment experimentToAdd,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task SetExperimentAsBaselineAsync(
            string projectName,
            string experimentName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task SetBaselineForExperiment(
            string projectName,
            string experimentName,
            string setName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddResultAsync(
            string projectName,
            string experimentName,
            Result result,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task AddStatisticsAsync(
            string projectName,
            string experimentName,
            Statistics statistics,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<Experiment> GetProjectBaselineAsync(
            string projectName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task OptimizeExperimentAsync(
            string projectName,
            string experimentName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<Stream> DownloadExperimentAsync(
            string projectName,
            string experimentName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
