/**
 * Pure data-transformation helpers for ComparisonTable.
 *
 * Extracted so they can be unit-tested independently of the Svelte component.
 */
import { sortMetrics } from "./Tools";

/**
 * Collect every unique metric key that appears anywhere in a Comparison
 * (project baseline, experiment baseline, and all sets), sorted by the
 * provided metric-definition ordering.
 */
export function extractSortedMetrics(
    comparison: Comparison,
): string[] {
    const allKeys = [
        ...Object.keys(comparison.project_baseline?.result?.metrics ?? {}),
        ...Object.keys(comparison.experiment_baseline?.result?.metrics ?? {}),
        ...(comparison.sets ?? []).flatMap((entity) =>
            Object.keys(entity.result?.metrics ?? {}),
        ),
    ];
    return [...new Set(allKeys)].sort((a, b) =>
        sortMetrics(comparison.metric_definitions, a, b),
    );
}

/**
 * Build the `selected` entities array from the current set-list string
 * and the full comparison.
 *
 * Returns the selected entities *and* the reconciled set-list string so
 * the caller can update the URL without duplicating the logic.
 */
export function buildSelectedEntities(
    comparison: Comparison,
    setList: string | undefined,
    compareCount: number,
): { selected: (ComparisonEntity | null)[]; reconciledSetList: string } {
    let selected: (ComparisonEntity | null)[] = [];

    if (setList) {
        const parts = setList.split(",");
        // Trim trailing empty entries
        while (parts.length > 0 && parts[parts.length - 1].trim() === "") {
            parts.pop();
        }
        for (let i = 0; i < Math.max(compareCount, parts.length); i++) {
            const entity =
                i < parts.length
                    ? comparison.sets?.find((s) => s.set === parts[i]) ?? null
                    : null;
            selected.push(entity);
        }
    } else {
        selected = comparison.sets?.slice(-compareCount) ?? [];
    }

    const reconciledSetList = selected
        .map((entity) => entity?.set)
        .join(",");

    return { selected, reconciledSetList };
}
