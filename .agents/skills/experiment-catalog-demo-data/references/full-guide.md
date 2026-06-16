# Generate Demo Data Full Guide

Populate a running Experiment Catalog instance with realistic demo data for
development, testing, or demonstration. The script creates projects,
experiments, permutations, results, metric definitions, and tags.

## Execution Notes

- Keep demo-data generation separate from deployment or pipeline tasks.
- Store generated summaries in session artifacts when available.
- Surface full logs only when a command fails or the user asks for details.
- This workflow calls the catalog API. It does not perform Azure ARM
  control-plane operations and does not use the ISE asset telemetry ID.

## Prerequisites

- Python 3.10 or later
- `requests` (`pip install requests`)
- A running catalog backend, default `http://localhost:6010`

## Quick Start

```bash
python scripts/generate_demo_data.py
```

Override the base URL:

```bash
python scripts/generate_demo_data.py --base-url http://localhost:8080
```

## Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `--base-url` | `http://localhost:6010` | Base URL of the catalog API |
| `--results` | `300` | Number of result refs per permutation |

## Created Data

Projects:

- `sprint01`
- `sprint02`

Experiments per project:

| Experiment | Hypothesis | Permutations |
| --- | --- | --- |
| `top-k` | Varying retrieval top-k improves accuracy | `top-k-3`, `top-k-5`, `top-k-10` |
| `models` | Larger models improve generation quality at cost/latency tradeoff | `gpt-4o-mini`, `gpt-4o`, `gpt-4.1` |

Metric definitions:

- `retrieval_accuracy`
- `retrieval_precision`
- `retrieval_recall`
- `generation_correctness`
- `generation_faithfulness`
- `meta_inference_time`
- `meta_inference_cost`

Tags:

- `multi-turn`
- `complex-query`
- `domain:finance`
- `domain:legal`

The first permutation in each experiment is set as the experiment baseline.

## Authentication For Deployed Instances

When running against a deployed catalog with OIDC or EasyAuth enabled, acquire a
token and pass it to API calls. If adapting the script, add an authorization
header to the `requests` session:

```bash
TOKEN=$(az account get-access-token --resource api://<appId> --query accessToken -o tsv)
```

Never disable authentication on a deployed catalog instance to work around
`401` errors.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ConnectionError` | Confirm the catalog backend is running and reachable |
| `400 Bad Request` | Check project, experiment, metric, and tag payloads |
| Missing `requests` | Run `pip install requests` |
| `401 Unauthorized` | Acquire and pass a Bearer token |
| `404` when posting runner results | Create the project and experiment before posting results |

> Brought to you by microsoft/experiment-catalog
