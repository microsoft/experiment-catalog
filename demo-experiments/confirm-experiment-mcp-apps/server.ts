import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PermutationType =
  | "prompt"
  | "model"
  | "search-index"
  | "search-configuration";

type Baseline = {
  promptText?: string;
  model?: string;
  searchIndex?: string;
  queryType?: string;
  topK?: number;
  semanticConfig?: string;
};

type Permutation = {
  agentName: string;
  promptFile?: string;
  promptText?: string;
  model?: string;
  searchIndex?: string;
  queryType?: string;
  topK?: number;
  semanticConfig?: string;
};

type SummaryData = {
  experimentName: string;
  hypothesis: string;
  experimentType: "generation" | "retrieval";
  permutationType: PermutationType;
  baseline: Baseline;
  permutations: Permutation[];
};

/* ------------------------------------------------------------------ */
/*  Input schema                                                       */
/* ------------------------------------------------------------------ */

type AgentResult = {
  agentName: string;
  envFile: string;
  promptFile?: string;
  modelDeployment?: string;
  searchIndex?: string;
  searchConfig?: {
    queryType: string;
    topK: number;
    semanticConfig?: string;
  };
};

const confirmInputSchema = z.object({
  experimentName: z.string(),
  hypothesis: z.string(),
  experimentType: z.enum(["generation", "retrieval"]),
  permutationType: z.enum([
    "prompt",
    "model",
    "search-index",
    "search-configuration"
  ]),
  experimentDir: z.string()
});

type ConfirmInput = z.infer<typeof confirmInputSchema>;

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

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

function getBaselinePaths(experimentDir: string) {
  const repoRoot = resolve(experimentDir, "..", "..");
  const agentDir = join(repoRoot, "inference", "foundryv2agent");
  return {
    envPath: join(agentDir, ".env"),
    promptPath: join(agentDir, "prompt.txt")
  };
}

function loadAgentResults(experimentDir: string): AgentResult[] {
  const resultsPath = join(experimentDir, "agent_results.json");
  if (!existsSync(resultsPath)) {
    throw new Error(
      `agent_results.json not found in ${experimentDir}. ` +
      `The provision-agents step must save agent_results.json to the experiment directory first.`
    );
  }
  const raw = readFileSync(resultsPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `agent_results.json in ${experimentDir} is empty or not a valid array.`
    );
  }
  return parsed as AgentResult[];
}

function prepareSummaryData(args: ConfirmInput): SummaryData {
  const {
    experimentName,
    hypothesis,
    experimentType,
    permutationType,
    experimentDir
  } = args;
  const agentResults = loadAgentResults(experimentDir);
  const { envPath: baselineEnvPath, promptPath: baselinePromptPath } =
    getBaselinePaths(experimentDir);

  let baseline: Baseline;
  let permutations: Permutation[];

  switch (permutationType) {
    case "prompt": {
      if (!existsSync(baselinePromptPath)) {
        throw new Error(
          `Baseline prompt file not found: ${baselinePromptPath}`
        );
      }
      const baselinePromptText = readFileSync(baselinePromptPath, "utf-8");
      baseline = { promptText: baselinePromptText };
      permutations = agentResults.map((agent) => {
        const promptFilePath = agent.promptFile!;
        if (!existsSync(promptFilePath)) {
          throw new Error(`Prompt file not found: ${promptFilePath}`);
        }
        return {
          agentName: agent.agentName,
          promptFile: basename(promptFilePath),
          promptText: readFileSync(promptFilePath, "utf-8")
        };
      });
      break;
    }

    case "model": {
      if (!existsSync(baselineEnvPath)) {
        throw new Error(
          `Baseline .env file not found: ${baselineEnvPath}`
        );
      }
      const baselineEnv = parseEnvFile(baselineEnvPath);
      const baselineModel = baselineEnv.get("AZURE_FOUNDRY_MODEL_DEPLOYMENT");
      if (!baselineModel) {
        throw new Error(
          "AZURE_FOUNDRY_MODEL_DEPLOYMENT not found in baseline .env"
        );
      }
      baseline = { model: baselineModel };
      permutations = agentResults.map((agent) => ({
        agentName: agent.agentName,
        model: agent.modelDeployment
      }));
      break;
    }

    case "search-index": {
      if (!existsSync(baselineEnvPath)) {
        throw new Error(
          `Baseline .env file not found: ${baselineEnvPath}`
        );
      }
      const baselineEnv = parseEnvFile(baselineEnvPath);
      const baselineIndex = baselineEnv.get(
        "INDEX_NAME"
      );
      if (!baselineIndex) {
        throw new Error(
          "INDEX_NAME not found in baseline .env"
        );
      }
      baseline = { searchIndex: baselineIndex };
      permutations = agentResults.map((agent) => ({
        agentName: agent.agentName,
        searchIndex: agent.searchIndex
      }));
      break;
    }

    case "search-configuration": {
      if (!existsSync(baselineEnvPath)) {
        throw new Error(
          `Baseline .env file not found: ${baselineEnvPath}`
        );
      }
      const baselineEnv = parseEnvFile(baselineEnvPath);
      const baselineQueryType = baselineEnv.get("INDEX_QUERY_TYPE");
      const baselineTopK = baselineEnv.get("INDEX_QUERY_TOP");
      const baselineSemanticConfig = baselineEnv.get(
        "INDEX_QUERY_SEMANTIC_CONFIG"
      );
      if (!baselineQueryType) {
        throw new Error(
          "INDEX_QUERY_TYPE not found in baseline .env"
        );
      }
      if (!baselineTopK) {
        throw new Error("INDEX_QUERY_TOP not found in baseline .env");
      }
      baseline = {
        queryType: baselineQueryType,
        topK: parseInt(baselineTopK, 10),
        ...(baselineSemanticConfig
          ? { semanticConfig: baselineSemanticConfig }
          : {})
      };
      permutations = agentResults.map((agent) => {
        const config = agent.searchConfig!;
        return {
          agentName: agent.agentName,
          queryType: config.queryType,
          topK: config.topK,
          ...(config.semanticConfig
            ? { semanticConfig: config.semanticConfig }
            : {})
        };
      });
      break;
    }

    default:
      throw new Error(`Unknown permutation type: ${permutationType}`);
  }

  return {
    experimentName,
    hypothesis,
    experimentType,
    permutationType,
    baseline,
    permutations
  };
}

