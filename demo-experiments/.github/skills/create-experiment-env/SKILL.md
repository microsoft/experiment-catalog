---
name: create-experiment-env
description: This skill creates per-agent experiment environment files by copying a baseline .test.env template and overriding AML_EXPERIMENT_NAME and AML_INF_ENV_PATH for each agent provisioned in Step 6.
---

# Create Experiment Environment Files

This skill creates experiment-level `.env` files for each provisioned agent. It reads a baseline `.test.env` template and generates one `exp_NN.env` file per agent in the experiment directory, with key values replaced.

## Prerequisites

Before running this skill, the `provision-agents` skill (Step 6) must have saved an `agent_results.json` file into the experiment directory. This file contains the JSON array with `promptFile`, `envFile`, and `agentName` for each provisioned agent.

If the published prep repo does not contain a top-level `experiment/` directory, set `AML_RUNNER_DIR` to the downstream AML runner directory that contains `run.py`. The script resolves the baseline `.test.env` in this order:

1. `AML_EXPERIMENT_TEMPLATE_PATH`
2. `AML_RUNNER_DIR/.test.env`
3. `<experiment-dir>/.test.env`

## How to use

1. **Save agent results to file** — After the `provision-agents` skill completes, save its output JSON array to `<experiment-dir>/agent_results.json`.

2. **Run the command** from the workspace root:

```sh
node .github/skills/create-experiment-env/create-experiment-env.js "<experiment-dir>" "<experiment-name>" [catalogProject] [catalogAppUri] [catalogOidcClientId]
```

For example:

```sh
node .github/skills/create-experiment-env/create-experiment-env.js ".../exp-top-k" "top-k"
```

With catalog parameters:

```sh
node .github/skills/create-experiment-env/create-experiment-env.js ".../exp-top-k" "top-k" "my-project" "https://myapp.azurewebsites.net" "00000000-0000-0000-0000-000000000000"
```

The script reads `agent_results.json` from the experiment directory automatically.

## Parameters

| Parameter             | Type   | Required | Description                                                                                     |
|-----------------------|--------|----------|-------------------------------------------------------------------------------------------------|
| `experimentDir`       | string | Yes      | Absolute path to the experiment directory (e.g. `exp-my-experiment`).                           |
| `experimentName`      | string | Yes      | The cleaned experiment name.                                                                    |
| `catalogProject`      | string | No       | Catalog project name. If provided along with `catalogAppUri` and `catalogOidcClientId`, catalog env vars are set. |
| `catalogAppUri`       | string | No       | Catalog app URI (e.g. `https://myapp.azurewebsites.net`).                                       |
| `catalogOidcClientId` | string | No       | Catalog OIDC client ID (used to build the app ID URI).                                          |

## Input File

| File                                  | Description                                                                                      |
|---------------------------------------|--------------------------------------------------------------------------------------------------|
| `<experimentDir>/agent_results.json`  | JSON array returned by `provision-agents` containing `envFile` and `agentName` for each agent. For prompt permutations, entries also include `promptFile`; for model permutations, entries include `modelDeployment`. |

## Output

On success, the script prints a JSON array to stdout with one object per experiment env file:

```json
[
  {
    "agentName": "top-k-prompt-01",
    "agentEnvFile": "/path/to/exp-top-k/agent_01.env",
    "experimentEnvFile": "/path/to/exp-top-k/exp_01.env"
  }
]
```

For model permutations:

```json
[
  {
    "agentName": "model-test-model-01",
    "agentEnvFile": "/path/to/exp-model-test/agent_01.env",
    "experimentEnvFile": "/path/to/exp-model-test/exp_01.env"
  }
]
```

## Behavior

- Preserves all comments, blank lines, and structure from the resolved `.test.env` template.
- Only overrides `AML_EXPERIMENT_NAME` and `AML_INF_ENV_PATH`; all other values remain as-is.
- When catalog parameters are provided, also sets:
  - `ENABLED_ACTIONS` appends `catalog` to the existing value, or creates `ENABLED_ACTIONS=catalog` if missing.
  - `EVAL_SET_CATALOG_URL` uses `<catalogAppUri>/api` when the key is not already present in the template.
  - `EVAL_SET_CATALOG_PROJECT` uses `<catalogProject>` when the key is not already present in the template.
  - `EVAL_SET_CATALOG_API_APP_ID_URI` uses `api://<catalogOidcClientId>` when the key is not already present in the template.
- Exits with code 1 if a baseline `.test.env` cannot be resolved, if `agentResults` is empty, or if any agent env filename does not match the expected pattern (`agent_NN.env`).
