---
title: Experiment Catalog
description: Catalog, compare, and analyze experiment runs with a .NET API, Svelte UI, and deterministic development harness.
ms.date: 2026-09-02
ms.topic: overview
---

## Experiment Catalog

A tool for cataloging, comparing, and analyzing experiment results. The Experiment Catalog enables teams to track evaluation runs across projects, compare metrics against baselines, and identify performance regressions or improvements in AI/ML experimentation workflows.

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/microsoft/experiment-catalog/badge)](https://scorecard.dev/viewer/?uri=github.com/microsoft/experiment-catalog)
[![CodeQL](https://github.com/microsoft/experiment-catalog/actions/workflows/codeql.yml/badge.svg)](https://github.com/microsoft/experiment-catalog/actions/workflows/codeql.yml)

## Overview

The Experiment Catalog is designed for teams running iterative experiments. It is particularly useful for AI evaluation pipelines where you need to:

- Track results across multiple evaluation runs
- Compare experiment metrics against established baselines
- Analyze performance trends and identify regressions
- Filter and drill down into specific ground-truth results
- Annotate experiments with links to commits, configurations, or documentation

Watch these walkthroughs:

- [Installation](https://youtu.be/KHsnsHpdq00?si=XsN7gJrInF1GvrO-) (6:08)
- [Usage](https://youtu.be/CFwjwU7okl0?si=007W84sZ3tyVRWI6) (30:56)
- [Configuration](https://youtu.be/-ZjgL27pGNk?si=WFFrDMWxGrQK3EZn) (16:36)

## Architecture

The application consists of several main components:

| Component         | Description                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| **catalog**       | ASP.NET Core API that stores experiment data in Azure Blob Storage                |
| **MCP interface** | MCP tools hosted by the catalog API for project, experiment, and analysis actions |
| **cli**           | Python package and CLI for publishing metrics from CSV files or notebooks          |
| **ui**            | Svelte frontend for visualizing and comparing experiments                         |
| **catalog.tests** | xUnit tests for the catalog API                                                   |

## Key Concepts

- A project is a collection of experiments sharing the same baseline, grounding data, and evaluation configuration. It typically aligns to a sprint. See [the experimentation process](./experimentation-process.md) for details.
- An experiment is a hypothesis-driven collection of evaluation runs within a project.
- A set is a group of results from a single evaluation run, also commonly called a permutation (for example, 3 iterations × 12 ground truths).
- A ref identifies a specific ground-truth entity being evaluated, allowing aggregation across iterations.
- A baseline is a reference point for comparison at the project or experiment level.

## Features

### Experiment Management

- Create projects and experiments with hypotheses
- Create projects, experiments, and push metric rows from the
  [Experiment Catalog CLI](./cli/README.md) or the same Python API in notebooks
- Set project-level and experiment-level baselines
- Record arbitrary metrics without requiring metric definitions, while
  optionally adding metric-definition descriptions for inline comparison context
- Annotate sets with commit hashes, configuration links, or notes

### Comparison & Analysis

- Compare experiment results against baselines per set or per ref
- View aggregate statistics across sets
- Aggregate structured retrieval metrics with pooled or per-ref precision,
  recall, and F1
- Surface response-only aggregate comparison metadata such as distinct
  contributing refs and per-ref WIN/TIE counts against the experiment baseline
- Compute trusted runtime-only custom aggregate metrics from
  administrator-managed Python files during comparison and meaningful-tags
  analysis (see the
  [Catalog README](./catalog/README.md#runtime-custom-aggregate-metrics))
- Drill down into individual ground-truth results
- Compare metrics across multiple evaluation runs
- Export raw metrics and direct-download artifact manifests at experiment or
  set scope (see the [catalog API guide](./catalog/README.md#export-raw-metrics))

### Filtering Capabilities

- Use the metrics filter to show or hide specific metrics in comparison views
- Use the tags filter to select ground truths by tags extracted from source data
- Use the free filter to write custom expressions that find specific results

#### Free Filter Examples

```text
# Find poor performers
[generation_correctness] < 0.8

# Find regressions compared to baseline
[generation_correctness] < [baseline.generation_correctness]

# Find significant improvements (>20% better)
[generation_correctness] > [baseline.generation_correctness] * 1.2

# Find absolute metric differences
[generation_correctness] - [baseline.generation_correctness] > 0.05

# Find noisy aggregate metrics by standard deviation
result.metrics["generation_correctness"].std_dev > 0.10

# Find unstable aggregate metrics by coefficient of variation
result.metrics["generation_correctness"].coefficient_of_variation > 0.20

# Complex analysis - retrieval got worse but generation improved
[retrieval_recall] < [baseline.retrieval_recall] AND [generation_correctness] > [baseline.generation_correctness]

# Find specific ground truths
ref == "TQ10" OR ref == "TQ25"
```

You can find out more about the Free Filter syntax and use cases in the [UI README](./ui/README.md#free-filter).

## Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Node.js 20+](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/downloads/) for the CLI, notebook
  API, and optional runtime custom aggregate metrics
- [Docker](https://www.docker.com/) (for containerized deployment)
- Azure Storage Account
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (when using `INCLUDE_CREDENTIAL_TYPES=azcli`)

### Running Locally

#### Experiment Catalog CLI

Install the reusable CLI and notebook package:

```bash
python3 -m venv cli/.venv
cli/.venv/bin/python -m pip install -e ./cli
source cli/.venv/bin/activate
export EXPERIMENT_CATALOG_BASE_URL=http://localhost:6010/api
experiment-catalog --help
```

For example:

```bash
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

See the [CLI guide](./cli/README.md) for the CSV format, dry runs, metric
pushes, and notebook examples.

#### Backend API

1. Navigate to the catalog directory:

   ```bash
   cd catalog
   ```

2. Create a `.env` file with required configuration:

   ```env
   # if using az-cli for login
   INCLUDE_CREDENTIAL_TYPES=azcli
   AZURE_STORAGE_ACCOUNT_NAME=<your-storage-account>

   # or if using a connection string
   AZURE_STORAGE_ACCOUNT_CONNSTRING=<your-connection-string>
   ```

   Full configuration for the API can be found in the [Catalog README](./catalog/README.md).
   Optional runtime custom aggregate metrics use the
   `CUSTOM_AGGREGATE_*` settings documented in the
   [Catalog README](./catalog/README.md#runtime-custom-aggregate-metrics).

3. Run the API:

   ```bash
   dotnet run
   ```

The API will be available at `http://localhost:6010` with API documentation at `/scalar/v1`.

#### Frontend UI

1. Navigate to the UI directory:

   ```bash
   cd ui
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

The UI will be available at `http://localhost:6020`.

## Docker Deployment

Build the complete application (UI + API) as a Docker container:

```bash
docker build --rm -t exp-catalog:latest -f catalog.Dockerfile .
```

Run the container:

```bash
docker run -p 6010:6010 -e AZURE_STORAGE_ACCOUNT_CONNSTRING="<your-connection-string>" exp-catalog:latest
```

You can instead provide `AZURE_STORAGE_ACCOUNT_NAME` when the container has access to a supported Azure credential, such as a service principal or managed identity.

The published runtime image includes `python3` for optional runtime custom
aggregate metrics. For local development, place functions in
[`catalog/user-defined-aggregates`](./catalog/user-defined-aggregates) and set
`CUSTOM_AGGREGATE_FUNCTIONS_PATH` to that folder. For deployments, mount a
trusted folder of `.py` files and set
`CUSTOM_AGGREGATE_FUNCTIONS_PATH` as described in the
[Catalog README](./catalog/README.md#runtime-custom-aggregate-metrics).

## ISE OSS Usage Attribution Disclosure

Experiment Catalog deployment automation may include Microsoft ISE OSS usage
attribution for Azure Resource Manager (ARM) control-plane operations. This is
not Experiment Catalog application telemetry. When enabled, deployment tools
append Asset ID `acce1e78-0cec-4c66-9e3b-900c69b1c199` to the ARM `User-Agent`
so Microsoft ISE can measure adoption of this open source tool. The catalog
application runtime does not add this ID to normal Blob Storage data-plane
operations such as creating project containers or writing experiment results.

For ARM control-plane requests that include this Asset ID, Microsoft collects
aggregated request telemetry such as `tenantId`, `subscriptionId`, `userAgent`,
`action`, and `statusCode`. This reporting is intended for aggregate OSS usage
measurement and does not collect catalog project names, experiment names,
results, prompts, customer data, or Blob Storage contents.

Users are free to opt out. Opting out does not affect Experiment Catalog
functionality. Users can opt out by removing the Asset ID from generated
deployment artifacts or disabling the attribution flag exposed by those
artifacts. For command-based deployment, opt out by not setting
`AZURE_HTTP_USER_AGENT` to include this Asset ID. Underlying tools also have
their own telemetry controls:

- Azure CLI telemetry opt-out: <https://learn.microsoft.com/cli/azure/azure-cli-configuration#cli-configuration-values>
- Terraform AzureRM provider telemetry opt-out: <https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs#disable_terraform_partner_id-1>

Microsoft open source telemetry guidance is available at
<https://docs.opensource.microsoft.com/releasing/general-guidance/telemetry/>.

## Development Harness

A `make`-based harness provides deterministic commands for local development and CI. Run all commands from the repository root:

| Command          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `make setup`     | Install dependencies and prepare the dev environment |
| `make smoke`     | Build the .NET solution and UI                       |
| `make lint`      | Run the configured repository linters                |
| `make typecheck` | Run type checking across all projects                |
| `make check`     | Run both lint and typecheck                          |
| `make test`      | Run the full test suite                              |
| `make security`  | Run the configured repository security checks        |
| `make ci`        | CI-equivalent local run (smoke + check + test)       |

Start with `make setup` after cloning, then use `make ci` before pushing changes to verify everything passes locally.

## Governance and Branch Policy

This repository uses branch protection and CI checks as quality gates for `main`.

Required merge policy:

- Pull requests are required for all changes to `main`.
- At least 2 approvals are required before merge.
- Code owner review is required for protected areas.
- Stale approvals are dismissed when new commits are pushed.
- The latest push must be approved by someone other than its author.
- All review threads must be resolved before merge.
- Required checks must pass before merge: `Harness CI`, `CodeQL / Analyze (csharp)`, `CodeQL / Analyze (javascript)`, `CodeQL / Analyze (python)`, `PR Title Validation / validate-title`, and `Scorecard analysis`.
- Force pushes and branch deletion are blocked on `main`.

These checks are defined in repository workflows and should be set as required status checks in GitHub branch rules.

## Community and Roadmap

Current focus areas:

- Expand API, MCP, and UI test coverage.
- Improve analytics and baseline-comparison usability in the UI.
- Harden operational readiness with clearer SLO reporting.

Contribution and triage cadence:

- New issues are triaged weekly.
- Pull requests are reviewed based on priority and reviewer availability.
- Security reports follow the process in [SECURITY.md](./SECURITY.md).

## API Usage

All examples for using the API can be found in [catalog.http](./catalog/catalog.http).

## Synthetic and Sample Data Provenance

This repository includes sample data intended only for local demos, testing, and validation workflows.

Data provenance policy:

- Sample files are non-production artifacts and must not contain customer or regulated data.
- Any generated or synthetic examples should be clearly labeled in-file and in documentation.
- Contributors must document data origin, generation method, and intended usage when adding new sample datasets.

The runnable synthetic
[`cli/examples/notebook-results.csv`](./cli/examples/notebook-results.csv)
demonstrates the push format without using production data.

## Community Triage and Ownership

- Issue intake and triage workflow: [docs/TRIAGE.md](./docs/TRIAGE.md)
- Maintainer role model and escalation paths: [MAINTAINERS.md](./MAINTAINERS.md)
