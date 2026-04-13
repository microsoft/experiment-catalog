interface MetricDefinition {
    name: string;
    min: number;
    max: number;
    aggregate_function: 'Default' | 'Average' | 'Recall' | 'Precision' | 'Accuracy' | 'Count' | 'Cost';
    order: number;
    tags: string[];
}