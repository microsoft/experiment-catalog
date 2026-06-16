---
name: experiment-catalog-demo-data
description: Generate realistic demo data for the experiment catalog including projects, experiments, permutations, results with metrics, metric definitions, and tags.
license: MIT
compatibility: Requires Python 3.10+, requests, and a reachable Experiment Catalog API.
metadata:
  spec_version: "1.0"
  version: "1.0.0"
  catalog_skill_version: "1.0.0"
  catalog_project: "microsoft/experiment-catalog"
  source_repository: "https://github.com/plasne/agent-skills"
---

## Execution Model

> [!IMPORTANT]
> Do not execute this skill directly in the main thread. Delegate the data
> generation task to its own sub-agent and pass this skill path to that
> sub-agent.

Keep demo-data generation separate from deployment or pipeline tasks. Store the
created dataset summary in session artifacts instead of replaying bulk logs.

# Generate Demo Data

Use this skill to populate a running Experiment Catalog instance with realistic
sample projects, experiments, permutations, results, metric definitions, and
tags. Open `references/full-guide.md` for the long-form walkthrough.

This skill uses the catalog API and does not perform Azure ARM control-plane
provisioning. Do not apply the ISE asset telemetry ID to demo-data API calls.

## Prerequisites

- Python 3.10+
- `requests`
- a reachable catalog API, usually `http://localhost:6010`

## Fast Path

Run with defaults:

```bash
python scripts/generate_demo_data.py
```

Override the target:

```bash
python scripts/generate_demo_data.py --base-url http://localhost:8080
```

## Key Parameters

- `--base-url`: catalog API base URL
- `--results`: results per permutation, default `300`

## What The Script Creates

- two demo projects
- multiple experiments per project
- multiple permutations per experiment
- metric definitions
- tags on refs
- randomized but realistic result rows

## Validation Checklist

Verify all of the following before handoff:

- the target catalog is reachable
- projects and experiments exist after the run
- results were written at the expected scale
- any generated artifact or summary was saved for reuse

## Local References

- Extended instructions and troubleshooting: `references/full-guide.md`
