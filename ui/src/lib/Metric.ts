interface Metric {
    count: number;
    value: number;
    normalized: number;
    std_dev: number;
    p_value?: number;
    ci_lower?: number;
    ci_upper?: number;
    tags: string[];
}