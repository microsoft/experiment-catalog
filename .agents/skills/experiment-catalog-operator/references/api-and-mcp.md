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

For REST clients that already know a project name, use
`GET /api/projects/{project}` to read its emoji, note, and `ground_truth`
without calling the project collection endpoint.

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

Current MCP gap: result upload, metric definition writes, and custom link
reads/writes are REST operations.
The repository's Experiment Catalog CLI wraps these REST operations for project
creation, experiment creation, and CSV metric pushes. Its
`experiment_catalog.Catalog` class exposes the same implementation to notebooks.

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
| `GET` | `/projects/{project}/links` | Read stored project custom link definitions, excluding deployment defaults. |
| `PUT` | `/projects/{project}/links` | Replace all project custom link definitions, persisted as `links.json`. |
| `POST` | `/analysis/statistics` | Enqueue statistics. |
| `POST` | `/analysis/meaningful-tags` | Meaningful tag analysis. |
| `GET` | `/analysis/projects/{project}/experiments/{experiment}/metrics` | Export raw per-iteration metrics for every set as JSON or CSV. |
| `GET` | `/analysis/projects/{project}/experiments/{experiment}/sets/{set}/metrics` | Export raw per-iteration metrics for one set as JSON or CSV. |
| `GET` | `/analysis/projects/{project}/experiments/{experiment}/artifacts` | List inference and evaluation artifact locations for every set as JSON or JSONL. |
| `GET` | `/analysis/projects/{project}/experiments/{experiment}/sets/{set}/artifacts` | List inference and evaluation artifact locations for one set as JSON or JSONL. |
| `GET` | `/settings` | UI settings, including deployment-wide `custom_links`. |
| `GET` | `/download?url=...` | Download support document if enabled. |

The `sets` query parameter exists on compare but current controller ignores it; filter by tags or compare all sets instead.

Metrics export endpoints return JSON by default. Add `?format=csv` for a wide
CSV with `set`, `ref`, `iteration`, and one column per metric. These exports
exclude annotations, aggregate statistics, support-document URIs, and policies.

Artifact manifest endpoints return JSON by default. Add `?format=jsonl` for a
downloadable manifest and use `types=inference`, `types=evaluation`, or
`types=inference,evaluation` to select artifact types. Each row contains
`type`, `set`, `ref`, `iteration`, and the exact stored Azure Blob `uri`.
Duplicate type/URI pairs are emitted once. Artifact content is not proxied or
zipped by these endpoints.

When runtime custom aggregate functions are enabled by the catalog
administrator, derived metrics are included in comparison, per-ref comparison,
and Meaningful Tags responses. They are response-only values calculated from
the filtered raw results; they are not returned by raw metric exports or
included in the current statistics pipeline.

Aggregate comparison metric objects may also contain:

- `unique_refs`: distinct non-null refs contributing to the metric.
- `wins`: shared refs where the set's per-ref aggregate beats the experiment
  baseline, respecting `lower-is-better`.
- `ties`: shared refs whose per-ref aggregate values are exactly equal.

`wins` and `ties` are omitted for the baseline itself and when no numeric pairs
exist. They are counts rather than rates.

## JSON Shapes

Custom link definitions (`GET`/`PUT /projects/{project}/links`):

```json
[
  {
    "scope": "set",
    "name": "Dashboard",
    "url": "https://tools.example/view?project={project}&experiment={experiment}&set={set}&baseline={baseline-set}"
  }
]
```

Scopes are `experiment`, `set`, `ref`, and `iteration`. Each definition needs a
non-empty name and an absolute HTTP(S) URL template. `(scope, name)` pairs must
be unique. PUT replaces the full list; read and preserve unrelated definitions
before adding a link. PUT `[]` clears project definitions, not deployment defaults.

`GET /settings` returns deployment defaults separately:

```json
{
  "show_only_important_metrics_by_default": false,
  "custom_links": [
    {"scope":"ref","name":"Inspect","url":"https://tools.example/ref?ref={ref}"}
  ]
}
```

Deployment definitions come from `<SCOPE>_LINK_<name>` environment variables,
such as `REF_LINK_Inspect`. The UI merges them by exact `(scope, name)`, with
project definitions overriding defaults. It loads metadata once per owning
project per page, independently of comparison data, and falls back to deployment
defaults when project metadata fails.

| Scope | Placeholders | UI placement |
| --- | --- | --- |
| `experiment` | `{project}`, `{experiment}` | Compare LINKS metadata row after CREATED and before TAG IMPACT. |
| `set` | `{project}`, `{experiment}`, `{set}` | Compare-by-ref LINKS metadata row after CREATED. |
| `ref` | `{project}`, `{experiment}`, `{set}`, `{ref}` | Each aggregate ref row. |
| `iteration` | `{project}`, `{experiment}`, `{set}`, `{ref}`, `{gt}`, `{inf}`, `{eval}` | Beside the existing artifact buttons on expanded iteration rows. |

Every scope also accepts `{baseline-project}`, `{baseline-experiment}`, and
`{baseline-set}`, referring to the active comparison target, or the experiment
baseline without an override. Ordinary placeholders describe the owning row.
Artifact placeholders are that iteration's corresponding URIs. Values are
URL-encoded once, and links requiring unavailable values are hidden. There are
no `project-baseline-*`, `comparison-target-*`, or synthetic `{iteration}` tokens.

Project:

```json
{"name":"project-example"}
```

Experiment:

```json
{"name":"experiment-000","hypothesis":"Hypothesis text."}
```

Result:

Support document URIs are optional. It is common to set `inference_uri` and `evaluation_uri` so users can inspect run artifacts; it is not common to set `ground_truth_uri`, and agents should only include it when a distinct ground-truth artifact URI is available.

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

Retrieval result:

```json
{
  "ref": "q1",
  "set": "set-000",
  "metrics": {
    "retrieval_f1": {
      "found": ["A", "B", "D"],
      "expected": ["B", "C", "D"]
    }
  }
}
```

`found` order is retrieval rank. `expected` is an unordered binary-relevance
set, and duplicate IDs are rejected. Analysis JSON exports preserve this
object. CSV exports use `<metric>.found` and `<metric>.expected` columns whose
cells contain JSON arrays.

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
  "description": "Fraction of evaluated answers judged correct.",
  "min": 0,
  "max": 1,
  "aggregate_function": "Average",
  "order": 300,
  "is_important": true,
  "tags": []
}
```

`description` is optional presentation metadata. On the experiment comparison
page, users can enable **Metric Desc** to show it in italics below the
corresponding metric row.

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
