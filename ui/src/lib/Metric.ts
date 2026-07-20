interface Metric {
    count: number;
    value: number;
    normalized: number;
    std_dev: number;
    coefficient_of_variation?: number;
    range?: number;
    range_min?: number;
    range_max?: number;
    p_value?: number;
    ci_lower?: number;
    ci_upper?: number;
    tags: string[];
}