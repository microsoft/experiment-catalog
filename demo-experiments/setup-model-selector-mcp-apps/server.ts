import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

/**
 * Parse a .env file string into a key-value map.
 */
function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

/**
 * Load deployed model names from Azure AI Foundry using the Azure CLI.
 * Reads the foundry .env to discover the resource group and endpoint,
 * lists all Cognitive Services accounts in the resource group, matches
 * the one whose endpoint matches, then queries its deployments.
 */
async function loadModels(): Promise<string[]> {
  // Resolve the .env relative to this MCP app's working directory
  const envPath = resolve("..", "..", "inference", "foundryv2agent", ".env");
  const raw = await readFile(envPath, "utf-8");
  const env = parseEnv(raw);

  const endpoint = env.AZURE_FOUNDRY_PROJECT_ENDPOINT;
  if (!endpoint) {
    throw new Error("AZURE_FOUNDRY_PROJECT_ENDPOINT not found in .env");
  }

  const resourceGroup = env.AZURE_RESOURCE_GROUP;
  if (!resourceGroup) {
    throw new Error("AZURE_RESOURCE_GROUP not found in .env");
  }

  // Extract the subdomain prefix from the endpoint for matching
  // .env endpoint:  https://leed90d6a-aif.services.ai.azure.com/...
  // CLI endpoint:   https://leed90d6a-aif.cognitiveservices.azure.com/
  // Both share the same subdomain prefix (e.g. "leed90d6a-aif")
  const endpointPrefix = new URL(endpoint).hostname.split(".")[0];

  // List all Cognitive Services accounts in the resource group and find
  // the one whose endpoint subdomain prefix matches
  const accountsJson = execSync(
    `az cognitiveservices account list -g ${resourceGroup} --query "[].{name:name, endpoint:properties.endpoint}" -o json`,
    { encoding: "utf-8", timeout: 30_000 }
  ).trim();

  const accounts = JSON.parse(accountsJson) as Array<{
    name: string;
    endpoint: string | null;
  }>;

  const match = accounts.find((a) => {
    if (!a.endpoint) return false;
    try {
      return new URL(a.endpoint).hostname.split(".")[0] === endpointPrefix;
    } catch {
      return false;
    }
  });

  if (!match) {
    throw new Error(
      `No Cognitive Services account in resource group '${resourceGroup}' ` +
        `matches endpoint prefix '${endpointPrefix}'`
    );
  }

  const accountName = match.name;

  // List only inference (chat completion) deployments, filtering out embeddings
  // Each deployment has properties.capabilities with keys like chatCompletion, embeddings, etc.
  const deploymentsJson = execSync(
    `az cognitiveservices account deployment list -n ${accountName} -g ${resourceGroup} -o json`,
    { encoding: "utf-8", timeout: 30_000 }
  ).trim();

  const deployments = JSON.parse(deploymentsJson) as Array<{
    name: string;
    properties: {
      capabilities?: Record<string, string>;
    };
  }>;

  return deployments
    .filter((d) => d.properties.capabilities?.chatCompletion === "true")
    .map((d) => d.name);
}

const server = new McpServer({
  name: "setup-model-selector",
  version: "1.0.0"
});

// State shared across the tool lifecycle
let selectedModels: string[] = [];
let pendingResolve:
  | ((data: { selectedModels: string[] }) => void)
  | null = null;

// Model-only tool: the LLM calls this to open the model selector UI.
// The promise does NOT resolve until the user clicks Finish.
registerAppTool(
  server,
  "setup-model-selector",
  {
    title: "Select deployment models",
    description:
      "Opens an interactive model selector UI where the user can pick one or more " +
      "deployment models (or enter a custom deployment name) for model permutation experiments. " +
      "Returns the list of selected model deployment names.",
    inputSchema: z.object({
      experimentDir: z
        .string()
        .describe("The absolute path to the experiment directory.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://model-selector",
        visibility: ["model"]
      }
    }
  },
  async (args) => {
    // Load available models from config at invocation time
    const availableModels = await loadModels();

    // Reset state for a new session
    selectedModels = [];
    pendingResolve = null;

    // Return a promise that blocks until the user clicks Finish
    return new Promise((res) => {
      pendingResolve = (data) => {
        const summary =
          data.selectedModels.length > 0
            ? `Selected ${data.selectedModels.length} model(s):\n${data.selectedModels.join("\n")}`
            : "No models were selected.";
        res({
          content: [{ type: "text", text: summary }],
          structuredContent: {
            selectedModels: data.selectedModels,
            availableModels
          }
        });
      };
    });
  }
);

// App-only tool: retrieves the list of available models from models.config.
registerAppTool(
  server,
  "get-available-models",
  {
    title: "Get available models",
    description: "Returns the list of available deployment models from models.config.",
    inputSchema: z.object({}),
    _meta: {
      ui: {
        resourceUri: "mcp-app://model-selector",
        visibility: ["app"]
      }
    }
  },
  async () => {
    const models = await loadModels();
    return {
      content: [{ type: "text", text: models.join(", ") }],
      structuredContent: { models }
    };
  }
);

// App-only tool: submits the final selection of models.
registerAppTool(
  server,
  "submit-models",
  {
    title: "Submit selected models",
    description:
      "Submits the user's final model selection. Resolves the model-visible tool promise.",
    inputSchema: z.object({
      models: z
        .array(z.string().min(1))
        .min(1, "At least one model must be selected.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://model-selector",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    selectedModels = args.models;

    if (pendingResolve) {
      pendingResolve({ selectedModels: [...selectedModels] });
      pendingResolve = null;
    }

    return {
      content: [
        {
          type: "text",
          text: `Done. ${selectedModels.length} model(s) selected.`
        }
      ],
      structuredContent: { selectedModels: [...selectedModels] }
    };
  }
);

registerAppResource(
  server,
  "Model Selector",
  "mcp-app://model-selector",
  {
    description: "Interactive model selector UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://model-selector",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
