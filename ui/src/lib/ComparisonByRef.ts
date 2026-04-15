interface ComparisonByRef {
    metric_definitions: Record<string, MetricDefinition>;
    project_baseline: ComparisonByRefEntity,
    experiment_baseline: ComparisonByRefEntity,
    experiment_set: ComparisonByRefEntity,
}