# Experiment Catalog

The catalog is a C# API that allows you to create projects with experiments. It then allows you to record results on arbitrary metrics and compare them.

## Configuration

To configure the solution, you must provide the following environment variables. You can do that by any means, but it is also supported to create a .env file at the root of the project.

- **LOG_LEVEL** [DEFAULT: Information]: The level of logging to use. The following options are available: Trace, Debug, Information, Warning, Error, Critical, None.

- **ASPNETCORE_ENVIRONMENT** [OPTIONAL]: This can be set to "Development" to change the behavior of **INCLUDE_CREDENTIAL_TYPES**.

- **INCLUDE_CREDENTIAL_TYPES** [CONDITIONAL]: This setting will determine how credentials are obtained to connect to the Azure Storage Account. If the **ASPNETCORE_ENVIRONMENT** is set to "Development", then the default will be "azcli, env" otherwise, it will be "env, mi". This is a comma-separated list of the credential types to include. The following options are available: azcli, env, mi, token, vs, vscode, browser. Please see the [DefaultAzureCredentials](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.defaultazurecredential?view=azure-dotnet) documentation for how each of these work. For instance, if you use "env", you must supply an **AZURE_TENANT_ID**, **AZURE_CLIENT_ID**, and **AZURE_CLIENT_SECRET**.

- **PORT** [DEFAULT: 6010]: The port to run the HTTP API on.

- **OPEN_TELEMETRY_CONNECTION_STRING** [OPTIONAL]: The connection string for the Open Telemetry service. Currently this only supports Application Insights.

- **AZURE_STORAGE_ACCOUNT_NAME** [CONDITIONAL]: The name of the Azure Storage account to use for storing the project containers. Either this or **AZURE_STORAGE_ACCOUNT_CONNSTRING** must be set. It is recommended to use a separate storage account for this purpose.

- **AZURE_STORAGE_ACCOUNT_CONNSTRING** [CONDITIONAL]: The connection string for the Azure Storage account. Either this or **AZURE_STORAGE_ACCOUNT_NAME** must be set.

- **CONCURRENCY** [DEFAULT: 4]: The number of concurrent threads that can be used for processing requests (such as loading experiments).

- **REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE** [DEFAULT: 1024]: In order to improve performance, the catalog will compact smaller blocks in an experiment file into larger blocks. If the average of the block size is smaller than this threshold in KB, then the catalog will optimize the file. In other words, by default if the average block size is less than 1MB, then the catalog will optimize the file.

- **MINUTES_TO_BE_IDLE** [DEFAULT: 10]: The number of minutes that must pass without new results coming into the catalog before it will optimize the file. This is to reduce the chance that the catalog is attempting to optimize the file while jobs are running. Any attempt to send results during optimization will fail with a 409 Conflict error.

- **MINUTES_TO_BE_RECENT** [DEFAULT: 480]: The number of minutes (8 hours default) to consider an experiment as "recent" for maintenance operations.

- **AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES** [DEFAULT: 0]: The number of minutes that must pass since the last optimization attempt before the catalog will attempt to optimize anything again. Set to 0 to disable automatic optimization. Each file is checked against **REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE** and **MINUTES_TO_BE_IDLE** to determine if it is eligible.

- **CALC_PVALUES_USING_X_SAMPLES** [DEFAULT: 10000]: The number of samples to use when calculating p-values via bootstrap sampling.

- **CALC_PVALUES_EVERY_X_MINUTES** [DEFAULT: 0]: The frequency in minutes to automatically calculate p-values. Set to 0 to disable.

- **MIN_ITERATIONS_TO_CALC_PVALUES** [DEFAULT: 5]: The minimum number of iterations required before p-values can be calculated.

- **CONFIDENCE_LEVEL** [DEFAULT: 0.95]: The confidence level to use for statistical calculations.

- **PRECISION_FOR_CALC_VALUES** [DEFAULT: 4]: The number of decimal places to use for calculated values.

