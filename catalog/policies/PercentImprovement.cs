// EX. At least 60% of results are improved by 2% or more (metrics: x, y, z).

using System.Collections.Generic;

namespace Catalog;

public class PercentImprovement
{
    private readonly string policyName = "PercentImprovement";
    private readonly decimal requiredImprovement = 0.02m;
    private readonly decimal requiredPercent = 0.6m;
    private readonly List<string> includeMetrics = ["ndcg", "bertscore", "groundedness"];

    public int NumResultsThatPassed { get; set; } = 0;
    public int NumResultsThatFailed { get; set; } = 0;
    public decimal PercentPassed => this.NumResultsThatPassed + this.NumResultsThatFailed == 0
        ? 0
        : (decimal)this.NumResultsThatPassed / (this.NumResultsThatPassed + this.NumResultsThatFailed);
    public bool IsPassed => this.PercentPassed >= this.requiredPercent;
    public string Requirement => $"At least {this.requiredPercent:P0} of results are improved by {this.requiredImprovement:P0} or more (metrics: {string.Join(", ", this.includeMetrics)}).";
    public string Actual => $"{this.PercentPassed:P0} of results were improved by {this.requiredImprovement:P0} or more (metrics: {string.Join(", ", this.includeMetrics)}).";

    public void Evaluate(Result evaluating, Result baseline, Dictionary<string, MetricDefinition> definitions)
    {
        if (evaluating.Metrics is null || baseline.Metrics is null)
        {
            return;
        }

        int pass = 0;
        int fail = 0;
        foreach (var metricName in this.includeMetrics)
        {
            if (evaluating.Metrics.TryGetValue(metricName, out var evaluatingMetric)
                && baseline.Metrics.TryGetValue(metricName, out var baselineMetric)
                && definitions.TryGetValue(metricName, out var definition)
                && definition.TryNormalize(evaluatingMetric.Value, out var evaluatingNormalized)
                && definition.TryNormalize(baselineMetric.Value, out var baselineNormalized)
                && baselineNormalized != 0)
            {
                var improvement = (evaluatingNormalized - baselineNormalized) / baselineNormalized;
                if (improvement >= this.requiredImprovement)
                {
                    pass++;
                }
                else
                {
                    fail++;
                }
            }
        }

        evaluating.PolicyResults ??= new Dictionary<string, PolicyResult>();
        evaluating.PolicyResults[this.policyName] = new PolicyResult { Pass = pass, Fail = fail };

        if (fail > 0)
        {
            this.NumResultsThatFailed++;
        }
        else if (pass > 0)
        {
            this.NumResultsThatPassed++;
        }
    }
}