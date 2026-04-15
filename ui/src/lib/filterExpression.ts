/**
 * Builds a filter function from a user-supplied expression string.
 *
 * Syntax recognised by the parser:
 *   [metric]            → result.metrics["metric"].value
 *   [baseline.metric]   → baseline.metrics["metric"].value
 *   AND / OR            → && / ||
 *   ref                 → result.ref
 *
 * Returns `undefined` when the expression is empty (meaning "show all").
 */
export type ResultFilter = (baseline: any, result: any) => boolean;

export function buildFilterFunction(
    expression: string,
    metrics: string[],
): ResultFilter | undefined {
    if (!expression) return undefined;

    let funcstr = expression
        .replace(/ AND /gi, " && ")
        .replace(/ OR /gi, " || ");

    // Replace longest metric names first to avoid partial matches.
    const sorted = [...metrics].sort((a, b) => b.length - a.length);
    for (const metric of sorted) {
        funcstr = funcstr
            .replace(
                new RegExp(`\\[baseline\\.${escapeRegex(metric)}\\]`, "gi"),
                `(baseline.metrics["${metric}"] ? baseline.metrics["${metric}"].value : undefined)`,
            )
            .replace(
                new RegExp(`\\[${escapeRegex(metric)}\\]`, "gi"),
                `(result.metrics["${metric}"] ? result.metrics["${metric}"].value : undefined)`,
            );
    }

    funcstr = funcstr.replace(/ref /gi, "result.ref");

    // eslint-disable-next-line no-new-func
    const func = new Function(
        "baseline",
        "result",
        `try { return ${funcstr}; } catch (e) { console.warn("filter: " + e); return false; }`,
    ) as ResultFilter;

    return func;
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
