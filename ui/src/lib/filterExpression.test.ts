import { describe, expect, it } from "vitest";
import { buildFilterFunction } from "./filterExpression";

describe("buildFilterFunction", () => {
    const metrics = ["accuracy", "f1", "latency"];

    it("returns undefined for empty expression", () => {
        expect(buildFilterFunction("", metrics)).toBeUndefined();
    });

    it("evaluates a simple metric comparison", () => {
        const fn = buildFilterFunction("[accuracy] > 0.5", metrics)!;
        expect(fn).toBeDefined();

        const baseline = { metrics: {} };
        const passing = { metrics: { accuracy: { value: 0.8 } } };
        const failing = { metrics: { accuracy: { value: 0.3 } } };

        expect(fn(baseline, passing)).toBe(true);
        expect(fn(baseline, failing)).toBe(false);
    });

    it("supports baseline metric references", () => {
        const fn = buildFilterFunction(
            "[accuracy] > [baseline.accuracy]",
            metrics,
        )!;
        const baseline = { metrics: { accuracy: { value: 0.5 } } };
        const result = { metrics: { accuracy: { value: 0.7 } } };
        expect(fn(baseline, result)).toBe(true);
    });

    it("handles AND / OR operators (case-insensitive)", () => {
        const fn = buildFilterFunction(
            "[accuracy] > 0.5 AND [f1] > 0.3",
            metrics,
        )!;
        const baseline = { metrics: {} };
        const both = {
            metrics: {
                accuracy: { value: 0.8 },
                f1: { value: 0.5 },
            },
        };
        const onlyOne = {
            metrics: {
                accuracy: { value: 0.8 },
                f1: { value: 0.1 },
            },
        };
        expect(fn(baseline, both)).toBe(true);
        expect(fn(baseline, onlyOne)).toBe(false);
    });

    it("handles missing metric gracefully (returns false)", () => {
        const fn = buildFilterFunction("[accuracy] > 0.5", metrics)!;
        const baseline = { metrics: {} };
        const noMetrics = { metrics: {} };
        // undefined > 0.5 → false
        expect(fn(baseline, noMetrics)).toBe(false);
    });

    it("replaces longest metric names first to avoid partial matches", () => {
        const metricsWithOverlap = ["f1", "f1_score"];
        const fn = buildFilterFunction(
            "[f1_score] > 0.5",
            metricsWithOverlap,
        )!;
        const baseline = { metrics: {} };
        const result = { metrics: { f1_score: { value: 0.9 } } };
        expect(fn(baseline, result)).toBe(true);
    });
});
