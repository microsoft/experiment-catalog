# API And MCP Reference

Use this reference for exact current Experiment Catalog operations.

## MCP Tools

Project tools:

| Tool | Use |
| --- | --- |
| `ListProjects()` | List all projects. |
| `AddProject(name)` | Create a project. |
| `ListTags(project)` | List tag names in a project. |
| `AddTagToProject(project, tagName, refs)` | Add/update a tag and associated refs. |
| `GetMetricDefinitions(project)` | Read metric definitions. |

Experiment tools:

| Tool | Use |
| --- | --- |
| `ListExperiments(project)` | List experiments in a project. |
| `GetExperiment(project, experiment)` | Read experiment details. |
| `AddExperiment(project, name, hypothesis)` | Create an experiment. |
| `ListSetsForExperiment(project, experiment)` | Discover set names only when needed. |
| `SetExperimentAsBaseline(project, experiment)` | Set project baseline experiment. |
| `SetBaselineForExperiment(project, experiment, set)` | Set experiment baseline set; `:project` means project baseline. |
| `CompareExperiment(project, experiment, includeTags, excludeTags)` | Default aggregate comparison. |
| `CompareByRef(project, experiment, set, includeTags, excludeTags)` | Per-ref comparison for individual ground truths. |
| `GetNamedSet(project, experiment, set, includeTags, excludeTags)` | Raw set result details. |

Analysis tools:

| Tool | Use |
| --- | --- |
| `CalculateStatistics(project, experiment)` | Enqueue p-value/statistics calculation. |
| `MeaningfulTags(project, experiment, set, metric, excludeTags, compareTo)` | Rank tag subsets by metric impact. |

Current MCP gap: result upload and metric definition writes are REST operations.

## REST Endpoints

Assume `{baseUrl}` includes `/api`, for example `http://localhost:6010/api`.

| Method | Path | Use |
| --- | --- | --- |
| `GET` | `/projects` | List projects. |
| `POST` | `/projects` | Create project. |
| `GET` | `/projects/{project}/experiments` | List experiments. |
| `GET` | `/projects/{project}/experiments/{experiment}` | Get experiment. |
| `POST` | `/projects/{project}/experiments` | Create experiment. |
| `PATCH` | `/projects/{project}/experiments/{experiment}/baseline` | Set project baseline. |
| `PATCH` | `/projects/{project}/experiments/{experiment}/sets/{set}/baseline` | Set experiment baseline. |
| `POST` | `/projects/{project}/experiments/{experiment}/results` | Add result or annotation. |
| `GET` | `/projects/{project}/experiments/{experiment}/compare` | Aggregate comparison. |
| `GET` | `/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref` | Per-ref comparison. |
| `GET` | `/projects/{project}/experiments/{experiment}/sets/{set}` | Raw set results. |
| `GET` | `/projects/{project}/experiments/{experiment}/sets` | List sets. |
| `GET` | `/projects/{project}/experiments/{experiment}/download` | Download experiment JSONL. |
| `PUT` | `/projects/{project}/experiments/{experiment}/optimize` | Optimize experiment storage. |
| `GET` | `/projects/{project}/tags` | List tags. |
| `PUT` | `/projects/{project}/tags` | Add/update tag. |
| `GET` | `/projects/{project}/metrics` | Get metric definitions. |
| `PUT` | `/projects/{project}/metrics` | Add/update metric definitions. |
| `POST` | `/analysis/statistics` | Enqueue statistics. |
| `POST` | `/analysis/meaningful-tags` | Meaningful tag analysis. |
| `GET` | `/settings` | UI settings. |
| `GET` | `/download?url=...` | Download support document if enabled. |

The `sets` query parameter exists on compare but current controller ignores it; filter by tags or compare all sets instead.

## JSON Shapes

Project:

```json
{"name":"project-example"}
```

Experiment:

```json
{"name":"experiment-000","hypothesis":"Hypothesis text."}
```

Result:

```json
{
  "ref": "q1",
  "set": "set-000",
  "inference_uri": "path/to/inference.json",
  "evaluation_uri": "path/to/evaluation.json",
  "metrics": {
    "generation_correctness": 0.83
  }
}
```

Annotation:

```json
{
  "set": "set-000",
  "annotations": [
    {"text": "commit 4897f3d", "uri": "https://example.com/commit/4897f3d"}
  ]
}
```

Metric definition:

```json
{
  "name": "generation_correctness",
  "min": 0,
  "max": 1,
  "aggregate_function": "Average",
  "order": 300,
  "is_important": true,
  "tags": []
}
```

Tag:

```json
{"name":"multi-turn","refs":["q1","q2","q3"]}
```

Meaningful tags request:

```json
{
  "project": "project-example",
  "experiment": "experiment-000",
  "set": "set-000",
  "metric": "generation_correctness",
  "exclude_tags": ["split:validation"],
  "compare_to": "Baseline"
}
```

Statistics request:

```json
{"project":"project-example","experiment":"experiment-000"}
```

## Configuration Facts

Catalog defaults:

- API port: `6010`.
- UI dev port: `6020`.
- Scalar API docs: `/scalar/v1`.
- Storage: Azure Blob Storage.

Required storage configuration:

- `AZURE_STORAGE_ACCOUNT_NAME` or `AZURE_STORAGE_ACCOUNT_CONNSTRING`.

Common local auth/storage:

```env
INCLUDE_CREDENTIAL_TYPES=azcli
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
```

Optional OIDC auth:

- If `OIDC_AUTHORITY` is unset, anonymous access is allowed.
- If `OIDC_AUTHORITY` is set, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are required.

Never commit `.env` files or secrets.
