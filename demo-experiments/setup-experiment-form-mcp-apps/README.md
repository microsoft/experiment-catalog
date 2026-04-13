# Experiment Runner MCP App

Small MCP app built with React and Vite.

## Prerequisites

- Node.js 18+ (LTS recommended)

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

The build output is written to `dist/`.

## Local MCP setup for testing

To test with an MCP host (e.g. VS Code Copilot, Claude Desktop), create a `.vscode/mcp.json` in your `demo-experiments` folder:

```jsonc
{
  "servers": {
    "setup-experiment-form": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "server.ts"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

> **Note:** This assumes `npm install` has already been run so that dependencies are available.

Once configured, restart the MCP host. The `create-experiment` tool should appear in the tool list.
