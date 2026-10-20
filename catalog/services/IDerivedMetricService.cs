using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Catalog;

public interface IDerivedMetricService
{
    Task ApplyAsync(
        IReadOnlyCollection<DerivedMetricGroup> groups,
        IReadOnlyDictionary<string, MetricDefinition> metricDefinitions,
        CancellationToken cancellationToken = default);
}

public sealed record DerivedMetricGroup(
    string Id,
    IReadOnlyCollection<Result> Results,
    Result Target);

