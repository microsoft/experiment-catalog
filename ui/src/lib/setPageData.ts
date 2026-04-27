/**
 * Pure data-transformation helpers for SetPage.
 *
 * Extracted so they can be unit-tested independently of the Svelte component.
 */
import { sortMetrics } from "./Tools";

/**
 * Build a Map from `ref` → `Result[]` for O(1) lookup.
 */
export function buildRefMap(results: Result[] | undefined): Map<string, Result[]> {
    const map = new Map<string, Result[]>();
    if (!results) return map;
    for (const result of results) {
        if (!result.ref) continue;
        if (!map.has(result.ref)) {
            map.set(result.ref, []);
        }
        map.get(result.ref)!.push(result);
    }
    return map;
}

/**
 * Extract and sort all unique metric names from a ComparisonByRef object.
 */
export function extractByRefMetrics(comparison: ComparisonByRef): string[] {
    const allMetrics = [
        ...(comparison.project_baseline?.results
            ? Object.values(comparison.project_baseline.results).flatMap(
                (result) => Object.keys(result.metrics ?? {}),
            )
            : []),
        ...(comparison.experiment_baseline?.results
            ? Object.values(comparison.experiment_baseline.results).flatMap(
                (result) => Object.keys(result.metrics ?? {}),
            )
            : []),
        ...(comparison.experiment_set?.results
            ? Object.values(comparison.experiment_set.results).flatMap(
                (result) => Object.keys(result.metrics ?? {}),
            )
            : []),
    ];
    return [...new Set(allMetrics)].sort((a, b) =>
        sortMetrics(comparison.metric_definitions, a, b),
    );
}

/**
 * Filter refs using a filter function.
 */
export function filterRefs(
    masterRefs: string[],
    comparison: ComparisonByRef,
    filterFunc?: Function,
): string[] {
    if (!filterFunc) return [...masterRefs];
    return masterRefs.filter((ref) =>
        filterFunc(
            comparison.experiment_baseline?.results?.[ref],
            comparison.experiment_set?.results?.[ref],
        ),
    );
}

/**
 * Get metric definitions array from a ComparisonByRef for a given set of metric names.
 */
export function extractMetricDefinitions(
    comparison: ComparisonByRef,
    metricNames: string[],
): MetricDefinition[] {
    return metricNames
        .map((name) => comparison.metric_definitions[name])
        .filter((def) => def !== undefined);
}

/**
 * Determine which metrics should be initially selected based on config and definitions.
 */
export function resolveSelectedMetrics(
    configMetrics: string[] | undefined,
    allMetrics: string[],
    definitionCount: number,
): string[] {
    if (configMetrics?.length) {
        return configMetrics.filter((m) => allMetrics.includes(m));
    }
    if (definitionCount <= 10) {
        return allMetrics;
    }
    return [];
}
