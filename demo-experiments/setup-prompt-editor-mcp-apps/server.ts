import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const MAX_PROMPTS = 12;

const server = new McpServer({
  name: "setup-prompt-editor",
  version: "1.0.0"
});

const savePromptSchema = z.object({
  promptText: z.string().min(1, "Prompt text cannot be empty."),
  promptNumber: z.number().int().min(1).max(MAX_PROMPTS),
  wasEdited: z.boolean().default(false)
});

const finishSchema = z.object({
  action: z.literal("finish")
});

// State shared across the tool lifecycle
let experimentDir: string = "";
let baselinePromptText: string = "";
let savedPromptPaths: string[] = [];
let pendingResolve:
  | ((data: { savedPromptPaths: string[] }) => void)
  | null = null;

function loadBaselinePrompt(experimentDir: string): string {
  const repoRoot = resolve(experimentDir, "..", "..");
  const promptPath = join(repoRoot, "inference", "foundryv2agent", "prompt.txt");
  if (!existsSync(promptPath)) {
    throw new Error(`Baseline prompt file not found: ${promptPath}`);
  }
  return readFileSync(promptPath, "utf-8");
}

// Model-only tool: the LLM calls this to open the prompt editor UI.
// The promise does NOT resolve until the user clicks Finish.
registerAppTool(
  server,
  "setup-prompt-editor",
  {
    title: "Edit baseline prompt",
    description:
      "Opens an interactive prompt editor pre-populated with the baseline prompt text. " +
      "The user can save multiple prompt variations (up to 12) to the experiment directory, " +
      "then finish. Returns the list of all saved prompt file paths.",
    inputSchema: z.object({
      experimentDir: z
        .string()
        .describe("The absolute path to the experiment directory where prompt files will be saved. The baseline prompt is loaded automatically from inference/foundryv2agent/prompt.txt relative to the repo root.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://prompt-editor",
        visibility: ["model"]
      }
    }
  },
  async (args: { experimentDir: string }) => {
    // Reset state for a new session
    experimentDir = args.experimentDir;
    baselinePromptText = loadBaselinePrompt(experimentDir);
    savedPromptPaths = [];
    pendingResolve = null;

    // Return a promise that blocks until the user clicks Finish
    return new Promise((res) => {
      pendingResolve = (data) => {
        const summary = data.savedPromptPaths.length > 0
          ? `Saved ${data.savedPromptPaths.length} prompt(s):\n${data.savedPromptPaths.join("\n")}`
          : "No prompts were saved.";
        res({
          content: [{ type: "text", text: summary }],
          structuredContent: { savedPromptPaths: data.savedPromptPaths }
        });
      };
    });
  }
);

// App-only tool: fetches the baseline prompt loaded from disk.
registerAppTool(
  server,
  "get-baseline-prompt",
  {
    title: "Get baseline prompt",
    description:
      "Returns the baseline prompt text loaded directly from prompt.txt on disk.",
    inputSchema: z.object({}),
    _meta: {
      ui: {
        resourceUri: "mcp-app://prompt-editor",
        visibility: ["app"]
      }
    }
  },
  async () => {
    return {
      content: [{ type: "text", text: baselinePromptText }],
      structuredContent: { baselinePrompt: baselinePromptText, experimentDir }
    };
  }
);

// App-only tool: saves a single prompt file to the experiment directory.
registerAppTool(
  server,
  "save-prompt",
  {
    title: "Save prompt to file",
    description:
      "Saves the current prompt text as a numbered file (prompt_NN.md) in the experiment directory.",
    inputSchema: savePromptSchema,
    _meta: {
      ui: {
        resourceUri: "mcp-app://prompt-editor",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    const paddedNum = String(args.promptNumber).padStart(2, "0");
    const fileName = `prompt_${paddedNum}.md`;
    const filePath = join(experimentDir, fileName);

    try {
      await mkdir(experimentDir, { recursive: true });
      await writeFile(filePath, args.promptText, "utf-8");

      // Track saved paths (replace if same number was re-saved)
      const existingIdx = savedPromptPaths.findIndex((p) => p.endsWith(fileName));
      if (existingIdx >= 0) {
        savedPromptPaths[existingIdx] = filePath;
      } else {
        savedPromptPaths.push(filePath);
      }

      return {
        content: [{ type: "text", text: `Saved: ${filePath}` }],
        structuredContent: { filePath, fileName, promptNumber: args.promptNumber }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save file.";
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true
      };
    }
  }
);

// App-only tool: user clicks Finish — resolves the model-visible tool promise.
registerAppTool(
  server,
  "finish-prompts",
  {
    title: "Finish prompt editing",
    description: "Signals that the user is done saving prompts. Returns all saved file paths.",
    inputSchema: finishSchema,
    _meta: {
      ui: {
        resourceUri: "mcp-app://prompt-editor",
        visibility: ["app"]
      }
    }
  },
  async () => {
    if (pendingResolve) {
      pendingResolve({ savedPromptPaths: [...savedPromptPaths] });
      pendingResolve = null;
    }

    return {
      content: [{ type: "text", text: `Done. ${savedPromptPaths.length} prompt(s) saved.` }],
      structuredContent: { savedPromptPaths: [...savedPromptPaths] }
    };
  }
);

registerAppResource(
  server,
  "Prompt Editor",
  "mcp-app://prompt-editor",
  {
    description: "Interactive prompt editor UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://prompt-editor",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
