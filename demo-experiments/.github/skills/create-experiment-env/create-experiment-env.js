const fs = require("fs");
const path = require("path");

// ── Paths ───────────────────────────────────────────────────────────────────
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DEFAULT_RUNNER_DIR = path.join(WORKSPACE_ROOT, "experiment");

function resolveRunnerDir(explicitRunnerDir) {
  const candidates = [explicitRunnerDir, process.env.AML_RUNNER_DIR, DEFAULT_RUNNER_DIR].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, "run.py"))) {
      return resolved;
    }
  }

  return null;
}

function resolveTemplateEnvPath({ experimentDir, runnerDir, explicitTemplateEnvPath }) {
  const candidates = [
    explicitTemplateEnvPath,
    process.env.AML_EXPERIMENT_TEMPLATE_PATH,
    runnerDir ? path.join(runnerDir, ".test.env") : null,
    path.join(experimentDir, ".test.env"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

/**
 * Parse a .env file into an ordered array of entries, preserving comments
 * and blank lines for faithful reproduction.
 *
 * Each entry is one of:
 *   - { type: "comment", line: string }
 *   - { type: "blank" }
 *   - { type: "kv", key: string, value: string, raw: string }
 *
 * @param {string} envPath - Absolute path to the .env file.
 * @returns {{ entries: Array, kvMap: Map<string, number> }}
 */
function parseEnvFile(envPath) {
  const content = fs.readFileSync(envPath, "utf-8");
  const entries = [];
  const kvMap = new Map(); // key → index into entries[]

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      entries.push({ type: "blank" });
      continue;
    }

    if (trimmed.startsWith("#")) {
      entries.push({ type: "comment", line });
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      entries.push({ type: "comment", line }); // treat malformed as comment
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const idx = entries.length;
    entries.push({ type: "kv", key, value, raw: line });
    kvMap.set(key, idx);
  }

  return { entries, kvMap };
}

/**
 * Serialize entries back to .env file format, applying key-value overrides.
 *
 * @param {Array} entries  - Parsed entries from parseEnvFile.
 * @param {Map<string, number>} kvMap - Key → index mapping.
 * @param {Record<string, string>} overrides - Key-value overrides to apply.
 * @returns {string} The .env file content.
 */
function serializeEnv(entries, kvMap, overrides) {
  const lines = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.type === "blank") {
      lines.push("");
      continue;
    }

    if (entry.type === "comment") {
      lines.push(entry.line);
      continue;
    }

    // entry.type === "kv"
    const overrideValue = overrides[entry.key];
    if (overrideValue !== undefined) {
      lines.push(`${entry.key}=${overrideValue}`);
    } else {
      lines.push(entry.raw);
    }
  }

  return lines.join("\n");
}

/**
 * Create experiment environment files for each agent provisioned in Step 6.
 *
 * For each agent result, the script copies `.test.env`, overrides
 * `AML_EXPERIMENT_NAME` and `AML_INF_ENV_PATH`, and writes the result
 * as `exp_NN.env` in the experiment directory.
 *
 * When catalog options are provided (`catalogProject`, `catalogAppUri`,
 * `catalogOidcClientId`), the script also sets:
 *   - `ENABLED_ACTIONS` — appends `catalog` (or creates if missing)
 *   - `EVAL_SET_CATALOG_URL` — `<catalogAppUri>/api`
 *   - `EVAL_SET_CATALOG_PROJECT` — `<catalogProject>`
 *   - `EVAL_SET_CATALOG_API_APP_ID_URI` — `api://<catalogOidcClientId>`
 *
 * @param {object} options
 * @param {string} options.experimentDir  - Absolute path to the experiment directory.
 * @param {string} options.experimentName - Cleaned experiment name.
 * @param {Array<{envFile: string, agentName: string}>} options.agentResults
 *   - The JSON array returned by provision-agents (Step 6). Each entry has
 *     an `envFile` named `agent_NN.env`.
 * @param {string} [options.catalogProject]        - Optional catalog project name.
 * @param {string} [options.catalogAppUri]         - Optional catalog app URI.
 * @param {string} [options.catalogOidcClientId]   - Optional catalog OIDC client ID.
 * @param {string} [options.runnerDir]             - Optional AML runner directory containing run.py.
 * @param {string} [options.experimentTemplateEnvPath] - Optional path to a baseline .test.env file.
 * @returns {Array<{agentName: string, agentEnvFile: string, experimentEnvFile: string}>}
 */
