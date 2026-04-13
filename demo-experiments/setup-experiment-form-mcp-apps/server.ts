import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
 * Check for actions/catalog/.env, read CATALOG_APP_URI and OIDC_CLIENT_ID,
 * obtain a bearer token via Azure CLI, and call /api/projects.
 * Returns an array of project name strings, or an empty array if anything
 * is missing or fails.
 */
async function loadCatalogProjects(): Promise<string[]> {
  const envPath = resolve("..", "..", "actions", "catalog", ".env");

  if (!existsSync(envPath)) {
    return [];
  }

  const raw = await readFile(envPath, "utf-8");
  const env = parseEnv(raw);

  const catalogAppUri = env.CATALOG_APP_URI;
  const oidcClientId = env.OIDC_CLIENT_ID;

  if (!catalogAppUri || !oidcClientId) {
    return [];
  }

  // Derive base URL by stripping the /swagger suffix
  const baseUrl = catalogAppUri.replace(/\/swagger\/?$/, "");

  let token: string;
  try {
    token = execSync(
      `az account get-access-token --scope "api://${oidcClientId}/.default" --query "accessToken" -o tsv`,
      { encoding: "utf-8", timeout: 30_000 }
    ).trim();
  } catch {
    return [];
  }

  try {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    // /api/projects returns Project[] where Project = { name: string }
    return data.map((item: { name: string }) => item.name);
  } catch {
    return [];
  }
}

const server = new McpServer({
  name: "setup-experiment-form",
  version: "1.0.0"
});

const toolInputSchema = z.object({
  experimentName: z.string().regex(/^[a-zA-Z0-9-]+$/),
  hypothesis: z.string(),
  experimentType: z.enum(["retrieval", "generation"]),
  permutationType: z.enum(["prompt", "model", "search-index", "search-configuration"]),
  isBaseline: z.boolean().default(false),
  catalogProject: z.string().optional(),
  catalogAppUri: z.string().optional(),
  catalogOidcClientId: z.string().optional()
});

// Coordination: the model-visible tool waits until the app-visible tool resolves it.
let pendingFormResolve: ((data: z.infer<typeof toolInputSchema>) => void) | null = null;

// Model-only tool: the LLM calls this to open the form UI.
// The promise does NOT resolve until the user submits the form via the app-only tool.
registerAppTool(
  server,
  "setup-experiment-form",
  {
    title: "Setup experiment form",
    description:
      "Opens the experiment setup form for the user to fill in experiment name, hypothesis, sprint, permutations and other details. The user completes the form in the UI and submits when ready.",
    inputSchema: z.object({
      experimentName: z.string().optional().describe("Optional experiment name to pre-populate the form with.")
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://experiment-runner",
        visibility: ["model"]
      }
    }
  },
  async (args) => {
    // Clean up any previous pending resolve
    pendingFormResolve = null;

    // Return a promise that blocks until the user submits the form
    return new Promise((resolve) => {
      pendingFormResolve = (data) => {
        resolve({
          content: [
            {
              type: "text",
              text: `Experiment submitted:\n${JSON.stringify(data, null, 2)}`
            }
          ],
          structuredContent: data
        });
      };
    });
  }
);

// App-only tool: called by the UI when the user submits the form.
// Resolves the pending model-visible tool promise so the agent gets the data in the same turn.
registerAppTool(
  server,
  "submit-experiment-details",
  {
    title: "Submit experiment details",
    description: "Submit experiment details captured in the form.",
    inputSchema: toolInputSchema,
    _meta: {
      ui: {
        resourceUri: "mcp-app://experiment-runner",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    if (pendingFormResolve) {
      pendingFormResolve(args);
      pendingFormResolve = null;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(args, null, 2)
        }
      ],
      structuredContent: args
    };
  }
);

// App-only tool: retrieves catalog projects from the catalog API.
registerAppTool(
  server,
  "get-catalog-projects",
  {
    title: "Get catalog projects",
    description:
      "Checks for the catalog .env file and returns available catalog projects. " +
      "Returns an empty array if the .env is missing, the catalog URI is not configured, " +
      "or the API call fails.",
    inputSchema: z.object({}),
    _meta: {
      ui: {
        resourceUri: "mcp-app://experiment-runner",
        visibility: ["app"]
      }
    }
  },
  async () => {
    const projects = await loadCatalogProjects();

    // Read the catalog config values to pass through to the client
    let catalogAppUri: string | undefined;
    let catalogOidcClientId: string | undefined;
    const envPath = resolve("..", "..", "actions", "catalog", ".env");
    if (existsSync(envPath)) {
      const raw = await readFile(envPath, "utf-8");
      const env = parseEnv(raw);
      catalogAppUri = env.CATALOG_APP_URI;
      catalogOidcClientId = env.OIDC_CLIENT_ID;
    }

    return {
      content: [
        {
          type: "text",
          text:
            projects.length > 0
              ? `Found ${projects.length} project(s): ${projects.join(", ")}`
              : "No catalog projects found."
        }
      ],
      structuredContent: { projects, catalogAppUri, catalogOidcClientId }
    };
  }
);

registerAppResource(
  server,
  "Experiment Setup Form",
  "mcp-app://experiment-runner",
  {
    description: "Experiment setup form UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://experiment-runner",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
