# Prompt Editor MCP App

Interactive MCP App that renders a prompt editor inside the conversation. The agent sends the baseline prompt text, the user reviews/edits it in a textarea, and the final prompt is returned to the agent.

## Architecture

Uses the **two-tool coordination** pattern from the MCP Apps spec:

1. **`setup-prompt-editor`** (model-visible) — Agent calls this with `{ baselinePrompt: "..." }`. Opens the editor UI and blocks via a Promise until the user submits.
2. **`submit-prompt`** (app-visible) — Called by the UI when the user clicks "Submit prompt". Resolves the pending Promise from tool #1, returning `{ promptText, wasEdited }` to the agent.

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

## Local MCP setup for testing

Add to your `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "setup-prompt-editor": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "server.ts"],
      "cwd": "${workspaceFolder}/setup-prompt-editor-mcp-apps"
    }
  }
}
```
