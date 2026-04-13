---
title: AML Evaluation Runner
description: Overview of the published AML Evaluation Runner prep repository contents, including inference, action, infrastructure, and demo assets.
ms.date: 2026-04-13
ms.topic: overview
---

## Overview

AML Evaluation Runner is a reusable framework for running Azure Machine Learning experiments across inference, evaluation, and summarization stages. This prep repository currently includes the published inference, action, infrastructure, search, ingestion, and demo assets that support those workflows.

## Project status

The repository is under active development. Support for Microsoft products and services used by this repository does not extend to the repository itself. See [SUPPORT.md](./SUPPORT.md) for the current support model and [SECURITY.md](./SECURITY.md) for vulnerability reporting guidance.

## Community

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com).
- Review [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), [SUPPORT.md](./SUPPORT.md), and [SECURITY.md](./SECURITY.md) for repository expectations.

## Repository structure

| Path | Purpose |
| ---- | ------- |
| `inference/` | Inference integration contracts and reference implementations |
| `actions/` | Action hooks for post-processing inference, evaluation, and summarization results |
| `infra/` | Bicep templates and setup scripts for Azure resources |
| `demo-experiments/` | Demo applications and companion setup assets |
| `docs/` | Requirements, design notes, security planning, and demo guidance |
| `ingestion/` | Content ingestion scripts used to prepare data for downstream workflows |
| `search/` | Search pipeline assets and the ParseMarkdown utility |

> [!IMPORTANT]
> This prep tree does not include the top-level `experiment/` or `evaluation/` directories. Update any downstream automation or private integrations that still reference those paths before running an end-to-end workflow.

## Getting started

### Prerequisites

- An Azure subscription with permissions to create or use Azure Machine Learning resources. A non-production subscription is recommended for demos and experimentation.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and an authenticated session with `az login`
- [uv](https://github.com/astral-sh/uv) 0.8.9 or later
- Python 3.10
- [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Dev Tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started) if you plan to integrate with local inference or evaluation services

### Quick start

1. Review [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) and [docs/DESIGN.md](./docs/DESIGN.md) for the framework goals and architecture.
2. Provision or reuse the required Azure resources with [infra/main.bicep](./infra/main.bicep) and [infra/SetupEnv.ps1](./infra/SetupEnv.ps1).
3. Review the published implementation guides and companion assets:
   - [inference/README.md](./inference/README.md)
   - [actions/README.md](./actions/README.md)
   - [demo-experiments/README.md](./demo-experiments/README.md)
4. If you are wiring the repo into a broader workflow, update the generated settings from [infra/SetupEnv.ps1](./infra/SetupEnv.ps1) so they point at your private or downstream orchestration and evaluation components.
5. Build the demo MCP apps from the `demo-experiments/` directory if you want to explore the experiment setup flow:

   ```powershell
   cd demo-experiments
   ./Build-McpApps.ps1
   ```

6. Review the generated assets and documentation before connecting the repository to an end-to-end AML workflow.

## Reference implementations

- [inference/foundryv2agent/README.md](./inference/foundryv2agent/README.md)
- [actions/README.md](./actions/README.md)

## Additional documentation

- [docs/DEMO.md](./docs/DEMO.md)
- [docs/DESIGN_PHILOSOPHY-FOUNDRY_VS_AML.md](./docs/DESIGN_PHILOSOPHY-FOUNDRY_VS_AML.md)
- [docs/MAINTAINERS.md](./docs/MAINTAINERS.md)
- [docs/SECURITY-PLAN.md](./docs/SECURITY-PLAN.md)

## Telemetry

AML Evaluation Runner can export logs, traces, and metrics to Azure Monitor when `AML_APP_INSIGHTS_CONNECTION_STRING` is set for the experiment runner. The runner passes that value to job stages as `OPEN_TELEMETRY_CONNECTION_STRING`. To turn telemetry off, leave `AML_APP_INSIGHTS_CONNECTION_STRING` unset before launching experiment jobs.

**Data Collection**. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at <https://go.microsoft.com/fwlink/?LinkID=824704>. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

**Trademarks** This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third-party's policies.