/* ------------------------------------------------------------------ */
/*  Server                                                             */
/* ------------------------------------------------------------------ */

const server = new McpServer({
  name: "confirm-experiment",
  version: "1.0.0"
});

let pendingResolve:
  | ((data: { confirmed: boolean }) => void)
  | null = null;

let preparedDataReady: Promise<SummaryData> | null = null;
let signalDataReady: ((data: SummaryData) => void) | null = null;

/* ---- Model-visible tool ---- */
registerAppTool(
  server,
  "confirm-experiment",
  {
    title: "Confirm experiment",
    description:
      "Opens a confirmation UI that shows a summary of all experiment permutations " +
      "with a diff view against the baseline. Reads experiment files from the " +
      "provided directory, prepares the comparison data, and displays it for " +
      "review. The user confirms or cancels the experiment run. " +
      "Returns { confirmed: true/false }.",
    inputSchema: confirmInputSchema,
    _meta: {
      ui: {
        resourceUri: "mcp-app://confirm-experiment",
        visibility: ["model"]
      }
    }
  },
  async (args) => {
    // Set up data-ready signaling for the UI
    preparedDataReady = new Promise<SummaryData>((res) => {
      signalDataReady = res;
    });
    pendingResolve = null;

    // Read files and prepare summary data
    const summary = prepareSummaryData(args as ConfirmInput);
    signalDataReady!(summary);
    signalDataReady = null;

    // Wait for user confirmation via the UI
    return new Promise((resolve) => {
      pendingResolve = (data) => {
        preparedDataReady = null;
        resolve({
          content: [
            {
              type: "text",
              text: data.confirmed
                ? "User confirmed — proceed with running the experiment."
                : "User declined — experiment run cancelled."
            }
          ],
          structuredContent: data
        });
      };
    });
  }
);

/* ---- App-visible tool: get prepared data ---- */
registerAppTool(
  server,
  "get-prepared-data",
  {
    title: "Get prepared data",
    description:
      "Returns the prepared experiment summary data for the UI to display.",
    inputSchema: z.object({}),
    _meta: {
      ui: {
        resourceUri: "mcp-app://confirm-experiment",
        visibility: ["app"]
      }
    }
  },
  async () => {
    if (!preparedDataReady) {
      return {
        content: [{ type: "text" as const, text: "{}" }]
      };
    }
    const data = await preparedDataReady;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }]
    };
  }
);

/* ---- App-visible tool: submit confirmation ---- */
registerAppTool(
  server,
  "submit-confirmation",
  {
    title: "Submit confirmation",
    description:
      "Called by the UI to confirm or cancel the experiment run.",
    inputSchema: z.object({
      confirmed: z.boolean()
    }),
    _meta: {
      ui: {
        resourceUri: "mcp-app://confirm-experiment",
        visibility: ["app"]
      }
    }
  },
  async (args) => {
    if (pendingResolve) {
      pendingResolve({ confirmed: args.confirmed });
      pendingResolve = null;
    }

    return {
      content: [
        {
          type: "text",
          text: args.confirmed ? "Confirmed." : "Cancelled."
        }
      ],
      structuredContent: { confirmed: args.confirmed }
    };
  }
);

/* ---- Resource: bundled HTML ---- */
registerAppResource(
  server,
  "Confirm Experiment",
  "mcp-app://confirm-experiment",
  {
    description: "Experiment confirmation summary UI."
  },
  async () => {
    const htmlPath = resolve("dist", "index.html");
    const text = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: "mcp-app://confirm-experiment",
          mimeType: RESOURCE_MIME_TYPE,
          text
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
