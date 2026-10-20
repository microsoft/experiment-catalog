interface Comparison {
    metric_definitions: Record<string, MetricDefinition>;
    project_baseline?: ComparisonEntity;
    experiment_baseline?: ComparisonEntity;
    comparison_target?: ComparisonEntity;
    ref_filter_refs?: string[];
    sets?: ComparisonEntity[];
}