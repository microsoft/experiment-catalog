# Catalog

A visual tool for comparing experiment runs. Check out [experiment-catalog](https://github.com/plasne/experiment-catalog/) for more information.

## Enabling Catalog

1. Check out `https://github.com/plasne/experiment-catalog/`. This path will be configured later in `.env`.
2. Enable Catalog in `SetupEnv.ps1` with the `-EnableCatalog` flag when running the infra setup. By default `-EnableAll` will enable Catalog.
3. Create the following `.env` file and populate the appropriate values.

```txt
CATALOG_DIR=<PATH>\experiment-catalog
AZURE_RESOURCE_GROUP=...
AZURE_CONTAINER_APP_ENV=...-d-cae
AZURE_CONTAINER_APP_NAME=catalog
AZURE_CONTAINER_REGISTRY_NAME=...acr
AZURE_CONTAINER_REGISTRY_RESOURCE_GROUP=...
AZURE_CONTAINER_APP_REG_NAME=catalog
AZURE_STORAGE_ACCOUNT_NAME=...catalogsa
OPEN_TELEMETRY_CONNECTION_STRING=...
AZURE_USER_ASSIGNED_IDENTITY_NAME=...
OIDC_AUTHORITY=https://login.microsoftonline.com/16b3c013-d300-468d-ac64-7eda0820b6d3/v2.0
OIDC_AUDIENCES=...
OIDC_CLIENT_ID=...
```

4. Go to App registration for `catalog` and create a secret. Make sure you keep the secret value somewhere handy.
5. Run `.\deploy-container-app.ps1`.
6. Add secret in Container App using the secret.
7. Reference the secret in the environment with `OIDC_CLIENT_SECRET`.
8. Now you are ready to test the endpoint. You should be prompted to login. Create a project and experiment.
9. In the experiment `.env` file, add the following.

```text
ENABLED_ACTIONS=catalog
EVAL_SET_CATALOG_URL=https://....azurecontainerapps.io/api
EVAL_SET_CATALOG_PROJECT=...
EVAL_SET_CATALOG_API_APP_ID_URI=api://...
```

10. Make sure `AML_EXPERIMENT_NAME` is consistent with the experiment name you used.
11. Now you can run a smoke test. Once completed, the catalog should be populated.

## Configuration

### Experiment Environment Variables

These variables are set in the experiment `.env` file with the `EVAL_SET_` prefix. The runner strips the prefix before passing them to the AML evaluation job, so the catalog action reads them without the prefix.

| Experiment `.env` Variable        | Action Reads As          | Required | Description                                                                                                |
| --------------------------------- | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `EVAL_SET_CATALOG_URL`            | `CATALOG_URL`            | Yes      | Base URL of the catalog API (e.g., `https://<app>.azurecontainerapps.io/api`)                              |
| `EVAL_SET_CATALOG_PROJECT`        | `CATALOG_PROJECT`        | Yes      | Project name in the catalog                                                                                |
| `EVAL_SET_CATALOG_API_APP_ID_URI` | `CATALOG_API_APP_ID_URI` | No       | App ID URI for bearer token auth (e.g., `api://...`). If omitted, requests are sent without authentication |

`ENABLED_ACTIONS` must include `catalog` (comma-delimited if multiple actions are enabled).

`AML_EXPERIMENT_NAME` must match the experiment name created in the catalog UI. The runner normalizes this value to lowercase with spaces replaced by underscores.

### Prefix Stripping

The `EVAL_SET_` prefix is stripped by `create_dict_from_env` in `run_utils.py` before the variables are injected into the AML job environment. You can also use `EVAL_OVERRIDE_` to override individual values loaded from the env file.

## Metrics and Payload

### Metrics Source

The catalog action looks for a `$metrics` key in two places:

1. The inference response (`inf_response["$metrics"]`)
2. The evaluation results (`eval_results["$metrics"]`)

If both contain `$metrics`, they are merged. Evaluation metrics take priority over inference metrics when keys overlap.

### Metrics Cleaning

Before submission, metrics are filtered:

- `NaN` float values are removed
- String values are removed unless they are a recognized classification outcome: `t+`, `t-`, `f+`, `f-` (case-insensitive)
- Numeric values (int and float) are kept as-is

If neither `eval_results` nor `inf_response` contains `$metrics`, the result is skipped entirely.

### API Payload

The action posts to:

```text
POST {CATALOG_URL}/projects/{CATALOG_PROJECT}/experiments/{experiment_name}/results
```

With the following JSON body:

```json
{
  "ref": "<ground_truth_ref>_<iteration>",
  "set": "<aml_job_id>",
  "inference_uri": "<inference_base_path>/<filename>",
  "evaluation_uri": "<eval_base_path>/<filename>",
  "metrics": {
    "metric_key": 0.95,
    "another_metric": "t+"
  }
}
```

| Field            | Source                                                               | Description                                                         |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ref`            | `job_details["ground_truth_ref"]` + `_` + `job_details["iteration"]` | Unique reference for this ground truth item                         |
| `set`            | `job_details["aml_job_id"]`                                          | Groups all results from the same AML job run                        |
| `inference_uri`  | `job_details["inference_base_path"]` / last segment of `filename`    | Storage URI of the inference output file                            |
| `evaluation_uri` | `job_details["eval_base_path"]` / last segment of `filename`         | Storage URI of the evaluation output file                           |
| `metrics`        | Merged and cleaned `$metrics` from eval and inference                | Key-value pairs of metric names to numeric or classification values |

### Cold-Start Warm-Up

On the first request, the action sends a GET to `{CATALOG_URL}/projects` with a 120-second timeout to absorb Container App cold-start latency. Subsequent requests use a 15-second timeout.
