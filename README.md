# Experiment Catalog

A comprehensive tool for cataloging, comparing, and analyzing experiment results. The Experiment Catalog enables teams to track evaluation runs across projects, compare metrics against baselines, and identify performance regressions or improvements in AI/ML experimentation workflows.

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/plasne/experiment-catalog/badge)](https://scorecard.dev/viewer/?uri=github.com/plasne/experiment-catalog)

## Overview

The Experiment Catalog is designed for teams running iterative experiments—particularly useful for AI evaluation pipelines where you need to:

- Track results across multiple evaluation runs
- Compare experiment metrics against established baselines
- Analyze performance trends and identify regressions
- Filter and drill down into specific ground-truth results
- Annotate experiments with links to commits, configurations, or documentation

There are some videos you can watch:

- [Installation](https://youtu.be/KHsnsHpdq00?si=XsN7gJrInF1GvrO-).............6:08
- [Usage](https://youtu.be/CFwjwU7okl0?si=007W84sZ3tyVRWI6)..................30:56
- [Configuration](https://youtu.be/-ZjgL27pGNk?si=WFFrDMWxGrQK3EZn).......16:36

## Architecture

The application consists of several main components:

| Component      | Description                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **catalog**    | C# .NET backend that stores experiment data in Azure Blob Storage                               |
| **ui**         | Svelte-based frontend for visualizing and comparing experiments                                 |
| **evaluator**  | An evaluation runner that can execute inference and evaluation then send results to the catalog |
| **evaluation** | An example evaluation script                                                                    |

## Key Concepts

- **Project**: A collection of experiments sharing the same baseline, grounding data, and evaluation configuration. Typically this aligns to a sprint. This is described in more detail in [the experimentation process](./experimentation-process.md).
- **Experiment**: A hypothesis-driven collection of evaluation runs within a project.
- **Set**: A group of results from a single evaluation run - also commonly called a permutation (e.g., 3 iterations × 12 ground truths).
- **Ref**: A reference to a specific ground-truth entity being evaluated, allowing aggregation across iterations.
- **Baseline**: A reference point for comparison. This can be set at both project and experiment levels.

## Features

### Experiment Management

- Create projects and experiments with hypotheses
- Set project-level and experiment-level baselines
- Record arbitrary metrics without pre-definition
- Annotate sets with commit hashes, configuration links, or notes

### Comparison & Analysis

- Compare experiment results against baselines
- View aggregate statistics across sets
- Drill down into individual ground-truth results
- Compare metrics across multiple evaluation runs

### Filtering Capabilities

- **Metrics Filter**: Show/hide specific metrics in comparison views
- **Tags Filter**: Filter ground truths by tags extracted from source data
- **Free Filter**: Write custom filter expressions to find specific results

#### Free Filter Examples

```text
# Find poor performers
[generation_correctness] < 0.8

# Find regressions compared to baseline
[generation_correctness] < [baseline.generation_correctness]

# Find significant improvements (>20% better)
[generation_correctness] > [baseline.generation_correctness] * 1.2

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
- [Python 3.9+](https://www.python.org/) (for tags utility)
- [Docker](https://www.docker.com/) (for containerized deployment)
- Azure Storage Account

### Running Locally

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

3. Run the API:

   ```bash
   dotnet run
   ```

The API will be available at `http://localhost:6010` with Swagger documentation at `/swagger`.

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
docker run -p 6010:6010 \
  -e AZURE_STORAGE_ACCOUNT_NAME=<your-storage-account> \
  exp-catalog:latest
```

## Development Harness

A `make`-based harness provides deterministic commands for local development and CI. Run all commands from the repository root:

| Command          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `make setup`     | Install dependencies and prepare the dev environment |
| `make smoke`     | Fast sanity check (build + quick tests)              |
| `make lint`      | Run linters across all projects                      |
| `make typecheck` | Run type checking across all projects                |
| `make check`     | Run both lint and typecheck                          |
| `make test`      | Run the full test suite                              |
| `make security`  | Run security scanning                                |
| `make ci`        | CI-equivalent local run (smoke + check + test)       |

Start with `make setup` after cloning, then use `make ci` before pushing changes to verify everything passes locally.

## API Usage

All examples for using the API can be found in [catalog.http](./catalog/catalog.http).

## Evaluator Usage

The evaluator is a .NET console application that can run inference and evaluation, then send results to the Experiment Catalog. You can find the evaluator in the [evaluator](./evaluator) directory with full instructions in the [evaluator README](./evaluator/README.md).

## Evaluation Example

You can find an example evaluation script in the [evaluation](./evaluation) directory.
