# Setup Model Selector MCP App

An MCP-based interactive UI for selecting deployment models during experiment setup.

## Overview

This MCP app presents a model selector interface that lets users:

- Choose from pre-configured deployment models (loaded from `models.config`)
- Enter custom deployment names (with a warning that manual deployment is required)
- Submit the final selection back to the orchestrating agent

## models.config

The available models are loaded from `models.config` (one model per line). Blank lines and lines starting with `#` are ignored. Edit this file to add, remove, or reorder models without changing code.

## Development

```bash
npm install
npm run build
```

## Architecture

- **server.ts** — MCP server with three tools:
  - `setup-model-selector` (model-visible) — opens the UI; blocks until user finishes
  - `get-available-models` (app-visible) — returns models from `models.config`
  - `submit-models` (app-visible) — submits the final selection
- **src/mcp-app.tsx** — React UI component
- **models.config** — newline-delimited list of available model deployment names
