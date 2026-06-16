# Experiment Catalog Analysis

Use this reference to answer questions about experiment performance and catalog content.

## Fast Analysis Path

1. Determine project and experiment.
2. Call aggregate comparison.
3. Identify important metrics, directionality, counts, and available p-values.
4. If the aggregate is unclear, analyze meaningful tags or per-ref results.
5. Produce a decision-focused summary: improved, regressed, mixed, inconclusive, or needs more iterations/statistics.

## Aggregate Comparison

MCP:

```text
CompareExperiment(project, experiment, includeTags = "", excludeTags = "")
```

REST:

```http
GET /api/projects/{project}/experiments/{experiment}/compare
GET /api/projects/{project}/experiments/{experiment}/compare?include-tags=tag1,tag2&exclude-tags=tag3
```

Response shape:

- `metric_definitions`: metric metadata keyed by metric name.
- `project_baseline`: aggregate project baseline entity.
- `experiment_baseline`: aggregate experiment baseline entity.
- `sets`: aggregate result for each set/permutation.

Each entity contains project, experiment, optional set, aggregate result, and count. Each result contains metric objects with `value`, `normalized`, `count`, `std_dev`, `p_value`, `ci_lower`, `ci_upper`, or `classification`.

## Per-Ref Comparison

Use only when the user asks about individual ground truths, failing examples, refs, or regressions.

MCP:

```text
CompareByRef(project, experiment, set, includeTags = "", excludeTags = "")
```

REST:

```http
GET /api/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref
GET /api/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref?include-tags=tag1&exclude-tags=tag2
```

Compare each ref's `experiment_set` metrics to `experiment_baseline` or `project_baseline`. Report the largest deltas and the ref IDs.

## Raw Set Details

Use for iteration-level diagnosis, source URI tracing, annotation inspection, missing metric investigation, or reproducibility checks.

MCP:

```text
GetNamedSet(project, experiment, set, includeTags = "", excludeTags = "")
```

REST:

```http
GET /api/projects/{project}/experiments/{experiment}/sets/{set}
```

## Statistics

MCP:

```text
CalculateStatistics(project, experiment)
```

REST:

```http
POST /api/analysis/statistics
Content-Type: application/json

{"project":"project-example","experiment":"experiment-000"}
```

This enqueues bootstrap p-value/statistics calculation. Do not claim statistical significance until comparison output includes p-values or the user accepts a qualitative result.

Recommended interpretation:

- `p_value < 0.05`: usually meaningful at 95% confidence.
- `p_value >= 0.05`: inconclusive; mention direction but avoid significance claims.
- missing p-value: statistics not calculated, not enough iterations, or unsupported metric.

Always consider result counts and iteration counts; low counts reduce confidence.

## Meaningful Tags

Use this to explain which subsets most affect a metric.

MCP:

```text
MeaningfulTags(project, experiment, set, metric, excludeTags = [], compareTo = Baseline)
```

REST:

```http
POST /api/analysis/meaningful-tags
Content-Type: application/json

{
  "project": "project-example",
  "experiment": "experiment-000",
  "set": "set-000",
  "metric": "generation_correctness",
  "exclude_tags": ["split:validation"],
  "compare_to": "Baseline"
}
```

Comparison modes:

- `Baseline`: compare tag subset to the baseline.
- `Zero`: compare tag subset to zero.
- `Average`: compare tag subset to the whole experiment average.

Response:

- `tags[].tag`
- `tags[].impact`
- `tags[].diff`
- `tags[].count`

Prioritize high absolute impact with enough count to matter.

## Free Filter Semantics

The UI supports filter expressions for current set results:

```text
[generation_correctness] < 0.8
[generation_correctness] < [baseline.generation_correctness]
[retrieval_recall] < [baseline.retrieval_recall] AND [generation_correctness] > [baseline.generation_correctness]
ref == "TQ10" OR ref == "TQ25"
[generation_correctness] == null AND [baseline.generation_correctness] != null
```

Supported concepts:

- `[metric_name]`: current set metric.
- `[baseline.metric_name]`: baseline metric.
- `ref`: ground-truth identifier.
- Operators: `<`, `<=`, `>`, `>=`, `==`, `!=`, `===`.
- Logic: `AND`, `OR`, parentheses.
- Missing checks: `null`, `undefined`.

Use these expressions when instructing a user how to reproduce an analysis in the UI.

## Summary Template

Use compact summaries:

```text
Decision: <approve | reject | investigate | inconclusive>
Basis: <important metric deltas, directionality, counts, p-values>
Best set: <set> because <reason>
Regressions: <metric/ref/tag details>
Follow-up: <statistics, more iterations, tag drilldown, specific refs>
```

Do not overstate. If metrics trade off, say which metric priority drives the recommendation.
