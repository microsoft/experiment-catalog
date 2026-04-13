const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Paths ───────────────────────────────────────────────────────────────────
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const AGENT_DIR = path.join(WORKSPACE_ROOT, "inference", "foundryv2agent");
const BASELINE_ENV = path.join(AGENT_DIR, ".env");

/**
 * Parse a .env file into a key-value map.
 * Handles comments, blank lines, and quoted values.
 *
 * @param {string} envPath - Absolute path to the .env file.
 * @returns {Map<string, string>} Parsed key-value pairs.
 */
function parseEnvFile(envPath) {
  const content = fs.readFileSync(envPath, "utf-8");
  const entries = new Map();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes if present
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
 * Serialize a key-value map back to .env file format.
 *
 * @param {Map<string, string>} entries - Key-value pairs.
 * @returns {string} The .env file content.
 */
function serializeEnv(entries) {
  const lines = ["# === Agent Configuration (auto-generated) ==="];
  for (const [key, value] of entries) {
    lines.push(`${key}=${value}`);
  }
  lines.push(""); // trailing newline
  return lines.join("\n");
}

/**
 * Discover prompt files in the experiment directory matching prompt_*.md,
 * sorted alphabetically.
 *
 * @param {string} experimentDir - Absolute path to the experiment directory.
 * @returns {string[]} Sorted array of absolute paths to prompt files.
 */
function discoverPromptFiles(experimentDir) {
  const files = fs.readdirSync(experimentDir)
    .filter((f) => /^prompt_\d+\.md$/i.test(f))
    .sort();

  return files.map((f) => path.join(experimentDir, f));
}

/**
 * Extract the prompt number from a prompt filename (e.g. "prompt_01.md" → "01").
 *
 * @param {string} promptPath - Absolute path to the prompt file.
 * @returns {string} The zero-padded number portion.
 */
function extractPromptNumber(promptPath) {
  const basename = path.basename(promptPath);
  const match = basename.match(/^prompt_(\d+)\.md$/i);
  if (!match) throw new Error(`Unexpected prompt filename: ${basename}`);
  return match[1];
}

/**
 * Parse a full Azure AI Search index name into its base name and version
 * components, using the convention: `{indexName}-index-{version}`.
 *
 * @param {string} fullIndexName - The full index name (e.g. "isedevblog-index-1").
 * @returns {{ indexName: string, indexVersion: string }}
 */
function parseIndexName(fullIndexName) {
  const match = fullIndexName.match(/^(.+)-index-(\d+)$/);
  if (!match) {
    throw new Error(
      `Index name "${fullIndexName}" does not match the expected convention "{name}-index-{version}". ` +
      `Cannot split into INDEX_NAME and INDEX_VERSION.`
    );
  }
  return { indexName: match[1], indexVersion: match[2] };
}

/**
 * Provision agents for all prompt files in an experiment directory.
 *
 * @param {object} options
 * @param {string} options.experimentDir  - Absolute path to the experiment directory.
 * @param {string} options.experimentName - Cleaned experiment name.
 * @param {string} options.permutationType - "prompt", "model", "search-index", or "search-config".
 * @param {string[]} [options.models]     - Array of model deployment names (required when permutationType is "model").
 * @param {string[]} [options.searchIndexes] - Array of search index names (required when permutationType is "search-index").
 * @returns {Array<{promptFile: string, envFile: string, agentName: string}>}
 */
function provisionAgents({ experimentDir, experimentName, permutationType, models, searchIndexes }) {
  if (!experimentDir) throw new Error("experimentDir is required.");
  if (!experimentName) throw new Error("experimentName is required.");
  if (!permutationType) throw new Error("permutationType is required.");

  if (!fs.existsSync(BASELINE_ENV)) {
    throw new Error(`Baseline .env not found: ${BASELINE_ENV}`);
  }

  const baselineEntries = parseEnvFile(BASELINE_ENV);
  const results = [];

  if (permutationType === "prompt") {
    // ── Prompt permutation: one agent per prompt file ──────────────────────
    const promptFiles = discoverPromptFiles(experimentDir);
    if (promptFiles.length === 0) {
      throw new Error(
        `No prompt files (prompt_*.md) found in: ${experimentDir}`
      );
    }

    for (const promptPath of promptFiles) {
      const num = extractPromptNumber(promptPath);
      const agentName = `${experimentName}-prompt-${num}`;
      const envFileName = `agent_${num}.env`;
      const envFilePath = path.join(experimentDir, envFileName);

      // Clone baseline and apply per-prompt overrides
      const entries = new Map(baselineEntries);
      entries.set("AGENT_PROMPT_PATH", path.relative(AGENT_DIR, promptPath));
      entries.set("AZURE_AGENT_NAME", agentName);

      // Write the per-prompt .env file
      fs.writeFileSync(envFilePath, serializeEnv(entries), "utf-8");

      // Invoke agent.py with the per-prompt .env
      console.error(
        `Provisioning agent "${agentName}" with env: ${envFilePath}`
      );

      try {
        const output = execSync(
          `uv run python agent.py --env-path "${envFilePath}"`,
          {
            cwd: AGENT_DIR,
            encoding: "utf-8",
            stdio: ["inherit", "pipe", "pipe"],
          }
        );
        console.error(output);
      } catch (err) {
        const stderr = err.stderr || err.message;
        throw new Error(
          `Failed to provision agent "${agentName}":\n${stderr}`
        );
      }

      results.push({
        promptFile: promptPath,
        envFile: envFilePath,
        agentName,
      });
    }
  } else if (permutationType === "model") {
    // ── Model permutation: one agent per model deployment name ─────────────
    if (!models || models.length === 0) {
      throw new Error("models array is required for model permutation.");
    }

    for (let i = 0; i < models.length; i++) {
      const modelName = models[i];
      const num = String(i + 1).padStart(2, "0");
      const agentName = `${experimentName}-model-${num}`;
      const envFileName = `agent_${num}.env`;
      const envFilePath = path.join(experimentDir, envFileName);

      // Clone baseline and apply per-model overrides
      const entries = new Map(baselineEntries);
      entries.set("AZURE_FOUNDRY_MODEL_DEPLOYMENT", modelName);
      entries.set("AZURE_AGENT_NAME", agentName);

      // Write the per-model .env file
      fs.writeFileSync(envFilePath, serializeEnv(entries), "utf-8");

      // Invoke agent.py with the per-model .env
      console.error(
        `Provisioning agent "${agentName}" (model: ${modelName}) with env: ${envFilePath}`
      );

      try {
        const output = execSync(
          `uv run python agent.py --env-path "${envFilePath}"`,
          {
            cwd: AGENT_DIR,
            encoding: "utf-8",
            stdio: ["inherit", "pipe", "pipe"],
          }
        );
        console.error(output);
      } catch (err) {
        const stderr = err.stderr || err.message;
        throw new Error(
          `Failed to provision agent "${agentName}" (model: ${modelName}):\n${stderr}`
        );
      }

      results.push({
        modelDeployment: modelName,
        envFile: envFilePath,
        agentName,
      });
    }
  } else if (permutationType === "search-index") {
    // ── Search-index permutation: one agent per search index ──────────────
    if (!searchIndexes || searchIndexes.length === 0) {
      throw new Error("searchIndexes array is required for search-index permutation.");
    }

    for (let i = 0; i < searchIndexes.length; i++) {
      const fullIndexName = searchIndexes[i];
      const { indexName, indexVersion } = parseIndexName(fullIndexName);
      const num = String(i + 1).padStart(2, "0");
      const agentName = `${experimentName}-index-${num}`;
      const envFileName = `agent_${num}.env`;
      const envFilePath = path.join(experimentDir, envFileName);

      // Clone baseline and apply per-index overrides
      const entries = new Map(baselineEntries);
      entries.set("INDEX_NAME", indexName);
      entries.set("INDEX_VERSION", indexVersion);
      entries.set("AZURE_AGENT_NAME", agentName);

      // Write the per-index .env file
      fs.writeFileSync(envFilePath, serializeEnv(entries), "utf-8");

      // Invoke agent.py with the per-index .env
      console.error(
        `Provisioning agent "${agentName}" (index: ${fullIndexName}) with env: ${envFilePath}`
      );

      try {
        const output = execSync(
          `uv run python agent.py --env-path "${envFilePath}"`,
          {
            cwd: AGENT_DIR,
            encoding: "utf-8",
            stdio: ["inherit", "pipe", "pipe"],
          }
        );
        console.error(output);
      } catch (err) {
        const stderr = err.stderr || err.message;
        throw new Error(
          `Failed to provision agent "${agentName}" (index: ${fullIndexName}):\n${stderr}`
        );
      }

      results.push({
        searchIndex: fullIndexName,
        envFile: envFilePath,
        agentName,
      });
    }
  } else if (permutationType === "search-config") {
    // ── Search-config permutation: one agent per search configuration ────
    // Read configurations from search-config.json in the experiment directory
    const searchConfigPath = path.join(experimentDir, "search-config.json");
    if (!fs.existsSync(searchConfigPath)) {
      throw new Error(
        `search-config.json not found in experiment directory: ${searchConfigPath}\n` +
        `Create this file with an array of {queryType, topK, semanticConfig} objects before running.`
      );
    }

    let searchConfigs;
    try {
      searchConfigs = JSON.parse(fs.readFileSync(searchConfigPath, "utf-8"));
    } catch (err) {
      throw new Error(`Failed to parse ${searchConfigPath}: ${err.message}`);
    }

    if (!Array.isArray(searchConfigs) || searchConfigs.length === 0) {
      throw new Error(`search-config.json must contain a non-empty array of search configurations.`);
    }

    for (let i = 0; i < searchConfigs.length; i++) {
      const config = searchConfigs[i];
      const num = String(i + 1).padStart(2, "0");
      const agentName = `${experimentName}-config-${num}`;
      const envFileName = `agent_${num}.env`;
      const envFilePath = path.join(experimentDir, envFileName);

      // Clone baseline and apply per-config overrides
      const entries = new Map(baselineEntries);
      entries.set("INDEX_QUERY_TYPE", config.queryType);
      entries.set("INDEX_QUERY_TOP", String(config.topK));
      if (config.semanticConfig) {
        entries.set("INDEX_QUERY_SEMANTIC_CONFIG", config.semanticConfig);
      } else {
        entries.delete("INDEX_QUERY_SEMANTIC_CONFIG");
      }
      entries.set("AZURE_AGENT_NAME", agentName);

      // Write the per-config .env file
      fs.writeFileSync(envFilePath, serializeEnv(entries), "utf-8");

      // Invoke agent.py with the per-config .env
      const configLabel = `queryType=${config.queryType}, topK=${config.topK}` +
        (config.semanticConfig ? `, semanticConfig=${config.semanticConfig}` : "");
      console.error(
        `Provisioning agent "${agentName}" (${configLabel}) with env: ${envFilePath}`
      );

      try {
        const output = execSync(
          `uv run python agent.py --env-path "${envFilePath}"`,
          {
            cwd: AGENT_DIR,
            encoding: "utf-8",
            stdio: ["inherit", "pipe", "pipe"],
          }
        );
        console.error(output);
      } catch (err) {
        const stderr = err.stderr || err.message;
        throw new Error(
          `Failed to provision agent "${agentName}" (${configLabel}):\n${stderr}`
        );
      }

      results.push({
        searchConfig: config,
        envFile: envFilePath,
        agentName,
      });
    }
  } else {
    throw new Error(`Unsupported permutationType: "${permutationType}"`);
  }

  // Update README.md with the permutation summary
  updateReadmePermutations(experimentDir, permutationType, results);

  return results;
}

/**
 * Build a Markdown summary of the provisioned permutations.
 *
 * @param {string} permutationType - "prompt", "model", "search-index", or "search-config".
 * @param {Array<object>} results - The provisioning results array.
 * @returns {string} Markdown-formatted permutation summary.
 */
function buildPermutationsSummary(permutationType, results) {
  const lines = [];

  if (permutationType === "prompt") {
    lines.push(`**Permutation type:** prompt`);
    lines.push("");
    lines.push("| # | Agent Name | Env File | Prompt File |");
    lines.push("|---|------------|----------|-------------|");
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const promptBasename = path.basename(r.promptFile);
      const envBasename = path.basename(r.envFile);
      lines.push(`| ${i + 1} | ${r.agentName} | ${envBasename} | ${promptBasename} |`);
    }
  } else if (permutationType === "model") {
    lines.push(`**Permutation type:** model`);
    lines.push("");
    lines.push("| # | Agent Name | Env File | Model Deployment |");
    lines.push("|---|------------|----------|------------------|");
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const envBasename = path.basename(r.envFile);
      lines.push(`| ${i + 1} | ${r.agentName} | ${envBasename} | ${r.modelDeployment} |`);
    }
  } else if (permutationType === "search-index") {
    lines.push(`**Permutation type:** search-index`);
    lines.push("");
    lines.push("| # | Agent Name | Env File | Search Index |");
    lines.push("|---|------------|----------|--------------|");
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const envBasename = path.basename(r.envFile);
      lines.push(`| ${i + 1} | ${r.agentName} | ${envBasename} | ${r.searchIndex} |`);
    }
  } else if (permutationType === "search-config") {
    lines.push(`**Permutation type:** search-config`);
    lines.push("");
    lines.push("| # | Agent Name | Env File | Query Type | Top K | Semantic Config |");
    lines.push("|---|------------|----------|------------|-------|-----------------|");
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const envBasename = path.basename(r.envFile);
      const cfg = r.searchConfig;
      const semCfg = cfg.semanticConfig || "—";
      lines.push(`| ${i + 1} | ${r.agentName} | ${envBasename} | ${cfg.queryType} | ${cfg.topK} | ${semCfg} |`);
    }
  }

  return lines.join("\n");
}