- **PATH_TEMPLATE** [OPTIONAL]: A template string for constructing URIs to inference, evaluation, and ground truth output files. Use `{0}` as a placeholder for the URI. When running on localhost, it is common to set this to `http://localhost:6010/api/download?url={0}`. When running deployed, it is common to set this to `/api/download?url={0}`. Either of these options will give you a JSON download of the file when you click on the link in the UI. However, if you want to create your own visualization and analysis of the inference, evaluation, and ground truth output files, you can set this to a different URL that will allow you to do that.

- **CUSTOM_AGGREGATE_FUNCTIONS_PATH** [OPTIONAL, DEFAULT: unset/disabled]: Local folder containing administrator-deployed trusted `.py` files for runtime custom aggregate metrics. When this setting is empty, custom aggregate execution is disabled.

- **CUSTOM_AGGREGATE_PYTHON_EXECUTABLE** [DEFAULT: python3]: Python executable used to run runtime custom aggregate functions. The host must have this executable available. The published `catalog.Dockerfile` runtime image installs `python3`.

- **CUSTOM_AGGREGATE_TIMEOUT_SECONDS** [DEFAULT: 30, RANGE: 1-3600]: Hard timeout shared by all custom aggregate functions and aggregate groups within one comparison or meaningful-tags request. If the timeout is exceeded, the catalog terminates the full Python subprocess tree and fails the request.

- **AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS** [OPTIONAL]: The name of a separate Azure Storage account for support documents. Defaults to the main storage account if ENABLE_DOWNLOAD is true.

- **AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS** [OPTIONAL]: The connection string for the support documents storage account.

- **AZURE_STORAGE_CACHE_FOLDER** [OPTIONAL]: Local folder path to cache downloaded support documents.

- **AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS** [DEFAULT: 168]: Maximum age in hours (7 days default) for cached support documents.

- **AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES** [DEFAULT: 120]: Frequency in minutes to clean up old cached files.

- **ENABLE_DOWNLOAD** [DEFAULT: false]: Enable download of support documents via the `/api/download` endpoint.

- **TEST_PROJECTS** [OPTIONAL]: A comma-separated list of project names to use for testing purposes.

### Authentication (OIDC/JWT)

The catalog supports optional JWT authentication using any OIDC-compliant identity provider. If `OIDC_AUTHORITY` is not configured, the API allows anonymous access. More information about authentication methods can be found in [auth.md](auth.md).

- **OIDC_AUTHORITY** [OPTIONAL]: The OIDC authority URL (e.g., `https://login.microsoftonline.com/{tenant}/v2.0` for Azure AD). If not set, authentication is disabled and anonymous access is allowed.

- **OIDC_CLIENT_ID** [CONDITIONAL]: The client ID of the application registered with the OIDC provider. If `OIDC_AUTHORITY` is set, this must also be set.

- **OIDC_CLIENT_SECRET** [CONDITIONAL]: The client secret of the application registered with the OIDC provider. If `OIDC_AUTHORITY` is set, this must also be set.

- **OIDC_AUDIENCES** [OPTIONAL]: A comma-separated list of valid audience values. If provided, the `aud` claim in the token will be validated against these values.

- **OIDC_ISSUERS** [OPTIONAL]: A comma-separated list of valid issuer URLs. If provided, the `iss` claim in the token will be validated against these values.

- **OIDC_VALIDATE_LIFETIME** [DEFAULT: true]: Whether to validate the token's expiration.

- **OIDC_CLOCK_SKEW_IN_MINUTES** [DEFAULT: 5]: The allowed clock skew in minutes when validating token lifetimes.

- **OIDC_NAME_CLAIM_TYPE** [DEFAULT: name]: The claim type to use for the user's name (e.g., `preferred_username`, `name`, `email`).

- **OIDC_ROLE_CLAIM_TYPE** [DEFAULT: roles]: The claim type to use for the user's roles (e.g., `roles`, `groups`).

- **OIDC_VALIDATE_COOKIE** [DEFAULT: id_token]: The cookie name from which to extract the JWT token for validation. This will be used if a bearer token is not found in the Authorization header.

