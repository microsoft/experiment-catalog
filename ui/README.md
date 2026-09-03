# Catalog UI

## Metric Formatting

Metric-definition tags can opt numeric values into specialized display formats. The
underlying values remain numeric and are unchanged for storage, aggregation,
comparison, filtering, and export.

- `elapsed_time` treats the metric value as milliseconds and displays at most two
  adjacent units. For example, `1500` displays as `1s 500ms`, `62000` as `1m 2s`,
  and `3900010` as `1h 5m`. Values are rounded normally at the precision of the
  smaller displayed unit. Negative or non-finite absolute values display as
  `-`; signed comparison deltas retain their sign. This formatting is used in
  comparison values and summaries (deviation and range) and on distribution
  chart axes. Charts clamp an inferred elapsed-time axis to zero, but honor
  explicit metric-definition `min` and `max` bounds.
- Metrics without a specialized formatter use comma-separated numeric values
  while retaining the precision appropriate to their aggregate type. This
  grouped formatting applies to comparison values, counts, costs, and
  statistics; chart axes may abbreviate large values as `k` or `M`.

## Comparison Legend And Toggles

The experiment comparison page can show aggregate comparison metadata directly
in each metric cell:

- `xN` is the aggregate `count`: the number of metric observations represented
  by that aggregate.
- `(M refs)` is `unique_refs`: the number of distinct non-null refs that
  contributed to that aggregate metric.
- `WIN W` is the number of shared refs where the set's per-ref aggregate beats
  the experiment baseline's per-ref aggregate.
- `TIE T` is the number of shared refs where the set's per-ref aggregate exactly
  equals the experiment baseline's per-ref aggregate.

WIN and TIE appear alongside the other summary statistics, while the count and
unique-ref count remain at the end of the core metric display:

```text
[value] [difference] (CV ..., DEV ..., RNG ..., WIN [winning-refs],
TIE [tied-refs]) ... x[number-of-values] ([unique-refs] refs)
```

Important details:

- `WIN` is shown by default on the experiment comparison page.
- `TIE` is hidden by default until the user enables the toggle.
- Wins use metric direction from the `lower-is-better` metric-definition tag;
  when the tag is absent, higher values win.
- Ties use exact equality. Version 1 does not apply any tolerance.
- Only shared refs with numeric values on both the candidate aggregate and the
  experiment baseline aggregate are paired.
- The experiment baseline is the comparison target, so it does not show `WIN`
  or `TIE` counts for itself.
- These fields are response-only comparison metadata, not persisted metric
  values.

## Metric Descriptions In The UI

Metric definitions can include an optional `description` field. When present,
the experiment comparison page can display the text in italics on a line below
the corresponding metric row. Use the **Metric Desc** option at the beginning
of the **Show** controls to reveal these rows. The option is hidden by default
and is persisted in shared URL configuration as `show_desc`.

Descriptions are presentation metadata only. They help users understand what a
metric means, but they do not affect metric submission requirements, stored
results, aggregation behavior, or analysis semantics.

## Data And File Access

The experiment page's **download** dialog provides three data-access workflows:

- **download** retrieves the complete stored experiment JSONL.
- **export** retrieves raw per-iteration metrics as a notebook-friendly CSV.
- **manifest** retrieves JSONL containing the exact stored artifact URIs for
  inference files, evaluation files, or both. The dialog includes Python
  examples for reading metric exports and downloading artifacts directly with
  `DefaultAzureCredential`.

