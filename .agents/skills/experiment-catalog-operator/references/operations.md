# Experiment Catalog Operations

Use this reference for persistent catalog writes and routine state inspection.

## Access

Prefer MCP for interactive operations if the tool namespace is available. Use REST for result ingestion and any endpoint not exposed by MCP.

Default REST base URL:

```text
http://localhost:6010/api
```

If auth is enabled, use the caller-provided token or existing configured credential path. Do not create or guess auth settings.

## Canonical Workflow

1. Create a project for a fixed evaluation environment.
2. Create a project baseline experiment.
3. Upload baseline results.
4. Set the project baseline.
5. Create experiment with a hypothesis.
6. Choose the experiment baseline: first set, explicit set, or `:project`.
7. Upload one or more sets/permutations.
8. Define metrics and tags as needed.
9. Compare and summarize.

Non-deterministic AI systems should use multiple iterations per ref, commonly at least 5, so averages, p-values, and confidence intervals are meaningful.

## Projects

MCP:

- `ListProjects()`
- `AddProject(name)`

REST:

```http
GET /api/projects
POST /api/projects
Content-Type: application/json

{"name":"project-example"}
```

Project names must be valid catalog names. Keep one project aligned to one stable ground-truth set, metric set, and evaluation configuration.

## Experiments

MCP:

- `ListExperiments(project)`
- `GetExperiment(project, experiment)`
- `AddExperiment(project, name, hypothesis)`

REST:

```http
GET /api/projects/{project}/experiments
GET /api/projects/{project}/experiments/{experiment}
POST /api/projects/{project}/experiments
Content-Type: application/json

{"name":"experiment-000","hypothesis":"Lower temperature improves factuality."}
```

Experiment hypotheses should describe the varied code, prompt, model, configuration, or retrieval strategy.

## Baselines

Project baseline:

```http
PATCH /api/projects/{project}/experiments/{baselineExperiment}/baseline
```

MCP: `SetExperimentAsBaseline(project, experiment)`

Experiment baseline set:

```http
PATCH /api/projects/{project}/experiments/{experiment}/sets/{set}/baseline
```

MCP: `SetBaselineForExperiment(project, experiment, set)`

Special case: use set `:project` to compare an experiment against the project baseline.

Changing a baseline changes interpretation for future comparisons. Confirm unless the user explicitly requested the change.

## Results

REST only in current catalog tools:

`inference_uri`, `evaluation_uri`, and `ground_truth_uri` are optional support document links. Usually include `inference_uri` and `evaluation_uri` for result uploads; only include `ground_truth_uri` when the ground-truth source has a useful artifact URI to link.

```http
POST /api/projects/{project}/experiments/{experiment}/results
Content-Type: application/json

{
  "ref": "q1",
  "set": "set-000",
  "inference_uri": "path/to/inference.json",
  "evaluation_uri": "path/to/evaluation.json",
  "metrics": {
    "generation_correctness": 0.83,
    "retrieval_recall": 0.75
  }
}
```

For set-level annotations without metrics:

```json
{
  "set": "set-000",
  "annotations": [
    {"text": "commit 4897f3d", "uri": "https://example.com/commit/4897f3d"}
  ]
}
```

Metric values must be numeric unless they are classification values `t+`, `t-`, `f+`, or `f-` for metric names containing classification indicators such as accuracy, precision, or recall.

## Metrics

REST:

```http
GET /api/projects/{project}/metrics
PUT /api/projects/{project}/metrics
Content-Type: application/json

[
  {
    "name": "generation_correctness",
    "min": 0,
    "max": 1,
    "aggregate_function": "Average",
    "order": 300,
    "is_important": true,
    "tags": []
  }
]
```

MCP read: `GetMetricDefinitions(project)`

Aggregate functions:

- `Default`
- `Average`
- `Recall`
- `Precision`
- `Accuracy`
- `Count`
- `Cost`

Default inference:

- metric names containing `cost` aggregate as `Cost`
- metric names containing `count` aggregate as `Count`
- classification metrics can aggregate as `Accuracy`, `Precision`, or `Recall`
- otherwise numeric metrics aggregate as `Average`

Use `tags: ["lower-is-better"]` for latency, cost, token count, and similar metrics.

## Tags

Tags group refs for subset analysis.

REST:

```http
GET /api/projects/{project}/tags
PUT /api/projects/{project}/tags
Content-Type: application/json

{"name":"multi-turn","refs":["q1","q2","q3"]}
```

MCP:

- `ListTags(project)`
- `AddTagToProject(project, tagName, refs)`

Use tags for stable slices such as `split:validation`, `split:test`, `multi-turn`, `single-turn`, `source:GTC`, domain, scenario, or risk category.

## Maintenance And Download

REST:

```http
PUT /api/projects/{project}/experiments/{experiment}/optimize
GET /api/projects/{project}/experiments/{experiment}/download
GET /api/download?url={support-document-path}
```

`/api/download` requires catalog support-document download to be enabled.