- **OIDC_VALIDATE_HEADER** [DEFAULT: X-MS-TOKEN-AAD-ID-TOKEN]: The HTTP header from which to extract the JWT token for validation. This will be used if a bearer token is not found in the Authorization header or the specified cookie.

- **OIDC_ACCEPTABLE_ROLES** [OPTIONAL]: A comma-separated list of acceptable roles. If provided, the user must have at least one of these roles (from the claim specified by `OIDC_ROLE_CLAIM_TYPE`) to access the API.

### Reverse Proxy / Virtual Directory

When using OIDC authentication behind a reverse proxy (or at a sub-path), use the following settings to ensure the OIDC redirect URI is constructed correctly:

- **PATH_BASE** [OPTIONAL]: The path prefix under which the catalog is served (e.g., `/catalog`). Sets `Request.PathBase` via `UsePathBase()` middleware so that routing, redirect URIs, and links work correctly from the sub-path.

- **EXTERNAL_SCHEME** [OPTIONAL]: The scheme (e.g., `https`) used when constructing the OIDC redirect URI (`/auth/callback`). This setting is **only** used for OIDC authentication flows — it does not affect other request handling. If unset, the app falls back to the `X-Forwarded-Proto` header and then `Request.Scheme`. **Required for Azure Container Apps with OIDC** — the Container App Environment performs TLS termination at the Envoy ingress, so the app always sees `http` in `Request.Scheme` even though external clients connect over HTTPS. Set `EXTERNAL_SCHEME=https` to ensure the OIDC redirect URI uses the correct protocol.

- **EXTERNAL_HOST** [OPTIONAL]: The public hostname (e.g., `apps.example.com`) used by external clients. Overrides `Request.Host` when constructing OIDC redirect URIs. Falls back to `Request.Host` if unset. Use this when the reverse proxy forwards requests using an internal hostname that differs from the public domain.

## Concepts

The catalog is organized around the following concepts:

- **Project**: A project is a collection of experiments that are all tied to the same baseline. During that project, you would expect that the grounding data and evaluation script/metrics/configuration would not change.

- **Project Baseline**: A project baseline is a special experiment that is created for each project before experimentation is done. This experiment will have an experimentation run that can be used as a comparison point for all other experiments in the project. Did they get better or worse than this baseline?

- **Experiment**: Inside a project, developers will create experiments with a hypothesis. This experiment will have a number of evaluation runs to test code, configuration, workflow, etc. - the ultimate goal of which of is to prove or disprove the hypothesis.

- **Experiment Baseline**: The first evaluation run of an experiment is generally the baseline for that experiment. Before a developer starts changing things, they need to record what the performance of the system is. If the experiment is started right after the project is started, then this baseline is probably the same as the project baseline, but as code gets merged during the project there will be drift.

- **Set**: A set is a collection of results that are all related to the same evaluation run. For instance, running 3 iterations of 12 ground truths might be considered a single set. If you later decided you needed 2 more iterations, you could add to the set.

- **Ref**: A ref is a reference to a entity that is being evaluated. Almost always this should be a reference to the ground truth. It is common that you might run multiple iterations of the same ground truth, using a ref is a way to aggregate those as well as compare the performance of ground truths across evaluation runs.

## Publish with the CLI or Python API

The repository includes a Python 3.10+ client for the supported publishing
workflow: create a project, create an experiment, and push metrics from CSV or
notebook data.
The API base URL must include `/api`. Run this example from the repository root:

```bash
python3 -m venv cli/.venv
cli/.venv/bin/python -m pip install -e ./cli
source cli/.venv/bin/activate
export EXPERIMENT_CATALOG_BASE_URL=http://localhost:6010/api

experiment-catalog create-project sprint-42
experiment-catalog create-experiment \
  --project sprint-42 notebook-test \
  --hypothesis "The candidate prompt improves answer correctness."
experiment-catalog push ./cli/examples/notebook-results.csv \
  --project sprint-42 \
  --experiment notebook-test \
  --set candidate-a \
  --dry-run
```

