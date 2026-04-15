# Catalog UI

## Free Filter

The free filter allows you to narrow down ground-truth results to those meeting specific criteria. This is essential when evaluating experimentation results to identify patterns, regressions, improvements, or unexpected behaviors across your test cases.

### Basic Syntax

- **Metric values**: `[metric_name]` - Access a metric from the current experiment set
- **Baseline values**: `[baseline.metric_name]` - Access a metric from the experiment baseline
- **Reference ID**: `ref` - The ground-truth reference identifier
- **Operators**: `<`, `<=`, `>`, `>=`, `==`, `!=`, `===`
- **Logical operators**: `AND`, `OR` (case-insensitive)
- **Grouping**: `( )` - Use parentheses to control evaluation order
- **Null checks**: `== null`, `!= undefined`, etc. - Check for missing metrics

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

#### 7. Analyzing Latency and Cost

Find slow responses that might need optimization:

```text
[latency] > 5000
```

Find cases where latency increased but quality also improved (acceptable trade-off analysis):

```text
[latency] > [baseline.latency] AND [generation_correctness] > [baseline.generation_correctness]
```

#### 8. Multi-Metric Analysis

Complex queries for deep analysis - find cases where retrieval stayed the same or improved, but generation regressed:

```text
[retrieval_recall] >= [baseline.retrieval_recall] AND [generation_correctness] < [baseline.generation_correctness]
```

Find cases where the model is struggling despite good retrieval:

```text
[retrieval_recall] > 0.9 AND [generation_correctness] < 0.7
```

#### 9. Checking for Missing Metrics

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

#### 10. Using Parentheses for Complex Logic

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
