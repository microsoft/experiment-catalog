import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────────────

type SearchConfig = {
  queryType: "simple" | "full" | "semantic";
  topK: number;
  semanticConfig: string | null;
};

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
 * List all search indexes for a given Azure AI Search service.
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
 * Get semantic configurations for a specific search index.
 * Returns an array of semantic configuration names, or an empty array if none exist.
 */
function getSemanticConfigurations(
  searchServiceName: string,
  indexName: string,
  token: string
): string[] {
  const url = `https://${searchServiceName}.search.windows.net/indexes/${indexName}?api-version=2024-07-01&$select=name,semanticSearch`;
  const cmd = `az rest --method GET --url "${url}" --headers "Authorization=Bearer ${token}" -o json`;
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const parsed = JSON.parse(result);
    const configs = parsed?.semanticSearch?.configurations;
    if (Array.isArray(configs)) {
      return configs.map((c: { name: string }) => c.name);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Discover the search service, indexes, and current defaults from the baseline .env.
 */
function discoverSearchConfig(): {
  searchService: string;
  indexes: string[];
  currentDefaults: {
    indexName: string;
    indexVersion: string;
    queryType: string;
    topK: number;
    semanticConfig: string | null;
  };
} {
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

  // Read current defaults from .env
  const indexName = envEntries.get("INDEX_NAME") ?? "";
  const indexVersion = envEntries.get("INDEX_VERSION") ?? "";
  const queryType = envEntries.get("INDEX_QUERY_TYPE") ?? "simple";
  const topK = parseInt(envEntries.get("INDEX_QUERY_TOP") ?? "5", 10);
  const semanticConfig = envEntries.get("INDEX_QUERY_SEMANTIC_CONFIG") ?? null;

  return {
    searchService: searchServiceName,
    indexes,
    currentDefaults: { indexName, indexVersion, queryType, topK, semanticConfig }
  };
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "setup-search-config-selector",
  version: "1.0.0"
});

// State shared across the tool lifecycle
let selectedConfigs: SearchConfig[] = [];
let currentExperimentDir: string | null = null;
let pendingResolve:
  | ((data: { selectedConfigs: SearchConfig[] }) => void)
  | null = null;

// Model-only tool: the LLM calls this to open the search config selector UI.
// The promise does NOT resolve until the user clicks Finish.
registerAppTool(
  server,
  "setup-search-config-selector",
  {
    title: "Configure search parameters",
    description:
      "Opens an interactive search configuration UI where the user can define one or more " +
      "search parameter permutations (query type, top-K, semantic config) for retrieval experiments. " +
      "Returns the list of selected search configurations.",
    inputSchema: z.object({
      experimentDir: z
        .string()
        .describe("The absolute path to the experiment directory.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-config-selector",
        visibility: ["model"]
      }
    }
  },
  async (args) => {
    selectedConfigs = [];
    currentExperimentDir = args.experimentDir;
    pendingResolve = null;

    return new Promise((res) => {
      pendingResolve = (data) => {
        // Write search-config.json to the experiment directory
        let configFilePath = "";
        if (currentExperimentDir && data.selectedConfigs.length > 0) {
          mkdirSync(currentExperimentDir, { recursive: true });
          configFilePath = resolve(currentExperimentDir, "search-config.json");
          writeFileSync(
            configFilePath,
            JSON.stringify(data.selectedConfigs, null, 2) + "\n",
            "utf-8"
          );
        }

        const lines = data.selectedConfigs.map(
          (c, i) =>
            `  ${i + 1}. queryType=${c.queryType}, topK=${c.topK}${c.semanticConfig ? `, semanticConfig=${c.semanticConfig}` : ""}`
        );
        const fileLine = configFilePath
          ? `\nSaved to: ${configFilePath}`
          : "";
        const summary =
          data.selectedConfigs.length > 0
            ? `Selected ${data.selectedConfigs.length} search configuration(s):\n${lines.join("\n")}${fileLine}`
            : "No search configurations were selected.";
        res({
          content: [{ type: "text", text: summary }],
          structuredContent: {
            selectedConfigs: data.selectedConfigs,
            configFilePath
          }
        });
      };
    });
  }
);

// App-only tool: discovers search config options (indexes, semantic configs, defaults).
registerAppTool(
  server,
  "get-search-config-options",
  {
    title: "Get search configuration options",
    description:
      "Discovers the Azure AI Search service, available indexes, semantic configurations, " +
      "and current defaults from the baseline .env file.",
    inputSchema: z.object({
      indexName: z
        .string()
        .optional()
        .describe("Optional: specific index name to fetch semantic configs for.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-config-selector",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    try {
      const { searchService, indexes, currentDefaults } =
        discoverSearchConfig();

      // Determine which index to query for semantic configs
      const targetIndex =
        args.indexName ||
        (currentDefaults.indexName && currentDefaults.indexVersion
          ? `${currentDefaults.indexName}-index-${currentDefaults.indexVersion}`
          : indexes[0]);

      const token = getAccessToken();
      const semanticConfigs = targetIndex
        ? getSemanticConfigurations(searchService, targetIndex, token)
        : [];

      return {
        content: [
          {
            type: "text",
            text: `Search service: ${searchService}\nIndexes: ${indexes.join(", ")}\nSemantic configs for ${targetIndex}: ${semanticConfigs.join(", ") || "none"}`
          }
        ],
        structuredContent: {
          searchService,
          indexes,
          targetIndex,
          semanticConfigs,
          currentDefaults,
          queryTypes: ["simple", "full", "semantic"],
          topKRange: { min: 1, max: 100, default: currentDefaults.topK }
        }
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to discover search config options.";
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        structuredContent: {
          searchService: null,
          indexes: [],
          semanticConfigs: [],
          currentDefaults: null,
          queryTypes: ["simple", "full", "semantic"],
          topKRange: { min: 1, max: 100, default: 5 },
          error: message
        }
      };
    }
  }
);

// App-only tool: fetches semantic configs for a specific index (called when user changes index).
registerAppTool(
  server,
  "get-semantic-configs",
  {
    title: "Get semantic configurations for an index",
    description:
      "Fetches available semantic configurations for a specific Azure AI Search index.",
    inputSchema: z.object({
      indexName: z
        .string()
        .describe("The full index name to query for semantic configurations.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-config-selector",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    try {
      const workspaceRoot = resolve("..", "..");
      const baselineEnv = resolve(
        workspaceRoot,
        "inference",
        "foundryv2agent",
        ".env"
      );
      const envEntries = parseEnvFile(baselineEnv);
      const searchServiceName = envEntries.get("AZURE_AI_SEARCH");

      if (!searchServiceName) {
        throw new Error("AZURE_AI_SEARCH is not set.");
      }

      const token = getAccessToken();
      const semanticConfigs = getSemanticConfigurations(
        searchServiceName,
        args.indexName,
        token
      );

      return {
        content: [
          {
            type: "text",
            text: `Semantic configs for ${args.indexName}: ${semanticConfigs.join(", ") || "none"}`
          }
        ],
        structuredContent: {
          indexName: args.indexName,
          semanticConfigs
        }
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch semantic configs.";
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        structuredContent: {
          indexName: args.indexName,
          semanticConfigs: [],
          error: message
        }
      };
    }
  }
);

// App-only tool: submits the final selection of search configurations.
registerAppTool(
  server,
  "submit-search-configs",
  {
    title: "Submit search configurations",
    description:
      "Submits the user's final search configuration selection. Resolves the model-visible tool promise.",
    inputSchema: z.object({
      configs: z
        .array(
          z.object({
            queryType: z.enum(["simple", "full", "semantic"]),
            topK: z.number().int().min(1).max(100),
            semanticConfig: z.string().nullable()
          })
        )
        .min(1, "At least one search configuration must be defined.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://search-config-selector",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    selectedConfigs = args.configs;

    if (pendingResolve) {
      pendingResolve({ selectedConfigs: [...selectedConfigs] });
      pendingResolve = null;
    }

    return {
      content: [
        {
          type: "text",
          text: `Done. ${selectedConfigs.length} search configuration(s) submitted.`
        }
      ],
      structuredContent: { selectedConfigs: [...selectedConfigs] }
    };
  }
);

registerAppResource(
  server,
  "Search Config Selector",
  "mcp-app://search-config-selector",
  {
    description: "Interactive search configuration selector UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://search-config-selector",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
