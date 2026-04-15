interface ComparisonByRefEntity {
    project: string,
    experiment: string,
    set?: string,
    results?: Record<string, Result>,
}