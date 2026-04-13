using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Catalog;

public interface IStorageService
{
    bool TryValidProjectName(string? projectName, out string? errorMessage);
    bool TryValidExperimentName(string? experimentName, out string? errorMessage);
    Task<IList<Project>> GetProjectsAsync(CancellationToken cancellationToken = default);
    Task AddProjectAsync(Project project, CancellationToken cancellationToken = default);
    Task<IList<string>> ListTagsAsync(string projectName, CancellationToken cancellationToken = default);
    Task AddTagAsync(string projectName, Tag tag, CancellationToken cancellationToken = default);
    Task<IList<Tag>> GetTagsAsync(string projectName, IEnumerable<string> tags, CancellationToken cancellationToken = default);
    Task AddMetricsAsync(string projectName, IList<MetricDefinition> metrics, CancellationToken cancellationToken = default);
    Task<IList<MetricDefinition>> GetMetricsAsync(string projectName, CancellationToken cancellationToken = default);
    Task<IList<Experiment>> GetExperimentsAsync(string projectName, CancellationToken cancellationToken = default);
    Task AddExperimentAsync(string projectName, Experiment experiment, CancellationToken cancellationToken = default);
    Task SetExperimentAsBaselineAsync(string projectName, string experimentName, CancellationToken cancellationToken = default);
    Task SetBaselineForExperiment(string projectName, string experimentName, string setName, CancellationToken cancellationToken = default);
    Task AddResultAsync(string projectName, string experimentName, Result result, CancellationToken cancellationToken = default);
    Task AddStatisticsAsync(string projectName, string experimentName, Statistics statistics, CancellationToken cancellationToken = default);
    Task<Experiment> GetProjectBaselineAsync(string projectName, CancellationToken cancellationToken = default);
    Task<Experiment> GetExperimentAsync(string projectName, string experimentName, bool includeResults = true, CancellationToken cancellationToken = default);
    Task OptimizeExperimentAsync(string projectName, string experimentName, CancellationToken cancellationToken = default);
}