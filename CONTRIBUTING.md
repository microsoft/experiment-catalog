# Contributing to Experiment Catalog

## Overview

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit [https://cla.microsoft.com](https://cla.microsoft.com).

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide a CLA and decorate the pull request appropriately, for example with a label or comment. Follow the instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

## Before you start

* Search existing issues and pull requests before opening a new one.
* Open an issue before starting substantial feature work so the approach can be discussed early.
* Use [SECURITY.md](./SECURITY.md) instead of public issues for suspected vulnerabilities.
* Review [SUPPORT.md](./SUPPORT.md) for the current support model and response expectations.

## Development environment

### Prerequisites

* [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) for the catalog and evaluator services
* [Node.js 20 or later](https://nodejs.org/) for the UI
* [Python 3.9 or later](https://www.python.org/) for evaluation scripts and helpers
* [Docker](https://www.docker.com/) for container builds and local image validation
* Access to the Azure resources required by the component you are working on

### Repository workflow

Run the standard harness commands from the repository root.

| Command | Purpose |
| ------- | ------- |
| `make setup` | Install dependencies and prepare the local development environment |
| `make smoke` | Run the fast sanity check |
| `make lint` | Run linting across the repository |
| `make typecheck` | Run static type checks |
| `make check` | Run linting and type checking |
| `make test` | Run the full automated test suite |
| `make security` | Run repository security checks |
| `make ci` | Run the local CI-equivalent workflow |

Run `make setup` after cloning and `make ci` before opening a pull request.

### Component-specific docs

* See [catalog/README.md](./catalog/README.md) for catalog API configuration and usage.
* See [ui/README.md](./ui/README.md) for the Svelte UI.
* See [evaluator/README.md](./evaluator/README.md) for the queue-based evaluator service.
* See [evaluation/README.md](./evaluation/README.md) for the sample evaluation worker.

## Repository layout

* `catalog/` contains the .NET 10 API and MCP surface for experiment storage and analysis.
* `evaluator/` contains the .NET 10 service that orchestrates inference and evaluation jobs.
* `evaluation/` contains sample Python evaluation scripts and prompt templates.
* `ui/` contains the Svelte and TypeScript web application.
* `catalog.tests/` contains automated tests for the catalog service.
* `docs/` contains design and architecture documents.

## Pull requests

* Branch from `main` for your change.
* Keep changes focused and update the relevant documentation in the same pull request.
* Add or update tests when behavior changes.
* Run the relevant harness commands locally before requesting review.
* Do not merge a pull request unless the `license/cla` check has passed.

## Review expectations

* Be responsive to review feedback and keep the pull request conversation in one place.
* If requirements or behavior changed while the pull request was open, re-run the relevant checks before asking for another review.
* If you are unsure whether a change belongs here, open an issue first and align on scope before coding.
