interface Comparison {
    metric_definitions: Record<string, MetricDefinition>;
    project_baseline?: ComparisonEntity;
    experiment_baseline?: ComparisonEntity;
    sets?: ComparisonEntity[];
}