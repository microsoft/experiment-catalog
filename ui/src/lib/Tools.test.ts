import { describe, expect, it } from "vitest";
import {
    encodeConfig,
    decodeConfig,
    sanitizeProjectTagQuerystring,
    sanitizeTagQuerystring,
    sortMetrics,
    type ViewConfig,
} from "./Tools";

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

    it("encodes show_important_only true", () => {
        const cfg: ViewConfig = { show_important_only: true };
        const encoded = encodeConfig(cfg);
        const decoded = decodeConfig(encoded!);
        expect(decoded.show_important_only).toBe(true);
    });

    it("encodes show_important_only false", () => {
        const cfg: ViewConfig = { show_important_only: false };
        const encoded = encodeConfig(cfg);
        const decoded = decodeConfig(encoded!);
        expect(decoded.show_important_only).toBe(false);
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

describe("sanitizeTagQuerystring", () => {
    it("removes include and exclude tags that are not available", () => {
        expect(
            sanitizeTagQuerystring(
                "include-tags=known,missing&exclude-tags=other,stale",
                ["known", "other"],
            ),
        ).toBe("include-tags=known&exclude-tags=other");
    });

    it("returns empty string when no selected tags exist in the project", () => {
        expect(sanitizeTagQuerystring("include-tags=stale", [])).toBe("");
    });
});

describe("sanitizeProjectTagQuerystring", () => {
    it("loads tags for the current project before sanitizing", async () => {
        const calls: string[] = [];
        const sanitized = await sanitizeProjectTagQuerystring(
            "project-a",
            "include-tags=known,stale",
            async (projectName) => {
                calls.push(projectName);
                return ["known"];
            },
        );

        expect(calls).toEqual(["project-a"]);
        expect(sanitized).toBe("include-tags=known");
    });

    it("does not load tags when there is no tag querystring", async () => {
        let called = false;
        const sanitized = await sanitizeProjectTagQuerystring(
            "project-a",
            "",
            async () => {
                called = true;
                return [];
            },
        );

        expect(called).toBe(false);
        expect(sanitized).toBe("");
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
