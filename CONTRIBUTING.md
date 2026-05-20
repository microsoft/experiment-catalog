---
title: Contributing to Experiment Catalog
description: Contribution workflow, quality gates, and pull request requirements for experiment-catalog.
ms.date: 2026-05-20
ms.topic: how-to
---

## Contributing to Experiment Catalog

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

* [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) for the catalog service
* [Node.js 20 or later](https://nodejs.org/) for the UI
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

## Repository layout

* `catalog/` contains the .NET 10 API and MCP surface for experiment storage and analysis.
* `ui/` contains the Svelte and TypeScript web application.
* `catalog.tests/` contains automated tests for the catalog service.
* `docs/` contains design and architecture documents.

## Pull requests

* Branch from `main` for your change.
* Keep changes focused and update the relevant documentation in the same pull request.
* Add or update tests when behavior changes.
* Run the relevant harness commands locally before requesting review.
* Do not merge a pull request unless the `license/cla` check has passed.
* Use a Conventional Commits style pull request title:
  * `feat(scope): short description`
  * `fix(scope): short description`
  * Add `!` before `:` for breaking changes, for example: `feat(api)!: remove deprecated endpoint`

Allowed PR title types:

* `feat`
* `fix`
* `docs`
* `refactor`
* `test`
* `chore`
* `ci`
* `build`
* `perf`
* `revert`

PR titles are validated automatically in CI by the `PR Title Validation` workflow.

## Branch protection expectations

Main branch protections are part of the repository governance model.

* Pull request required before merging to `main`
* At least 1 approval required
* Code owner review required where applicable
* Required status checks must pass
* Force push and branch deletion blocked

## Review expectations

* Be responsive to review feedback and keep the pull request conversation in one place.
* If requirements or behavior changed while the pull request was open, re-run the relevant checks before asking for another review.
* If you are unsure whether a change belongs here, open an issue first and align on scope before coding.