function createExperimentEnvFiles({ experimentDir, experimentName, agentResults, catalogProject, catalogAppUri, catalogOidcClientId, runnerDir, experimentTemplateEnvPath }) {
  if (!experimentDir) throw new Error("experimentDir is required.");
  if (!experimentName) throw new Error("experimentName is required.");
  if (!agentResults || agentResults.length === 0) {
    throw new Error("agentResults is required and must be non-empty.");
  }

  const hasCatalog = catalogProject && catalogAppUri && catalogOidcClientId;
  const resolvedRunnerDir = resolveRunnerDir(runnerDir);
  if (!resolvedRunnerDir) {
    throw new Error(
      "AML runner directory not found. Set AML_RUNNER_DIR or pass runnerDir to point to a directory containing run.py."
    );
  }

  const resolvedTemplateEnvPath = resolveTemplateEnvPath({
    experimentDir,
    runnerDir: resolvedRunnerDir,
    explicitTemplateEnvPath: experimentTemplateEnvPath,
  });

  if (!resolvedTemplateEnvPath) {
    throw new Error(
      "A baseline .test.env was not found. Set AML_EXPERIMENT_TEMPLATE_PATH, place .test.env in the experiment directory, or restore the default runner template."
    );
  }

  const { entries, kvMap } = parseEnvFile(resolvedTemplateEnvPath);
  const results = [];

  for (const agent of agentResults) {
    const { envFile: agentEnvFile, agentName } = agent;

    // Extract the number from the agent env filename
    // e.g. agent_01.env → num="01"
    // e.g. agent_02.env → num="02"
    const basename = path.basename(agentEnvFile);
    const match = basename.match(/^agent_(\d+)\.env$/i);
    if (!match) {
      throw new Error(`Unexpected agent env filename: ${basename}`);
    }
    const num = match[1];

    // Compute the relative path from the AML runner directory to the agent env file.
    const relativeInfEnvPath = path.relative(resolvedRunnerDir, agentEnvFile).replace(/\\/g, "/");

    // Build overrides
    const overrides = {
      AML_EXPERIMENT_NAME: experimentName,
      AML_INF_ENV_PATH: relativeInfEnvPath,
    };

    // ── Catalog overrides ─────────────────────────────────────────────────
    if (hasCatalog) {
      // ENABLED_ACTIONS: append "catalog" if it already exists, otherwise set it
      const existingIdx = kvMap.get("ENABLED_ACTIONS");
      if (existingIdx !== undefined) {
        const existingValue = entries[existingIdx].value || "";
        const actions = existingValue.split(",").map(a => a.trim()).filter(Boolean);
        if (!actions.includes("catalog")) {
          actions.push("catalog");
        }
        overrides["ENABLED_ACTIONS"] = actions.join(",");
      } else {
        overrides["ENABLED_ACTIONS"] = "catalog";
      }

      // Only set these if they are not already present in .test.env
      if (!kvMap.has("EVAL_SET_CATALOG_URL")) {
        overrides["EVAL_SET_CATALOG_URL"] = `${catalogAppUri}/api`;
      }
      if (!kvMap.has("EVAL_SET_CATALOG_PROJECT")) {
        overrides["EVAL_SET_CATALOG_PROJECT"] = catalogProject;
      }
      if (!kvMap.has("EVAL_SET_CATALOG_API_APP_ID_URI")) {
        overrides["EVAL_SET_CATALOG_API_APP_ID_URI"] = `api://${catalogOidcClientId}`;
      }
    }

    // ── Append missing catalog keys to the end of the env file ──────────
    // When a catalog override key does not already exist in .test.env,
    // serializeEnv won't emit it (it only iterates existing entries).
    // We collect those "extra" keys and append them after serialization.
    const appendLines = [];
    if (hasCatalog) {
      for (const key of ["ENABLED_ACTIONS", "EVAL_SET_CATALOG_URL", "EVAL_SET_CATALOG_PROJECT", "EVAL_SET_CATALOG_API_APP_ID_URI"]) {
        if (overrides[key] !== undefined && !kvMap.has(key)) {
          appendLines.push(`${key}=${overrides[key]}`);
        }
      }
    }

    // Serialize and write
    let content = serializeEnv(entries, kvMap, overrides);
    if (appendLines.length > 0) {
      content = content + "\n" + appendLines.join("\n");
    }
    const expEnvFileName = `exp_${num}.env`;
    const expEnvFilePath = path.join(experimentDir, expEnvFileName);

    fs.writeFileSync(expEnvFilePath, content, "utf-8");

    console.error(`Created experiment env: ${expEnvFilePath}`);
    console.error(`  AML_EXPERIMENT_NAME = ${overrides.AML_EXPERIMENT_NAME}`);
    console.error(`  AML_INF_ENV_PATH    = ${overrides.AML_INF_ENV_PATH}`);
    if (hasCatalog) {
      console.error(`  ENABLED_ACTIONS                = ${overrides.ENABLED_ACTIONS || '(existing)'}`);
      console.error(`  EVAL_SET_CATALOG_URL           = ${overrides.EVAL_SET_CATALOG_URL || '(existing)'}`);
      console.error(`  EVAL_SET_CATALOG_PROJECT       = ${overrides.EVAL_SET_CATALOG_PROJECT || '(existing)'}`);
      console.error(`  EVAL_SET_CATALOG_API_APP_ID_URI = ${overrides.EVAL_SET_CATALOG_API_APP_ID_URI || '(existing)'}`);
    }

    results.push({
      agentName,
      agentEnvFile,
      experimentEnvFile: expEnvFilePath,
    });
  }

  return results;
}

