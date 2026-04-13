# Setup Search Config Selector MCP App

An MCP-based interactive UI for configuring Azure AI Search parameters during experiment setup.

## Overview

This MCP app presents a search configuration UI that lets users:

- Select the query type (`simple`, `full`, or `semantic`)
- Set the top-K results count (1–100) via a slider + number input
- Choose from available semantic configurations (auto-discovered from the index)
- Build one or more search configuration permutations for the experiment

Each configuration becomes a separate agent permutation during provisioning.

## How It Works

The app reads the Azure AI Search service name and index details from `inference/foundryv2agent/.env`, authenticates via the Azure CLI, and queries the index's semantic configurations using the REST API. Query types (`simple`, `full`, `semantic`) are offered as radio options; semantic configurations are discovered dynamically from the index metadata.

## Prerequisites

- The Azure CLI (`az`) must be installed and the user must be logged in (`az login`).
- The logged-in identity must have the **Search Index Data Reader** (or higher) role on the search service.
- `inference/foundryv2agent/.env` must contain `AZURE_AI_SEARCH`, `INDEX_NAME`, and `INDEX_VERSION`.

## Development

```bash
npm install
npm run build
```

## Architecture

- **server.ts** — MCP server with four tools:
  - `setup-search-config-selector` (model-visible) — opens the UI; blocks until user finishes
  - `get-search-config-options` (app-visible) — discovers indexes, semantic configs, and defaults
  - `get-semantic-configs` (app-visible) — fetches semantic configs for a specific index
  - `submit-search-configs` (app-visible) — submits the final configuration selection
- **src/mcp-app.tsx** — React UI component
- **src/mcp-app.css** — Styles (matches existing MCP app theme)