The Python `Catalog.push_metrics` API uses the same validation and result
publishing path as the CLI. Metric definitions are optional and are not part of
the CSV contract. Pushes append one result at a time and are not atomic; a
failure can leave partial data. See the
[CLI and Python API guide](../cli/README.md) for the exact CSV format, notebook
examples, dry-run behavior, and recovery limitations.

## Web UI

The UI for the catalog is written in Svelte in the [ui](../ui) folder. Generally, the UI is hosted inside the catalog and that means the UI must be built and copied into the catalog project. To build and copy the UI:

```bash
cd ui
npm install
npm run build
cp -r dist/* ../api/wwwroot/
```

## Create a project

You can call the API like this to create a project...

```bash
curl -i -X POST -H "Content-Type: application/json" -d '{ "name": "project-example" }' http://localhost:6010/api/projects
```

This will create a container in Azure Blob Storage of the specified name. The container will have a metadata property of "exp_catalog_type": "project".

## Create a baseline

You can call the API to create a baseline experiment like this...

```bash
curl -i -X POST -d '{ "name": "project-baseline", "hypothesis": "my baseline" }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments
```

This will create an experiment blob in the project container. You should create a baseline experiment like this for each project. This baseline gives you a way to compare your experimentation results versus a stable point in time. You can mark this experiment as the project baseline like this...

```bash
curl -i -X PATCH http://localhost:6010/api/projects/project-example/experiments/project-baseline/baseline
```

Finally, you can record any results you have for the baseline experiment like this...

```bash
curl -i -X POST -d '{ "ref": "q1", "set": "baseline-0", "metrics": { "gpt-coherence": 2, "gpt-relevance": 3, "gpt-correctness": 2 } }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments/project-baseline/results
```

You can also include optional URIs to inference, evaluation, and ground truth output files:

```bash
curl -i -X POST -d '{ "ref": "q1", "set": "baseline-0", "inference_uri": "path/to/inference.json", "evaluation_uri": "path/to/evaluation.json", "ground_truth_uri": "path/to/ground-truth.json", "metrics": { "gpt-coherence": 2, "gpt-relevance": 3 } }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments/project-baseline/results
```

Numeric metrics do not need to be pre-defined. Classification and retrieval
metrics must either have a compatible metric definition or use a name from
which the catalog can infer a supported aggregate.

Metrics may be numeric, classification labels (`t+`, `t-`, `f+`, or `f-`), or
structured retrieval values:

```json
{
  "metrics": {
    "retrieval": {
      "found": ["doc-1", "doc-3"],
      "expected": ["doc-1", "doc-2"]
    }
  }
}
```

A retrieval value must contain exactly the `found` and `expected` arrays. Each
array may contain at most 10,000 unique, case-sensitive string IDs; IDs must be
non-empty, non-whitespace, and at most 500 characters. Precision, recall, and
F1 aggregates derive confusion counts from set membership in these arrays.
Without a metric definition, classification labels are accepted when the metric
name contains `accuracy`, `precision`, `recall`, or `f1` (case-insensitive);
retrieval values require `precision`, `recall`, or `f1`.

## Create an experiment

After you have a baseline, you will create some experiments. For example, you might create an experiment like this...

```bash
curl -i -X POST -d '{ "name": "experiment-000", "hypothesis": "I believe decreasing the temperature will give better results." }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments
```

Then to record results for that experiment, you can do it exactly like the baseline...

```bash
curl -i -X POST -d '{ "ref": "q1", "set": "beta", "metrics": { "gpt-coherence": 3, "gpt-relevance": 2, "gpt-correctness": 3 } }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments/experiment-000/results
```

While generally the first evaluation run of an experiment is the baseline, you can set a different evaluation run as the baseline by...

```bash
curl -i -X PATCH http://localhost:6010/api/projects/project-example/experiments/experiment-000/sets/my-baseline/baseline
```

Alternatively, you can set the experiment baseline to the project baseline like this...

```bash
curl -i -X PATCH http://localhost:6010/api/projects/project-example/experiments/experiment-000/sets/:project/baseline
```

## Compare

