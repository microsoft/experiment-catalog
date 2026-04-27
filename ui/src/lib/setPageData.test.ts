import { describe, expect, it } from "vitest";
import {
    buildRefMap,
    extractByRefMetrics,
    filterRefs,
    extractMetricDefinitions,
    resolveSelectedMetrics,
} from "./setPageData";

// Minimal stubs ──────────────────────────────────────────────────────────────

function makeResult(ref: string, set: string): Result {
    return { ref, set, metrics: {} } as unknown as Result;
}

function makeByRef(
    overrides: Partial<ComparisonByRef> = {},
): ComparisonByRef {
    return {
        metric_definitions: {},
        project_baseline: undefined,
        experiment_baseline: undefined,
        experiment_set: undefined,
        ...overrides,
    } as ComparisonByRef;
}

// ── buildRefMap ─────────────────────────────────────────────────────────────

describe("buildRefMap", () => {
    it("returns empty map for undefined input", () => {
        expect(buildRefMap(undefined).size).toBe(0);
    });

    it("groups results by ref", () => {
        const results = [
            makeResult("r1", "s1"),
            makeResult("r1", "s2"),
            makeResult("r2", "s1"),
        ];
        const map = buildRefMap(results);
        expect(map.get("r1")).toHaveLength(2);
        expect(map.get("r2")).toHaveLength(1);
    });
});

// ── extractByRefMetrics ─────────────────────────────────────────────────────

describe("extractByRefMetrics", () => {
    it("deduplicates metrics across all entities", () => {
        const comparison = makeByRef({
            project_baseline: {
                results: { r1: { metrics: { a: {}, b: {} } } },
            } as any,
            experiment_set: {
                results: { r1: { metrics: { b: {}, c: {} } } },
            } as any,
        });
        const metrics = extractByRefMetrics(comparison);
        expect(new Set(metrics).size).toBe(3);
    });
});

// ── filterRefs ──────────────────────────────────────────────────────────────

describe("filterRefs", () => {
    const refs = ["r1", "r2", "r3"];
    const comparison = makeByRef();

    it("returns all refs when no filter function provided", () => {
        expect(filterRefs(refs, comparison)).toEqual(["r1", "r2", "r3"]);
    });

    it("filters refs using the provided function", () => {
        const fn = () => false;
        expect(filterRefs(refs, comparison, fn)).toEqual([]);
    });
});

// ── extractMetricDefinitions ────────────────────────────────────────────────

describe("extractMetricDefinitions", () => {
    it("returns definitions for known metrics, skipping unknown", () => {
        const comparison = makeByRef({
            metric_definitions: {
                a: { order: 1 } as MetricDefinition,
            } as any,
        });
        const defs = extractMetricDefinitions(comparison, ["a", "unknown"]);
        expect(defs).toHaveLength(1);
    });
});

// ── resolveSelectedMetrics ──────────────────────────────────────────────────

describe("resolveSelectedMetrics", () => {
    it("returns config metrics filtered to available ones", () => {
        expect(
            resolveSelectedMetrics(["a", "missing"], ["a", "b", "c"], 3),
        ).toEqual(["a"]);
    });

    it("selects all when ≤10 definitions and no config", () => {
        expect(resolveSelectedMetrics(undefined, ["a", "b"], 2)).toEqual([
            "a",
            "b",
        ]);
    });

    it("selects none when >10 definitions and no config", () => {
        const many = Array.from({ length: 12 }, (_, i) => `m${i}`);
        expect(resolveSelectedMetrics(undefined, many, 12)).toEqual([]);
    });
});
