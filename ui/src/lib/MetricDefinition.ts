interface MetricDefinition {
    name: string;
    min: number | null;
    max: number | null;
    aggregate_function: 'Default' | 'Average' | 'Recall' | 'Precision' | 'Accuracy' | 'Count' | 'Cost';
    order: number;
    is_important?: boolean;
    tags: string[];
}