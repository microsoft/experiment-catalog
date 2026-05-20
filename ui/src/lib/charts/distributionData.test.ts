import { describe, it, expect } from "vitest";
import {
  groupByRef,
  computeBoxStats,
  buildDistributionData,
  deterministicJitter,
} from "./distributionData";

describe("groupByRef", () => {
  it("groups results by ref and extracts metric values", () => {
    const results: Result[] = [
      { ref: "a", metrics: { acc: { count: 1, value: 0.8, normalized: 0.8, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "a", metrics: { acc: { count: 1, value: 0.9, normalized: 0.9, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "b", metrics: { acc: { count: 1, value: 0.7, normalized: 0.7, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
    ];
    const grouped = groupByRef(results, ["a", "b"], "acc");
    expect(grouped.get("a")).toEqual([0.8, 0.9]);
    expect(grouped.get("b")).toEqual([0.7]);
  });

  it("filters out results with missing metric", () => {
    const results: Result[] = [
      { ref: "a", metrics: { acc: { count: 1, value: 0.8, normalized: 0.8, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "a", metrics: {}, is_baseline: false, created: new Date() },
    ];
    const grouped = groupByRef(results, ["a"], "acc");
    expect(grouped.get("a")).toEqual([0.8]);
  });

  it("only includes refs in the provided list", () => {
    const results: Result[] = [
      { ref: "a", metrics: { acc: { count: 1, value: 0.8, normalized: 0.8, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "c", metrics: { acc: { count: 1, value: 0.5, normalized: 0.5, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
    ];
    const grouped = groupByRef(results, ["a"], "acc");
    expect(grouped.has("c")).toBe(false);
    expect(grouped.get("a")).toEqual([0.8]);
  });
});

describe("computeBoxStats", () => {
  it("computes correct stats for typical data", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const stats = computeBoxStats("ref1", values);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(10);
    expect(stats.median).toBe(5.5);
    expect(stats.q1).toBe(3.25);
    expect(stats.q3).toBe(7.75);
    expect(stats.whiskerLow).toBe(1);
    expect(stats.whiskerHigh).toBe(10);
    expect(stats.outliers).toEqual([]);
  });

  it("handles empty values", () => {
    const stats = computeBoxStats("ref1", []);
    expect(stats.values).toEqual([]);
    expect(stats.median).toBe(0);
  });

  it("handles single value", () => {
    const stats = computeBoxStats("ref1", [42]);
    expect(stats.median).toBe(42);
    expect(stats.q1).toBe(42);
    expect(stats.q3).toBe(42);
  });

  it("identifies outliers", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const stats = computeBoxStats("ref1", values);
    expect(stats.outliers).toContain(100);
  });
});

describe("buildDistributionData", () => {
  it("produces points and boxStats for each ref", () => {
    const results: Result[] = [
      { ref: "a", metrics: { m: { count: 1, value: 10, normalized: 10, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "a", metrics: { m: { count: 1, value: 20, normalized: 20, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
      { ref: "b", metrics: { m: { count: 1, value: 30, normalized: 30, std_dev: 0, tags: [] } }, is_baseline: false, created: new Date() },
    ];
    const { points, boxStats } = buildDistributionData(results, ["a", "b"], "m");
    expect(points).toHaveLength(3);
    expect(boxStats).toHaveLength(2);
    expect(boxStats[0].ref).toBe("a");
    expect(boxStats[1].ref).toBe("b");
  });
});

describe("deterministicJitter", () => {
  it("returns 0 for a single point", () => {
    expect(deterministicJitter(0, 1)).toBe(0);
  });

  it("returns deterministic values", () => {
    const a = deterministicJitter(5, 20);
    const b = deterministicJitter(5, 20);
    expect(a).toBe(b);
  });

  it("stays within bounds", () => {
    for (let i = 0; i < 100; i++) {
      const j = deterministicJitter(i, 100);
      expect(j).toBeGreaterThanOrEqual(-0.5);
      expect(j).toBeLessThanOrEqual(0.5);
    }
  });
});
