import { describe, expect, it } from "vitest";
import { extractSortedMetrics, buildSelectedEntities } from "./comparisonData";

// Minimal stubs matching the global Comparison / ComparisonEntity types
function makeComparison(overrides: Partial<Comparison> = {}): Comparison {
    return {
        metric_definitions: {},
        project_baseline: undefined,
        experiment_baseline: undefined,
        sets: [],
        ...overrides,
    } as Comparison;
}

function makeEntity(set: string, metricNames: string[]): ComparisonEntity {
    const metrics: Record<string, unknown> = {};
    for (const name of metricNames) {
        metrics[name] = { value: 1 };
    }
    return { set, result: { metrics } } as unknown as ComparisonEntity;
}

// ── extractSortedMetrics ────────────────────────────────────────────────────

describe("extractSortedMetrics", () => {
    it("returns empty array when there are no metrics", () => {
        expect(extractSortedMetrics(makeComparison())).toEqual([]);
    });

    it("deduplicates metrics across baselines and sets", () => {
        const comparison = makeComparison({
            project_baseline: makeEntity("pb", ["accuracy", "f1"]),
            experiment_baseline: makeEntity("eb", ["f1", "latency"]),
            sets: [makeEntity("s1", ["accuracy", "recall"])],
        });
        const result = extractSortedMetrics(comparison);
        expect(result).toHaveLength(4);
        expect(new Set(result).size).toBe(4);
    });

    it("sorts by metric_definitions order", () => {
        const comparison = makeComparison({
            metric_definitions: {
                z: { order: 1 } as MetricDefinition,
                a: { order: 2 } as MetricDefinition,
            } as Record<string, MetricDefinition>,
            sets: [makeEntity("s1", ["a", "z"])],
        });
        expect(extractSortedMetrics(comparison)).toEqual(["z", "a"]);
    });
});

// ── buildSelectedEntities ───────────────────────────────────────────────────

describe("buildSelectedEntities", () => {
    it("selects last N sets when no setList is provided", () => {
        const comparison = makeComparison({
            sets: [
                makeEntity("s1", []),
                makeEntity("s2", []),
                makeEntity("s3", []),
            ],
        });
        const { selected } = buildSelectedEntities(comparison, undefined, 2);
        expect(selected.map((s) => s?.set)).toEqual(["s2", "s3"]);
    });

    it("selects entities matching setList names", () => {
        const comparison = makeComparison({
            sets: [
                makeEntity("alpha", []),
                makeEntity("beta", []),
                makeEntity("gamma", []),
            ],
        });
        const { selected, reconciledSetList } = buildSelectedEntities(
            comparison,
            "alpha,gamma",
            3,
        );
        expect(selected[0]?.set).toBe("alpha");
        expect(selected[1]?.set).toBe("gamma");
        expect(reconciledSetList).toContain("alpha");
        expect(reconciledSetList).toContain("gamma");
    });

    it("pads with null when setList has fewer entries than compareCount", () => {
        const comparison = makeComparison({
            sets: [makeEntity("a", [])],
        });
        const { selected } = buildSelectedEntities(comparison, "a", 3);
        expect(selected).toHaveLength(3);
        expect(selected[0]?.set).toBe("a");
        expect(selected[1]).toBeNull();
    });
});
