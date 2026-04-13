# Setup Search Index Selector MCP App

An MCP-based interactive UI for selecting Azure AI Search indexes during experiment setup.

## Overview

This MCP app presents a search index selector interface that lets users:

- View all available indexes from the configured Azure AI Search service
- Select one or more indexes for retrieval experiment permutations
- Submit the final selection back to the orchestrating agent

## How It Works

The app reads the Azure AI Search service name from `inference/foundryv2agent/.env` (`AZURE_AI_SEARCH`), authenticates via the Azure CLI, and lists all available indexes using the REST API. No config file is needed — indexes are discovered dynamically.

## Prerequisites

- The Azure CLI (`az`) must be installed and the user must be logged in (`az login`).
- The logged-in identity must have the **Search Index Data Reader** (or higher) role on the search service.
- `inference/foundryv2agent/.env` must contain `AZURE_AI_SEARCH`.

## Development

```bash
npm install
npm run build
```

## Architecture

- **server.ts** — MCP server with three tools:
  - `setup-search-index-selector` (model-visible) — opens the UI; blocks until user finishes
  - `get-available-indexes` (app-visible) — discovers indexes from Azure AI Search via CLI
  - `submit-indexes` (app-visible) — submits the final selection
- **src/mcp-app.tsx** — React UI component
- **src/mcp-app.css** — Styles (matches model selector theme)