Once you have some results for your experiment, you can compare them like this...

```bash
curl -i http://localhost:6010/api/projects/project-example/experiments/experiment-000/compare
```

This endpoint returns one aggregate result per set in the experiment, plus the
project and experiment baselines when available. Include/exclude tag filters are
applied before the catalog calculates built-in and runtime custom aggregate
metrics.

Aggregate metric objects in this response can also include response-only
comparison metadata: `count`, `unique_refs`, `wins`, and `ties`. See
[Aggregate Comparison Metadata](#aggregate-comparison-metadata).

You can filter the comparison by tags:

```bash
curl -i "http://localhost:6010/api/projects/project-example/experiments/experiment-000/compare?include-tags=tag1,tag2&exclude-tags=tag3"
```

## Annotate

If you want to annotate a set you could do it like this...

```bash
curl -i -X POST -d '{ "set": "alpha", "annotations": [ { "text": "commit 3746hf", "uri": "https://dev.azure.com/commit" } ] }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-01/experiments/pelasne-01/results
```

In that example, the commit number is being annotated so that the user could get back to the same code and configuration to repeat the experiment.

## Additional API Endpoints

### Tags

List tags for a project:

```bash
curl -i http://localhost:6010/api/projects/project-example/tags
```

Add a tag to a project:

```bash
curl -i -X PUT -d '{ "name": "my-tag", "refs": ["q1", "q2", "q3"] }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/tags
```

### Metrics

Get metric definitions for a project:

```bash
curl -i http://localhost:6010/api/projects/project-example/metrics
```

Add metric definitions to a project:

```bash
curl -i -X PUT -d '[
  {
    "name": "gpt-coherence",
    "description": "LLM-judged answer coherence on a 0-5 scale.",
    "min": 0,
    "max": 5,
    "aggregate_function": "Average",
    "order": 1,
    "is_important": true,
    "tags": []
  }
]' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/metrics
```

Metric definition fields:

| Field                | Type     | Required | Description                                                                                                                                                                                                                 |
| -------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`               | string   | yes      | Metric name (must be a valid identifier).                                                                                                                                                                                   |
| `description`        | string   | no       | Human-readable presentation text that users can reveal below metric rows in the comparison UI. This is optional metadata only; it is not required to submit metrics and does not change aggregation or stored result rows. |
| `min`                | number   | no       | Minimum possible value. Used with `max` for normalization and chart y-axis bounds.                                                                                                                                          |
| `max`                | number   | no       | Maximum possible value. Used with `min` for normalization and chart y-axis bounds.                                                                                                                                          |
| `aggregate_function` | string   | no       | `Default`, `Average`, `AverageByRef`, `Precision`, `Recall`, `F1`, `MicroPrecision`, `MicroRecall`, `MicroF1`, `MacroPrecision`, `MacroRecall`, `MacroF1`, `Accuracy`, `Count`, or `Cost`. Defaults to `Default`.                  |
| `order`              | integer  | no       | Display order in the UI (lower numbers appear first).                                                                                                                                                                       |
| `is_important`       | boolean  | no       | When `true`, the metric is highlighted in the UI. Defaults to `false`.                                                                                                                                                      |
| `tags`               | string[] | no       | Tags controlling categorization and display. For example, `lower-is-better`, `no-p`, and `elapsed_time`; `elapsed_time` means that stored numeric values are milliseconds.                                                    |

Metric-definition descriptions are optional presentation metadata. They are
returned with `metric_definitions`, but result submission does not require
them, and the catalog does not read them during aggregation, comparison,
statistics, filtering semantics, or export generation.

Aggregation behavior:

- `Average` averages all numeric observations. `AverageByRef` first averages
  each ref's numeric observations, then gives every ref equal weight. Its
  summary count and variation describe refs, not raw iterations. Observations
  without a ref are excluded, and aggregation fails when no referenced numeric
  observations remain.
- `Precision`, `Recall`, and `F1` pool confusion counts across all observations.
  `MicroPrecision`, `MicroRecall`, and `MicroF1` are explicit aliases for the
  same pooled behavior.
- `MacroPrecision`, `MacroRecall`, and `MacroF1` pool observations within each
  ref, calculate that ref's score, and then average the ref scores equally.
  Observations without a ref are excluded.
- Precision, recall, and F1 variants accept either classification labels or
  structured retrieval values. Do not mix retrieval values with classification
  or numeric values for one metric in a set. `Accuracy` remains
  classification-only. For backward compatibility, numeric history alongside
  classification values is retained but does not contribute confusion counts.
- With `Default`, metric names containing `precision`, `recall`, `f1`, or
  `accuracy` infer the corresponding classification/retrieval aggregate when
  compatible values are present; other numeric metrics average.
- Statistics (paired permutation p-values and bootstrap confidence intervals)
  are calculated only for `Average` and `AverageByRef` metrics, excluding
  metrics tagged `no-p`. Pairing is by ref and still requires the configured
  minimum number of paired observations.

### Aggregate Comparison Metadata

Aggregate comparison responses add metadata fields to each aggregate metric
object without changing stored experiment data:

| Field | Meaning |
| --- | --- |
| `count` | Number of metric observations represented by the aggregate. |
| `unique_refs` | Number of distinct non-null refs represented by that aggregate metric. Built-in metrics apply aggregate-function-specific value eligibility; runtime custom metrics count the refs supplied to the Python function. |
| `wins` | Number of shared refs where this set's per-ref aggregate strictly beats the experiment baseline's per-ref aggregate. |
| `ties` | Number of shared refs where this set's per-ref aggregate exactly equals the experiment baseline's per-ref aggregate. |

Important details:

- `wins` and `ties` are comparison metadata only. They are computed for the
  main aggregate comparison response and are not persisted back to the
  experiment, exported in raw metrics, or used in the statistics pipeline.
- Pairing uses only refs shared by the candidate set and the experiment
  baseline, and only when both per-ref aggregates expose numeric values for the
  same metric. Unpaired refs are ignored.
- Metric direction comes from the `lower-is-better` tag on the metric
  definition. When the tag is present, a lower numeric value is a win;
  otherwise, a higher numeric value is a win.
- Ties require exact numeric equality. Version 1 does not apply an epsilon or
  tolerance window.
- The experiment baseline is the comparison target, so it omits `wins` and
  `ties`. Its `count` and `unique_refs` fields still describe the aggregate
  baseline metric itself.
- `unique_refs`, `wins`, and `ties` are response-only comparison metadata.
  Clients should treat them as display/analysis helpers rather than persisted
  metric values.

### Runtime Custom Aggregate Metrics

The catalog can add trusted, runtime-only aggregate metrics during comparison
and meaningful-tags requests. This feature is disabled unless
`CUSTOM_AGGREGATE_FUNCTIONS_PATH` points to a local folder of
administrator-deployed `.py` files.

> [!WARNING]
> Files in `CUSTOM_AGGREGATE_FUNCTIONS_PATH` execute as arbitrary Python code
> inside the catalog process boundary. Only enable this for trusted,
> administrator-managed code.

- Each non-underscore `*.py` file in the configured folder contributes one
  runtime metric. The filename stem becomes the metric name returned in API
  responses, so `efficiency.py` produces `efficiency`.
- Files whose names start with `_` are ignored for metric discovery but remain
  importable from sibling modules because the configured folder is added to the
  Python import path for each request.
- Every discovered file must expose `aggregate(results)`. The catalog launches
  one fresh, batched Python subprocess for each
  `GET /api/projects/{project}/experiments/{experiment}/compare`,
  `GET /api/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref`,
  and `POST /api/analysis/meaningful-tags` request. There is no cache or
  persistent worker, so file changes apply on the next request.
- `compare` builds one aggregate group per filtered set. `compare-by-ref` builds
  one aggregate group per filtered ref within the requested set. Meaningful-tags
  analysis builds filtered experiment tag-slice groups and, when needed, the
  comparison average or baseline tag-slice groups used for the request.
  Include/exclude filters are always applied before groups are built.
- Each function sees only stored raw result rows for its group. Outputs from one
  custom aggregate function are not fed into another, so derived-on-derived
  inputs are not available.
- Metric name collisions fail the entire request. If a runtime aggregate metric
  name already exists on the aggregate output, the catalog returns an error
  instead of overwriting the value.
- Any `stdout` emitted while importing modules or running `aggregate(results)`
  is redirected to the child process `stderr` so it cannot corrupt the JSON
  protocol.
- Returned values appear only in the response. They are not persisted, do not
  appear in raw metric exports, and do not currently receive aggregate
  statistics such as standard deviation, p-values, or confidence intervals.

The `results` argument is a JSON-compatible list of raw result rows shaped like:

```json
[
  {
    "ref": "q1",
    "set": "candidate-a",
    "ground_truth_uri": "ground-truth/q1.json",
    "inference_uri": "inference/q1.json",
    "evaluation_uri": "evaluation/q1.json",
    "metrics": {
      "generation_correctness": 0.91,
      "answer_accuracy": "t+",
      "retrieval_recall": {
        "found": ["doc-1", "doc-3"],
        "expected": ["doc-1", "doc-2"]
      }
    }
  }
]
```

Within `metrics`, each value is passed through exactly as stored on the raw
result: a numeric value, a classification string such as `t+`, or a retrieval
object shaped as `{ "found": [...], "expected": [...] }`. `ref`, `set`,
`ground_truth_uri`, `inference_uri`, and `evaluation_uri` are included when
present on the stored result.

`aggregate(results)` must return a finite `int` or `float`, or `None` to skip
the metric for that group. Booleans, `NaN`, and infinities fail the entire
request.

The repository's [`user-defined-aggregates`](./user-defined-aggregates)
folder is the recommended location for these functions during local
development. It is not copied into the catalog application; configure or mount
it explicitly. For example, start with
`catalog/user-defined-aggregates/efficiency.py`:

```python
def aggregate(results):
    correctness = [
        result["metrics"]["generation_correctness"]
        for result in results
        if "generation_correctness" in result["metrics"]
    ]
    latency = [
        result["metrics"]["meta_inference_time"]
        for result in results
        if "meta_inference_time" in result["metrics"]
    ]
    if not correctness or not latency:
        return None
    average_correctness = sum(correctness) / len(correctness)
    average_latency = sum(latency) / len(latency)
    if average_latency <= 0:
        return None
    return average_correctness / average_latency
```

This example reports average correctness per unit of average inference time, so
higher values indicate better efficiency.

Metric definitions are optional for custom aggregate metrics. If you create a
definition whose `name` matches the Python filename stem, the catalog can
normalize the returned value with `min` and `max`, control display order with
`order`, mark it important with `is_important`, and apply tags such as
`lower-is-better` or `elapsed_time`.

### Export Raw Metrics

Export experiment- or set-scoped raw metrics:

```text
GET /api/analysis/projects/{project}/experiments/{experiment}/metrics?format=json
GET /api/analysis/projects/{project}/experiments/{experiment}/metrics?format=csv
GET /api/analysis/projects/{project}/experiments/{experiment}/sets/{set}/metrics?format=json
GET /api/analysis/projects/{project}/experiments/{experiment}/sets/{set}/metrics?format=csv
```

JSON returns rows shaped as `{set, ref, iteration, metrics}`. CSV is a wide
table with `set`, `ref`, and `iteration` join keys followed by alphabetically
ordered metric columns. Structured retrieval metrics use
`<metric>.found` and `<metric>.expected` CSV columns containing JSON arrays.
Metric names that collide with join keys are prefixed with `metric.`.

`iteration` is the one-based source-order occurrence for each `(set, ref)`
pair. It is assigned across all result records, so gaps are possible when a
record has no exportable metrics. Records without both `set` and `ref`, and
annotation-only or metricless records, are omitted. Exports contain raw values,
not aggregate statistics, annotations, or runtime custom aggregate metrics.
`format` accepts only `json` or `csv`.

### Export Artifact Manifests

Export manifests for the exact stored inference and evaluation URIs:

```text
GET /api/analysis/projects/{project}/experiments/{experiment}/artifacts?format=jsonl&types=inference,evaluation
GET /api/analysis/projects/{project}/experiments/{experiment}/sets/{set}/artifacts?format=jsonl&types=inference
```

Use `format=json` for a JSON array or `format=jsonl` for one object per line.
Each row is `{type, set, ref, iteration, uri}` and uses the same `(set, ref,
iteration)` join key as raw metrics. `types` is a comma-separated list
containing `inference`, `evaluation`, or both (the default).

Manifests omit records without both `set` and `ref` and de-duplicate identical
`(type, uri)` entries. The catalog returns the URI stored on the result as-is;
it does not validate the URI, proxy blob contents, mint access tokens, or
create ZIP archives. For Azure Blob URIs, clients download directly using an
identity with blob access.

### Compare by Ref

Compare results grouped by reference (ground truth):

```bash
curl -i http://localhost:6010/api/projects/project-example/experiments/experiment-000/sets/my-set/compare-by-ref
```

This endpoint returns one aggregate result per ref within the requested set
after include/exclude tag filters are applied.

The main `compare` endpoint uses these per-ref aggregates internally to compute
`wins` and `ties` for each set-level aggregate metric. Version 1 applies exact
numeric comparison only; it does not use tolerance-based matching.

### Get Set Results

Get individual results for a specific set:

```bash
curl -i http://localhost:6010/api/projects/project-example/experiments/experiment-000/sets/my-set
```

### Optimize

Manually trigger optimization for an experiment:

```bash
curl -i -X PUT http://localhost:6010/api/projects/project-example/experiments/experiment-000/optimize
```

### Calculate Statistics

Enqueue a statistics calculation request:

```bash
curl -i -X POST -d '{ "project": "project-example", "experiment": "experiment-000" }' -H "Content-Type: application/json" http://localhost:6010/api/analysis/statistics
```

### Meaningful Tags Analysis

Analyze which tags have the most meaningful impact on a specific metric:

```bash
curl -i -X POST -d '{ "project": "project-example", "experiment": "experiment-000", "set": "my-set", "metric": "gpt-relevance", "compareTo": "Average" }' -H "Content-Type: application/json" http://localhost:6010/api/analysis/meaningful-tags
```

When runtime custom aggregates are enabled, `metric` may be either a built-in
aggregate metric name or a custom aggregate metric name produced by the request
described in [Runtime Custom Aggregate Metrics](#runtime-custom-aggregate-metrics).

### Download Support Documents

Download a support document (requires `ENABLE_DOWNLOAD=true`):

```bash
curl -i "http://localhost:6010/api/download?url=container/path/to/file.json"
```

### OpenAPI Documentation

The API includes Scalar documentation available at:

```text
http://localhost:6010/scalar/v1
```

## Docker

To build the catalog service, you must be at the root and run...

```bash
docker build --rm -t exp-catalog:latest -f catalog.Dockerfile .
```

This is necessary so that the UI can be built and injected into the catalog container in a single build command.

To enable runtime custom aggregate metrics in the container, mount a trusted
folder of Python files and set the related environment variables:

```bash
docker run \
  -p 6010:6010 \
  -e AZURE_STORAGE_ACCOUNT_CONNSTRING="<your-connection-string>" \
  -e CUSTOM_AGGREGATE_FUNCTIONS_PATH=/app/user-defined-aggregates \
  -e CUSTOM_AGGREGATE_PYTHON_EXECUTABLE=python3 \
  -e CUSTOM_AGGREGATE_TIMEOUT_SECONDS=30 \
  -v "$(pwd)/catalog/user-defined-aggregates:/app/user-defined-aggregates:ro" \
  exp-catalog:latest
```

`catalog.Dockerfile` installs `python3` in the runtime image. The
`catalog/aggregate-runtime` folder contains internal execution machinery, not
user functions. Replace the example bind mount with your
administrator-managed function folder before enabling the feature in shared
environments.
