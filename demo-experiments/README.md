---
title: Experiment Setup And Runner Custom Agent
description: Demo guidance for the MCP apps and skills that help configure AML Evaluation Runner experiments in the prep repository.
ms.date: 2026-04-13
ms.topic: how-to
---

## Overview

Several steps need to happen before you can set up and run an experiment. We typically have several permutations of an experiment. For example, a top-k experiment for retrieval could have values of 5, 10, 15, and so on.

This demo shows how a custom agent can guide a user through setting up an experiment, defining permutations, and preparing the supporting assets for AML Evaluation Runner. To get started, choose the `setup-experiment` agent.

For best experience, please choose `New Chat Editor`. Do not choose `New Chat Window` as it does not bring up the MCP Apps UI correctly.

## Prerequisites

1. Please ensure you have completed the [demo setup](../docs/DEMO.md).
2. Node v22.11.0 and above is installed. Run `node --version` to verify.

## Build MCP Apps

Run the build script from the `demo-experiments` directory to install dependencies, build all MCP
apps, and generate the `.vscode/mcp.json` configuration:

```powershell
./Build-McpApps.ps1
```

This script will:

1. Discover all `*-mcp-apps` folders in the directory.
1. Run `npm install` and `npm run build` for each app.
1. Create (or overwrite) `.vscode/mcp.json` with server entries for every MCP app.

For verbose output, run:

```powershell
./Build-McpApps.ps1 -Verbose
```

## Supported Permutations

For this demo, we are using `./inference/foundryv2agent` for inference. This prep tree does not publish a companion `evaluation/` implementation, so adapt the generated experiment assets to your own evaluation workflow.

The supported permutations are:

1. Generation
    1. Prompt (improve generated answers)
    1. Model (GPT-4 or GPT-5 models)
1. Retrieval
    1. Search Index (choose from one or more search index, used for experimentation with chunking for example)
    1. Search Configuration (top-k, simple vs semantic)

### Outcome

1. An experimentation folder with a safe experiment name will be created.
2. A README.doc will be created which includes details of the experiment which includes permutation details.
3. Artifacts such as the agent and experiment configuration will also be created.

## Integration with Catalog

The custom agent does work with the Catalog. To enable it, follow the instructions in [catalog setup](../actions/catalog/README.md). Once a `.env` file is created, the custom agent will execute with catalog settings to push results to the catalog.

## Reuse

This is an example based on the ISE Dev Blogs demo scenario. For your actual
use case, you can reuse and rework any of the skills or MCP apps. They contain
specific instructions to work with AML Evaluation Runner tooling.
