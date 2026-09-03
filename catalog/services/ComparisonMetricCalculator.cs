using System;
using System.Collections.Generic;
using System.Linq;

namespace Catalog;

public static class ComparisonMetricCalculator
{
    public static void ApplyWinAndTieCounts(
        Result? aggregate,
        IDictionary<string, Result>? candidateByRef,
        IDictionary<string, Result>? baselineByRef,
        IReadOnlyDictionary<string, MetricDefinition> metricDefinitions)
    {
        if (aggregate?.Metrics is null ||
            candidateByRef is null ||
            baselineByRef is null)
        {
            return;
        }

        foreach (var (metricName, aggregateMetric) in aggregate.Metrics)
        {
            var wins = 0;
            var ties = 0;
            var paired = 0;
            var lowerIsBetter =
                metricDefinitions.TryGetValue(metricName, out var definition) &&
                definition.Tags?.Contains("lower-is-better", StringComparer.OrdinalIgnoreCase) == true;

            foreach (var (reference, candidateResult) in candidateByRef)
            {
                if (!baselineByRef.TryGetValue(reference, out var baselineResult) ||
                    candidateResult.Metrics is null ||
                    baselineResult.Metrics is null ||
                    !candidateResult.Metrics.TryGetValue(metricName, out var candidateMetric) ||
                    !baselineResult.Metrics.TryGetValue(metricName, out var baselineMetric) ||
                    candidateMetric.Value is null ||
                    baselineMetric.Value is null)
                {
                    continue;
                }

                paired++;
                var comparison = candidateMetric.Value.Value.CompareTo(baselineMetric.Value.Value);
                if (comparison == 0)
                {
                    ties++;
                }
                else if (lowerIsBetter ? comparison < 0 : comparison > 0)
                {
                    wins++;
                }
            }

            if (paired > 0)
            {
                aggregateMetric.Wins = wins;
                aggregateMetric.Ties = ties;
            }
        }
    }
}
