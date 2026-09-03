interface MetricDefinition {
    name: string;
    description?: string;
    min: number | null;
    max: number | null;
    aggregate_function: 'Default' | 'Average' | 'AverageByRef' | 'Recall' | 'Precision' | 'F1' | 'MicroPrecision' | 'MicroRecall' | 'MicroF1' | 'MacroPrecision' | 'MacroRecall' | 'MacroF1' | 'Accuracy' | 'Count' | 'Cost';
    order: number;
    is_important?: boolean;
    tags: string[];
}