The dialog operates at experiment scope. Set-scoped JSON/CSV metric exports and
JSON/JSONL manifests are also available through the
[`/api/analysis` endpoints](../catalog/README.md#export-raw-metrics). Metric
CSV rows use `(set, ref, iteration)` join keys; retrieval metrics are split into
`.found` and `.expected` columns containing JSON arrays. Manifest downloads are
location lists only: the catalog does not proxy files or build ZIP archives.
The Python artifact example requires `azure-identity` and
`azure-storage-blob`, a supported `DefaultAzureCredential` login, and blob
authorization for every listed URI.

## Free Filter

The free filter allows you to narrow down ground-truth results to those meeting specific criteria. This is essential when evaluating experimentation results to identify patterns, regressions, improvements, or unexpected behaviors across your test cases.

### Basic Syntax

- **Metric values**: `[metric_name]` - Access a metric from the current experiment set
- **Baseline values**: `[baseline.metric_name]` - Access a metric from the experiment baseline
- **Raw metric fields**: `result.metrics["metric_name"].field` - Access fields such as `value`, `std_dev`, `coefficient_of_variation`, `normalized`, `p_value`, `ci_lower`, `ci_upper`, `range_min`, `range_max`, and `count`
- **Raw baseline fields**: `baseline.metrics["metric_name"].field` - Access the same fields from the experiment baseline
- **Reference ID**: `ref` - The ground-truth reference identifier
- **Operators**: `<`, `<=`, `>`, `>=`, `==`, `!=`, `===`
- **Logical operators**: `AND`, `OR` (case-insensitive)
- **Grouping**: `( )` - Use parentheses to control evaluation order
- **Null checks**: `== null`, `!= undefined`, etc. - Check for missing metrics

The bracket shorthand targets metric values. For example, `[generation_correctness]` is equivalent to `result.metrics["generation_correctness"].value`, and `[baseline.generation_correctness]` is equivalent to `baseline.metrics["generation_correctness"].value`.

### Use Cases & Examples

#### 1. Finding Poor Performers

Identify ground-truths where a specific metric falls below acceptable thresholds:

```text
[generation_correctness] < 0.8
```

Find cases where retrieval completely failed:

```text
[retrieval_recall] == 0
```

#### 2. Comparing Against Baseline

Find regressions where the current experiment performs worse than baseline:

```text
[generation_correctness] < [baseline.generation_correctness]
```

Find improvements over baseline:

```text
[generation_correctness] > [baseline.generation_correctness]
```

#### 3. Investigating Trade-offs

A common scenario: retrieval got worse but generation still improved (perhaps due to better prompting or model changes):

```text
[retrieval_recall] < [baseline.retrieval_recall] AND [generation_correctness] > [baseline.generation_correctness]
```

The inverse - retrieval improved but generation got worse (potential prompt or model issues):

```text
[retrieval_recall] > [baseline.retrieval_recall] AND [generation_correctness] < [baseline.generation_correctness]
```

#### 4. Finding Specific Ground-Truths

Look up a specific ground truth by reference ID:

```text
ref == "TQ10"
```

Search for multiple specific ground truths:

```text
ref == "TQ10" OR ref == "TQ25" OR ref == "GT100"
```

#### 5. Combined Threshold Analysis

Find cases where both retrieval and generation are poor:

```text
[retrieval_recall] < 0.5 AND [generation_correctness] < 0.5
```

Find high-performing cases to understand what's working:

```text
[retrieval_recall] >= 0.9 AND [generation_correctness] >= 0.9
```

#### 6. Detecting Significant Changes

Find cases with major regressions (dropped by more than 20%):

```text
[generation_correctness] < [baseline.generation_correctness] * 0.8
```

Find cases with significant improvements:

```text
[generation_correctness] > [baseline.generation_correctness] * 1.2
```

Find cases where the absolute value difference is meaningful:

```text
[generation_correctness] - [baseline.generation_correctness] > 0.05
```

Find cases where the absolute difference is large in either direction:

```text
Math.abs([generation_correctness] - [baseline.generation_correctness]) > 0.10
```

#### 7. Filtering on Aggregate Statistics

Find noisy aggregate metrics by standard deviation:

```text
result.metrics["generation_correctness"].std_dev > 0.10
```

Find unstable aggregate metrics by coefficient of variation:

```text
result.metrics["generation_correctness"].coefficient_of_variation > 0.20
```

Use a fallback CV calculation when `coefficient_of_variation` is not present:

```text
result.metrics["generation_correctness"].std_dev / Math.abs(result.metrics["generation_correctness"].value) > 0.20
```

Find statistically significant rows:

```text
result.metrics["generation_correctness"].p_value < 0.05
```

Compare baseline and current standard deviation:

```text
result.metrics["generation_correctness"].std_dev > baseline.metrics["generation_correctness"].std_dev * 1.5
```

#### 8. Analyzing Latency and Cost

Find slow responses that might need optimization:

```text
[latency] > 5000
```

Find cases where latency increased but quality also improved (acceptable trade-off analysis):

```text
[latency] > [baseline.latency] AND [generation_correctness] > [baseline.generation_correctness]
```

#### 9. Multi-Metric Analysis

Complex queries for deep analysis - find cases where retrieval stayed the same or improved, but generation regressed:

```text
[retrieval_recall] >= [baseline.retrieval_recall] AND [generation_correctness] < [baseline.generation_correctness]
```

Find cases where the model is struggling despite good retrieval:

```text
[retrieval_recall] > 0.9 AND [generation_correctness] < 0.7
```

#### 10. Checking for Missing Metrics

Find ground-truths where a metric was not computed (useful for identifying evaluation gaps):

```text
[retrieval_recall] == null
```

```text
[generation_correctness] == undefined
```

Find cases where baseline exists but current experiment is missing the metric:

```text
[generation_correctness] == null AND [baseline.generation_correctness] != null
```

#### 11. Using Parentheses for Complex Logic

Parentheses allow you to group conditions and control evaluation order:

```text
([retrieval_recall] < 0.5 OR [retrieval_precision] < 0.5) AND [generation_correctness] > 0.8
```

Find cases where either metric regressed while the other improved:

```text
([retrieval_recall] < [baseline.retrieval_recall] AND [generation_correctness] > [baseline.generation_correctness]) OR ([retrieval_recall] > [baseline.retrieval_recall] AND [generation_correctness] < [baseline.generation_correctness])
```

Complex threshold with fallback - check baseline only if current metric exists:

```text
[generation_correctness] != null AND ([generation_correctness] < 0.7 OR [generation_correctness] < [baseline.generation_correctness])
```

### Tips

- Use the metrics dropdown to see available metric names
- Filters apply only to the currently displayed set
- The count indicator (e.g., "15 of 495") shows how many results match your filter
- Click "Clear" to reset and see all results
