import { describe, expect, it } from "vitest";
import { encodeConfig, decodeConfig, sortMetrics, type ViewConfig } from "./Tools";

// ── encodeConfig / decodeConfig round-trip ──────────────────────────────────

describe("encodeConfig", () => {
    it("returns null for an empty config", () => {
        expect(encodeConfig({})).toBeNull();
    });

    it("returns null when all values are undefined or empty", () => {
        expect(
            encodeConfig({ checked_metrics: "", metrics: [], tags: "" }),
        ).toBeNull();
    });

    it("encodes a config with checked_metrics", () => {
        const encoded = encodeConfig({ checked_metrics: "accuracy,f1" });
        expect(encoded).toBeTruthy();
        expect(decodeConfig(encoded!)).toEqual({
            checked_metrics: "accuracy,f1",
        });
    });

    it("encodes boolean toggle values", () => {
        const cfg: ViewConfig = { show_val: false, show_std: true };
        const encoded = encodeConfig(cfg);
        const decoded = decodeConfig(encoded!);
        expect(decoded.show_val).toBe(false);
        expect(decoded.show_std).toBe(true);
    });

    it("preserves metrics array", () => {
        const cfg: ViewConfig = { metrics: ["a", "b", "c"] };
        const encoded = encodeConfig(cfg);
        expect(decodeConfig(encoded!).metrics).toEqual(["a", "b", "c"]);
    });
});

describe("decodeConfig", () => {
    it("returns empty object for falsy input", () => {
        expect(decodeConfig("")).toEqual({});
    });

    it("returns empty object for garbage input", () => {
        expect(decodeConfig("not-base64!!!")).toEqual({});
    });
});

// ── sortMetrics ─────────────────────────────────────────────────────────────

describe("sortMetrics", () => {
    it("sorts by order when definitions exist", () => {
        const defs: Record<string, MetricDefinition> = {
            z: { order: 1 } as MetricDefinition,
            a: { order: 2 } as MetricDefinition,
        };
        const result = ["a", "z"].sort((a, b) => sortMetrics(defs, a, b));
        expect(result).toEqual(["z", "a"]);
    });

    it("falls back to alphabetical when order is equal", () => {
        const defs: Record<string, MetricDefinition> = {
            beta: { order: 1 } as MetricDefinition,
            alpha: { order: 1 } as MetricDefinition,
        };
        const result = ["beta", "alpha"].sort((a, b) => sortMetrics(defs, a, b));
        expect(result).toEqual(["alpha", "beta"]);
    });

    it("pushes metrics without definitions to the end", () => {
        const defs: Record<string, MetricDefinition> = {
            a: { order: 1 } as MetricDefinition,
        };
        const result = ["unknown", "a"].sort((a, b) => sortMetrics(defs, a, b));
        expect(result).toEqual(["a", "unknown"]);
    });

    it("handles undefined definitions record", () => {
        const result = ["c", "a", "b"].sort((a, b) =>
            sortMetrics(undefined as any, a, b),
        );
        expect(result).toEqual(["a", "b", "c"]);
    });
});
