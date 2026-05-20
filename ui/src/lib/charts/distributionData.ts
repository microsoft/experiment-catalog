/**
 * Data transformation helpers for the distribution chart.
 * Computes box plot statistics and groups results by ref.
 */

export interface BoxStats {
    ref: string;
    values: number[];
    min: number;
    max: number;
    q1: number;
    median: number;
    q3: number;
    whiskerLow: number;
    whiskerHigh: number;
    outliers: number[];
}

export interface ChartPoint {
    ref: string;
    value: number;
    index: number;
}

/**
 * Extract metric values from results grouped by ref.
 * Only includes finite numeric values.
 */
export function groupByRef(
    results: Result[],
    refs: string[],
    metric: string,
): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const ref of refs) {
        map.set(ref, []);
    }
    for (const result of results) {
        if (!result.ref || !refs.includes(result.ref)) continue;
        const m = result.metrics?.[metric];
        if (m == null) continue;
        const v = m.value;
        if (v == null || !Number.isFinite(v)) continue;
        map.get(result.ref)!.push(v);
    }
    return map;
}

/**
 * Compute box plot statistics for a set of values.
 * Uses Tukey's method: whiskers extend to 1.5×IQR beyond Q1/Q3.
 */
export function computeBoxStats(ref: string, values: number[]): BoxStats {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    if (n === 0) {
        return {
            ref,
            values: [],
            min: 0,
            max: 0,
            q1: 0,
            median: 0,
            q3: 0,
            whiskerLow: 0,
            whiskerHigh: 0,
            outliers: [],
        };
    }

    const median = percentile(sorted, 0.5);
    const q1 = percentile(sorted, 0.25);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    const whiskerLow = sorted.find((v) => v >= lowerFence) ?? sorted[0];
    const whiskerHigh =
        [...sorted].reverse().find((v) => v <= upperFence) ?? sorted[n - 1];

    const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);

    return {
        ref,
        values: sorted,
        min: sorted[0],
        max: sorted[n - 1],
        q1,
        median,
        q3,
        whiskerLow,
        whiskerHigh,
        outliers,
    };
}

function percentile(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 1) return sorted[0];
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Build all data needed for the distribution chart.
 */
export function buildDistributionData(
    results: Result[],
    refs: string[],
    metric: string,
): { points: ChartPoint[]; boxStats: BoxStats[] } {
    const grouped = groupByRef(results, refs, metric);
    const points: ChartPoint[] = [];
    const boxStats: BoxStats[] = [];

    for (const ref of refs) {
        const values = grouped.get(ref) ?? [];
        values.forEach((value, index) => {
            points.push({ ref, value, index });
        });
        boxStats.push(computeBoxStats(ref, values));
    }

    return { points, boxStats };
}

/**
 * Deterministic jitter offset for a point, based on its index within a group.
 * Returns a value in [-0.3, 0.3] relative to band center.
 */
export function deterministicJitter(index: number, total: number): number {
    if (total <= 1) return 0;
    // Distribute points evenly across the jitter band
    const spread = Math.min(0.35, 0.1 + total * 0.005);
    // Use golden ratio to distribute points quasi-randomly but deterministically
    const golden = 0.618033988749895;
    const t = ((index * golden) % 1) * 2 - 1; // [-1, 1]
    return t * spread;
}