module.exports = { createExperimentEnvFiles };

// ── CLI usage ───────────────────────────────────────────────────────────────
// node create-experiment-env.js <experiment-dir> <experiment-name> [catalogProject] [catalogAppUri] [catalogOidcClientId]
//
// The script reads agent results from <experiment-dir>/agent_results.json
// (the JSON array returned by provision-agents in Step 6).
//
// Example:
//   node create-experiment-env.js ".../exp-top-k" "top-k"
//   node create-experiment-env.js ".../exp-top-k" "top-k" "my-project" "https://myapp.azurewebsites.net" "00000000-0000-0000-0000-000000000000"
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [experimentDir, experimentName, catalogProject, catalogAppUri, catalogOidcClientId] = process.argv.slice(2);

  if (!experimentDir || !experimentName) {
    console.error(
      "Usage: node create-experiment-env.js <experiment-dir> <experiment-name>"
    );
    process.exit(1);
  }

  const agentResultsPath = path.join(experimentDir, "agent_results.json");

  if (!fs.existsSync(agentResultsPath)) {
    console.error(`Error: agent_results.json not found at ${agentResultsPath}`);
    console.error("The provision-agents step must save agent_results.json to the experiment directory before running this skill.");
    process.exit(1);
  }

  let agentResults;
  try {
    const raw = fs.readFileSync(agentResultsPath, "utf-8");
    agentResults = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Failed to read or parse ${agentResultsPath}: ${err.message}`);
    process.exit(1);
  }

  try {
    const opts = { experimentDir, experimentName, agentResults };
    if (catalogProject && catalogAppUri && catalogOidcClientId) {
      opts.catalogProject = catalogProject;
      opts.catalogAppUri = catalogAppUri;
      opts.catalogOidcClientId = catalogOidcClientId;
    }
    const results = createExperimentEnvFiles(opts);
    // Print structured output to stdout for the agent to capture
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
