---
name: run-experiment
description: This skill runs the AML evaluation pipeline (run.py) once per experiment environment file in the experiment directory. It passes the hypothesis and experiment type annotations for each run using a configurable AML runner directory.
---

# Run Experiment

This skill kicks off the AML evaluation pipeline by invoking `run.py` once for each `exp_NN.env` file in the experiment directory. Each invocation runs a separate pipeline job in Azure ML. It supports both prompt and model permutations.

## Prerequisites

Before running this skill, the `create-experiment-env` skill (Step 8) must have created `exp_NN.env` files in the experiment directory.

If the published prep repo does not contain a top-level `experiment/` directory, set `AML_RUNNER_DIR` to the downstream AML runner directory that contains `run.py`.

## How to use

Run the command from the workspace root:

```sh
node .github/skills/run-experiment/run-experiment.js "<experiment-dir>" "<hypothesis>" "<experiment-type>"
```

For example:

```sh
node .github/skills/run-experiment/run-experiment.js ".../exp-top-k" "Increasing top-k improves answer quality" "generation"
```

## Parameters

| Parameter        | Type   | Required | Description                                                                                          |
|------------------|--------|----------|------------------------------------------------------------------------------------------------------|
| `experimentDir`  | string | Yes      | Absolute path to the experiment directory containing `exp_NN.env` files. |
| `hypothesis`     | string | Yes      | The experiment hypothesis captured during setup (passed as `--hypothesis` to `run.py`).               |
| `experimentType` | string | Yes      | The experiment type captured during setup (passed as `--annotations` to `run.py` as `experiment_type=<value>`). |

## Output

On success, the script prints a JSON array to stdout with one object per pipeline run:

```json
[
  {
    "envFile": "/path/to/exp-top-k/exp_01.env",
    "status": "submitted",
    "pipelineTimestamp": "20260213120000",
    "studioUrl": "https://ml.azure.com/..."
  }
]
```

| Field              | Type           | Description                                                                 |
|--------------------|----------------|-----------------------------------------------------------------------------|
| `envFile`          | string         | Absolute path to the experiment env file used for this run.                 |
| `status`           | string         | Always `"submitted"` on success.                                            |
| `pipelineTimestamp` | string \| null | The pipeline timestamp identifier parsed from `run.py` output, or `null`.   |
| `studioUrl`        | string \| null | The Azure ML Studio URL for the pipeline job, or `null` if not found.       |

## Behavior

- Discovers all `exp_*.env` files in the experiment directory (sorted alphabetically).
- For each env file, invokes `uv run python run.py --env_path <env-file> --hypothesis "<hypothesis>" --annotations "experiment_type=<experimentType>"` from the resolved AML runner directory.
- Captures stdout/stderr from each run and includes it in the results.
- Exits with code 1 if no experiment env files are found, if the AML runner directory cannot be resolved, or if any pipeline submission fails.
