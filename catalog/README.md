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

- **PATH_TEMPLATE** [OPTIONAL]: A template string for constructing URIs to inference and evaluation output files. Use `{0}` as a placeholder for the URI.

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

## Concepts

The catalog is organized around the following concepts:

- **Project**: A project is a collection of experiments that are all tied to the same baseline. During that project, you would expect that the grounding data and evaluation script/metrics/configuration would not change.

- **Project Baseline**: A project baseline is a special experiment that is created for each project before experimentation is done. This experiment will have an experimentation run that can be used as a comparison point for all other experiments in the project. Did they get better or worse than this baseline?

- **Experiment**: Inside a project, developers will create experiments with a hypothesis. This experiment will have a number of evaluation runs to test code, configuration, workflow, etc. - the ultimate goal of which of is to prove or disprove the hypothesis.

- **Experiment Baseline**: The first evaluation run of an experiment is generally the baseline for that experiment. Before a developer starts changing things, they need to record what the performance of the system is. If the experiment is started right after the project is started, then this baseline is probably the same as the project baseline, but as code gets merged during the project there will be drift.

- **Set**: A set is a collection of results that are all related to the same evaluation run. For instance, running 3 iterations of 12 ground truths might be considered a single set. If you later decided you needed 2 more iterations, you could add to the set.

- **Ref**: A ref is a reference to a entity that is being evaluated. Almost always this should be a reference to the ground truth. It is common that you might run multiple iterations of the same ground truth, using a ref is a way to aggregate those as well as compare the performance of ground truths across evaluation runs.

## Web UI

The UI for the catalog is written in Svelte in the [ui](../ui) folder. Generally, the UI is hosted inside the catalog and that means the UI must be built and copied into the catalog project. To build and copy the UI:

```bash
cd ui
npm install
npm run build
cp -r dist/* ../catalog/wwwroot/
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

You can also include optional URIs to inference and evaluation output files:

```bash
curl -i -X POST -d '{ "ref": "q1", "set": "baseline-0", "inference_uri": "path/to/inference.json", "evaluation_uri": "path/to/evaluation.json", "metrics": { "gpt-coherence": 2, "gpt-relevance": 3 } }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/experiments/project-baseline/results
```

You do not have to pre-define any metrics, anything you want to send into the catalog will be accepted.

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

You can filter the comparison to specific sets or filter by tags:

```bash
curl -i "http://localhost:6010/api/projects/project-example/experiments/experiment-000/compare?sets=set1,set2&include-tags=tag1,tag2&exclude-tags=tag3"
```

## Annotate

If you want to annotate a set you could do it like this...

```bash
curl -i -X POST -d '{ "set": "alpha", "annotations": [ { "text": "commit 3746hf", "uri": "https://dev.azure.com/commit" } ] }' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-01/experiments/experiment-01/results
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
curl -i -X PUT -d '[{ "name": "gpt-coherence", "higherIsBetter": true }]' -H "Content-Type: application/json" http://localhost:6010/api/projects/project-example/metrics
```

### Compare by Ref

Compare results grouped by reference (ground truth):

```bash
curl -i http://localhost:6010/api/projects/project-example/experiments/experiment-000/sets/my-set/compare-by-ref
```

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

### Download Support Documents

Download a support document (requires `ENABLE_DOWNLOAD=true`):

```bash
curl -i "http://localhost:6010/api/download?url=container/path/to/file.json"
```

### Swagger Documentation

The API includes Swagger documentation available at:

```text
http://localhost:6010/swagger
```

## Sample Data

The [sample](sample) folder contains files you can use to populate a project with sample data. To use it, create a project and then upload the sample files directly into the project's Azure Blob Storage container. The sample includes:

- **baseline.jsonl**: A baseline experiment with 1 set (`20251210152915`)
- **inference_models.jsonl**: A single experiment with 3 permutations (`20251209170502`, `20251210092001`, `20251210094431`)
- **metric_definitions.json**: Metric definitions covering retrieval metrics (accuracy, precision, recall, DCG, F1, MRR), generation metrics (correctness, faithfulness, factuality, should-answer accuracy), and meta metrics (inference/eval time, cost, tokens)
- **tag_multiturn.json**: Tag for multi-turn ground truths
- **tag_singleturn.json**: Tag for single-turn ground truths
- **tag_source_GTC.json**: Tag for GTC-sourced ground truths
- **tag_source_TQ.json**: Tag for TQ-sourced ground truths

## Docker

To build the catalog service, you must be at the root and run...

```bash
docker build --rm -t exp-catalog:latest -f catalog.Dockerfile .
```

This is necessary so that the UI can be built and injected into the catalog container in a single build command.
