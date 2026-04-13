import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a .env file into a key-value map.
 */
function parseEnvFile(envPath: string): Map<string, string> {
  const content = readFileSync(envPath, "utf-8");
  const entries = new Map<string, string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.set(key, value);
  }

  return entries;
}

/**
 * Get a bearer token for Azure AI Search using the Azure CLI.
 */
function getAccessToken(): string {
  const cmd = `az account get-access-token --resource https://search.azure.com --query accessToken -o tsv`;
  const token = execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
  if (!token) {
    throw new Error("Empty access token returned.");
  }
  return token;
}

/**
 * List all search indexes for a given Azure AI Search service using the REST API with RBAC.
 */
function listSearchIndexes(
  searchServiceName: string,
  token: string
): string[] {
  const url = `https://${searchServiceName}.search.windows.net/indexes?api-version=2024-07-01&$select=name`;
  const cmd = `az rest --method GET --url "${url}" --headers "Authorization=Bearer ${token}" --query "value[].name" -o json`;
  const result = execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
  return JSON.parse(result);
}

/**
 * Discover available search indexes from the baseline .env file.
 * Returns the search service name and the list of index names.
 */
function discoverSearchIndexes(): {
  searchService: string;
  indexes: string[];
} {
  // Resolve workspace root (two levels up: mcp-apps dir -> demo-experiments -> repo root)
  const workspaceRoot = resolve("..", "..");
  const baselineEnv = resolve(
    workspaceRoot,
    "inference",
    "foundryv2agent",
    ".env"
  );

  if (!existsSync(baselineEnv)) {
    throw new Error(`Baseline .env not found: ${baselineEnv}`);
  }

  const envEntries = parseEnvFile(baselineEnv);
  const searchServiceName = envEntries.get("AZURE_AI_SEARCH");

  if (!searchServiceName) {
    throw new Error(
      "AZURE_AI_SEARCH is not set in the baseline .env file."
    );
  }

  const token = getAccessToken();
  const indexes = listSearchIndexes(searchServiceName, token);

  if (!indexes || indexes.length === 0) {
    throw new Error(
      `No search indexes found for service "${searchServiceName}".`
    );
  }

  return { searchService: searchServiceName, indexes };
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "setup-search-index-selector",
  version: "1.0.0"
});

// State shared across the tool lifecycle
let selectedIndexes: string[] = [];
let pendingResolve:
  | ((data: { selectedIndexes: string[] }) => void)
  | null = null;

// Model-only tool: the LLM calls this to open the search index selector UI.
// The promise does NOT resolve until the user clicks Finish.
registerAppTool(
  server,
  "setup-search-index-selector",
  {
    title: "Select search indexes",
    description:
      "Opens an interactive search index selector UI where the user can pick one or more " +
      "Azure AI Search indexes for retrieval experiment permutations. " +
      "Returns the list of selected index names.",
    inputSchema: z.object({
      experimentDir: z
        .string()
        .describe("The absolute path to the experiment directory.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-index-selector",
        visibility: ["model"]
      }
    }
  },
  async (_args) => {
    // Reset state for a new session
    selectedIndexes = [];
    pendingResolve = null;

    // Return a promise that blocks until the user clicks Finish
    return new Promise((res) => {
      pendingResolve = (data) => {
        const summary =
          data.selectedIndexes.length > 0
            ? `Selected ${data.selectedIndexes.length} index(es):\n${data.selectedIndexes.join("\n")}`
            : "No indexes were selected.";
        res({
          content: [{ type: "text", text: summary }],
          structuredContent: {
            selectedIndexes: data.selectedIndexes
          }
        });
      };
    });
  }
);

// App-only tool: discovers and returns the list of available search indexes.
registerAppTool(
  server,
  "get-available-indexes",
  {
    title: "Get available search indexes",
    description:
      "Discovers the Azure AI Search service from the baseline .env file and returns all available index names.",
    inputSchema: z.object({}),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-index-selector",
        visibility: ["app"]
      }
    }
  },
  async () => {
    try {
      const { searchService, indexes } = discoverSearchIndexes();
      return {
        content: [
          {
            type: "text",
            text: `Search service: ${searchService}\nIndexes: ${indexes.join(", ")}`
          }
        ],
        structuredContent: { searchService, indexes }
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to discover indexes.";
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        structuredContent: { searchService: null, indexes: [], error: message }
      };
    }
  }
);

// App-only tool: submits the final selection of indexes.
registerAppTool(
  server,
  "submit-indexes",
  {
    title: "Submit selected indexes",
    description:
      "Submits the user's final index selection. Resolves the model-visible tool promise.",
    inputSchema: z.object({
      indexes: z
        .array(z.string().min(1))
        .min(1, "At least one index must be selected.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-index-selector",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    selectedIndexes = args.indexes;

    if (pendingResolve) {
      pendingResolve({ selectedIndexes: [...selectedIndexes] });
      pendingResolve = null;
    }

    return {
      content: [
        {
          type: "text",
          text: `Done. ${selectedIndexes.length} index(es) selected.`
        }
      ],
      structuredContent: { selectedIndexes: [...selectedIndexes] }
    };
  }
);

registerAppResource(
  server,
  "Search Index Selector",
  "mcp-app://search-index-selector",
  {
    description: "Interactive search index selector UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://search-index-selector",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