/**
 * Replace the {{PERMUTATIONS}} placeholder in the experiment README.md
 * with the provisioned permutation summary.
 *
 * @param {string} experimentDir  - Absolute path to the experiment directory.
 * @param {string} permutationType - "prompt", "model", "search-index", or "search-config".
 * @param {Array<object>} results - The provisioning results array.
 */
function updateReadmePermutations(experimentDir, permutationType, results) {
  const readmePath = path.join(experimentDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    console.error(`README.md not found in ${experimentDir}, skipping permutation summary update.`);
    return;
  }

  const content = fs.readFileSync(readmePath, "utf-8");
  if (!content.includes("{{PERMUTATIONS}}")) {
    console.error(`No {{PERMUTATIONS}} placeholder found in README.md, skipping update.`);
    return;
  }

  const summary = buildPermutationsSummary(permutationType, results);
  const updated = content.replace("{{PERMUTATIONS}}", summary);
  fs.writeFileSync(readmePath, updated, "utf-8");
  console.error(`Updated README.md with permutation summary.`);
}

module.exports = { provisionAgents, buildPermutationsSummary, updateReadmePermutations };

// ── CLI usage ───────────────────────────────────────────────────────────────
// Prompt permutation:
//   node provision-agents.js <experiment-dir> <experiment-name> prompt
// Model permutation:
//   node provision-agents.js <experiment-dir> <experiment-name> model <model1> <model2> ...
// Search-index permutation:
//   node provision-agents.js <experiment-dir> <experiment-name> search-index <index1> <index2> ...
// Search-config permutation (reads search-config.json from experiment dir):
//   node provision-agents.js <experiment-dir> <experiment-name> search-config
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const experimentDir = args[0];
  const experimentName = args[1];
  const permutationType = args[2] || "prompt";
  const extraArgs = args.slice(3); // remaining args are model names or search index names

  if (!experimentDir || !experimentName) {
    console.error(
      "Usage:\n" +
      "  Prompt:        node provision-agents.js <experiment-dir> <experiment-name> prompt\n" +
      "  Model:         node provision-agents.js <experiment-dir> <experiment-name> model <model1> <model2> ...\n" +
      "  Search-index:  node provision-agents.js <experiment-dir> <experiment-name> search-index <index1> <index2> ...\n" +
      "  Search-config: node provision-agents.js <experiment-dir> <experiment-name> search-config"
    );
    process.exit(1);
  }

  try {
    const results = provisionAgents({
      experimentDir,
      experimentName,
      permutationType,
      models: permutationType === "model" && extraArgs.length > 0 ? extraArgs : undefined,
      searchIndexes: permutationType === "search-index" && extraArgs.length > 0 ? extraArgs : undefined,
    });
    // Print structured output to stdout for the agent to capture
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
