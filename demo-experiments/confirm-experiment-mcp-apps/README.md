# Confirm Experiment MCP App

Small MCP app built with React and Vite. Displays a summary of all experiment permutations with a diff/comparison view against the baseline, and lets the user confirm or cancel the experiment run.

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
    "confirm-experiment": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "server.ts"],
      "cwd": "${workspaceFolder}/confirm-experiment-mcp-apps"
    }
  }
}
```

> **Note:** This assumes `npm install` has already been run so that dependencies are available.

Once configured, restart the MCP host. The `confirm-experiment` tool should appear in the tool list.
