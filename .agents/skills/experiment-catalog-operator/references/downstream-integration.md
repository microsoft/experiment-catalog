# Downstream Integration

Use this reference when another repository depends on Experiment Catalog and needs to publish or analyze results.

## Integration Contract

A downstream repo needs:

- Catalog API base URL, including `/api`.
- Auth token or configured identity when catalog auth is enabled.
- Stable project name for the evaluation cycle.
- Stable experiment name for the hypothesis under test.
- Stable set/permutation names for each configuration run.
- Ref IDs that match the ground-truth source.
- Metric names that remain stable across runs.

Do not require the downstream repo to copy Experiment Catalog source code. Treat the catalog as an external service with REST/MCP access.

## Minimal Publish Flow

1. Ensure project exists.
2. Ensure experiment exists.
3. Ensure metric definitions exist for known metrics.
4. Upload each result row:

```http
POST {catalogBaseUrl}/projects/{project}/experiments/{experiment}/results
Content-Type: application/json
Authorization: Bearer <token-if-required>

{
  "ref": "ground-truth-id",
  "set": "permutation-name",
  "inference_uri": "optional/path/to/inference-output.json",
  "evaluation_uri": "optional/path/to/evaluation-output.json",
  "metrics": {
    "generation_correctness": 0.9,
    "meta_inference_time": 3.27
  }
}
```

5. Annotate the set with reproducibility links:

```json
{
  "set": "permutation-name",
  "annotations": [
    {"text": "commit abc1234", "uri": "https://github.com/org/repo/commit/abc1234"},
    {"text": "config run-42", "uri": "https://example.com/runs/42"}
  ]
}
```

## Recommended Environment Variables

Use repo-specific names if already established; otherwise prefer:

```env
EXPERIMENT_CATALOG_BASE_URL=https://catalog.example.com/api
EXPERIMENT_CATALOG_PROJECT=sprint-01
EXPERIMENT_CATALOG_EXPERIMENT=my-hypothesis
EXPERIMENT_CATALOG_SET=permutation-a
EXPERIMENT_CATALOG_TOKEN=<secret-only>
```

Store tokens as CI/user secrets, never in source.

## Metric Design

Good metric names are stable, lowercase, and domain-scoped:

- `retrieval_recall`
- `retrieval_precision`
- `generation_correctness`
- `generation_faithfulness`
- `meta_inference_time`
- `meta_inference_completion_cost`

Use `lower-is-better` for latency, cost, and token metrics. Mark only decision-driving metrics with `is_important`.

## Tags

Publish tags for slices the team will analyze repeatedly:

- `split:validation`
- `split:test`
- `multi-turn`
- `single-turn`
- `source:GTC`
- product/domain/scenario/risk tags

Tags attach to refs, not individual result rows.

## Idempotency And Retries

The catalog appends result records. Downstream publishers should avoid accidental duplicates by using stable run manifests and only retry failed rows when the prior write is known to have failed.

Recommended caller behavior:

- Log project, experiment, set, ref, and metric names for every upload batch.
- Save source inference/evaluation output URIs before posting catalog results.
- Treat HTTP 409 during optimization/maintenance as retryable after delay.
- Treat 400 validation errors as data bugs to fix, not retryable conditions.

## Validation Checklist

Before declaring a downstream integration complete:

- Project exists.
- Experiment exists with the intended hypothesis.
- At least one result row is visible in the target set.
- Metric definitions match the emitted metrics.
- Tags used in analysis exist and include expected refs.
- Aggregate comparison returns the uploaded set.
- Auth works in CI or the target automation host.

## Analysis Handoff

When handing catalog results to an agent or user, include:

- catalog base URL
- project
- experiment
- set/permutation names
- intended baseline
- important metrics and directionality
- relevant include/exclude tags
- links to run artifacts or annotations
