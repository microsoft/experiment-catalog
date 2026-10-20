import { describe, expect, it } from "vitest";
import {
  ELAPSED_TIME_FORMAT_TAG,
  formatElapsedTime,
  formatMetricValue,
  formatNumber,
} from "./metricFormatters";

describe("formatElapsedTime", () => {
  it.each([
    [0, "0ms"],
    [150, "150ms"],
    [1_500, "1s 500ms"],
    [62_000, "1m 2s"],
    [3_900_010, "1h 5m"],
    [90_000_000, "1d 1h"],
  ])("formats %i milliseconds as %s", (value, expected) => {
    expect(formatElapsedTime(value)).toBe(expected);
  });

  it("rounds normally at the precision of the smaller displayed unit", () => {
    expect(formatElapsedTime(999.6)).toBe("1s");
    expect(formatElapsedTime(3_599_999)).toBe("1h");
  });

  it("renders negative and non-finite metric values as unavailable", () => {
    expect(formatElapsedTime(-1)).toBe("-");
    expect(formatElapsedTime(Number.NaN)).toBe("-");
    expect(formatElapsedTime(Number.POSITIVE_INFINITY)).toBe("-");
  });

  it("can format signed comparison values", () => {
    expect(formatElapsedTime(-62_000, { allowNegative: true })).toBe("-1m 2s");
  });
});

describe("formatMetricValue", () => {
  it("selects a formatter by metric-definition tag", () => {
    expect(
      formatMetricValue(
        1_500,
        [ELAPSED_TIME_FORMAT_TAG],
        (value) => value.toFixed(3),
      ),
    ).toBe("1s 500ms");
  });

  it("uses the provided fallback when no formatter tag matches", () => {
    expect(formatMetricValue(1.5, [], (value) => value.toFixed(3))).toBe("1.500");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators and preserves the requested precision", () => {
    expect(formatNumber(500_000_000)).toBe("500,000,000.000");
    expect(formatNumber(1_234_567.899, 2)).toBe("1,234,567.90");
    expect(formatNumber(1_500, 0)).toBe("1,500");
  });

  it("renders non-finite values as unavailable", () => {
    expect(formatNumber(Number.NaN)).toBe("-");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("-");
  });
});
