const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

/**
 * Read a value from a .env file by key.
 *
 * @param {string} envPath - Absolute path to the .env file.
 * @param {string} key     - The key to look up.
 * @returns {string|null} The value, or null if not found.
 */
function readEnvValue(envPath, key) {
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const k = trimmed.slice(0, eqIndex).trim();
    if (k === key) {
      let v = trimmed.slice(eqIndex + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

/**
 * Discover experiment env files in the experiment directory matching
 * exp_*.env, sorted alphabetically.
 *
 * @param {string} experimentDir - Absolute path to the experiment directory.
 * @returns {string[]} Sorted array of absolute paths to experiment env files.
 */
function discoverExpEnvFiles(experimentDir) {
  const files = fs
    .readdirSync(experimentDir)
    .filter((f) => /^exp_\d+\.env$/i.test(f))
    .sort();

  return files.map((f) => path.join(experimentDir, f));
}

/**
 * Run the AML evaluation pipeline for each experiment env file.
 *
 * @param {object} options
 * @param {string} options.experimentDir  - Absolute path to the experiment directory.
 * @param {string} options.hypothesis     - The experiment hypothesis text.
 * @param {string} options.experimentType - The experiment type (e.g. "generation").
 * @param {string} [options.runnerDir]      - Optional AML runner directory containing run.py.
 * @returns {Array<{envFile: string, status: string, output: string}>}
 */
function runExperiments({ experimentDir, hypothesis, experimentType, runnerDir }) {
  if (!experimentDir) throw new Error("experimentDir is required.");
  if (!hypothesis) throw new Error("hypothesis is required.");
  if (!experimentType) throw new Error("experimentType is required.");

  const resolvedRunnerDir = resolveRunnerDir(runnerDir);
  if (!resolvedRunnerDir) {
    throw new Error(
      "AML runner directory not found. Set AML_RUNNER_DIR or pass runnerDir to point to a directory containing run.py."
    );
  }

  const envFiles = discoverExpEnvFiles(experimentDir);
  if (envFiles.length === 0) {
    throw new Error(
      `No experiment env files (exp_*.env) found in: ${experimentDir}`
    );
  }

  const results = [];

  for (const envFile of envFiles) {
    const basename = path.basename(envFile);
    console.error(`Submitting pipeline for ${basename}...`);

    const annotations = `experiment_type=${experimentType}`;

    const args = [
      "run",
      "python",
      "run.py",
      "--env_path",
      envFile,
      "--hypothesis",
      hypothesis,
      "--annotations",
      annotations,
    ];

    const result = spawnSync("uv", args, {
      cwd: resolvedRunnerDir,
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "pipe"],
    });

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const combined = stdout + "\n" + stderr;

    // Log full output to stderr for visibility
    if (combined.trim()) console.error(combined.trim());

    // Parse the "Pipeline created: <timestamp>, see: <url>" line from combined output
    // logging.info writes to stderr, so we search both streams
    const pipelineMatch = combined.match(
      /Pipeline created:\s*(\S+),\s*see:\s*(\S+)/
    );

    if (result.status !== 0 && !pipelineMatch) {
      throw new Error(
        `Failed to submit pipeline for "${basename}":\n${stderr || result.error}`
      );
    }

    const pipelineTimestamp = pipelineMatch ? pipelineMatch[1] : null;
    const studioUrl = pipelineMatch ? pipelineMatch[2] : null;

    // Derive agent name from the corresponding agent_NN.env file
    const agentEnvPath = path.join(
      experimentDir,
      basename.replace(/^exp_/, "agent_")
    );
    const agentName = readEnvValue(agentEnvPath, "AZURE_AGENT_NAME") || "—";

    results.push({
      envFile,
      agentName,
      status: "submitted",
      pipelineTimestamp: pipelineTimestamp,
      studioUrl: studioUrl,
      output: combined.trim(),
    });
  }

  // Update README.md with the provisioning results
  updateReadmeProvisioningResults(experimentDir, results);

  return results;
}

/**
 * Build a Markdown summary table of the experiment run results.
 *
 * @param {Array<object>} results - The experiment run results array.
 * @returns {string} Markdown-formatted provisioning results summary.
 */
function buildProvisioningResultsSummary(results) {
  const lines = [];
  lines.push("| # | Agent Name | Env File | Pipeline |");
  lines.push("|---|------------|----------|----------|");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const envBasename = path.basename(r.envFile);
    const pipeline = r.pipelineTimestamp && r.studioUrl
      ? `[${r.pipelineTimestamp}](${r.studioUrl})`
      : r.pipelineTimestamp || "—";
    lines.push(`| ${i + 1} | ${r.agentName} | ${envBasename} | ${pipeline} |`);
  }
  return lines.join("\n");
}

/**
 * Replace the {{PROVISIONING_RESULTS}} placeholder in the experiment README.md
 * with the experiment run results summary.
 *
 * @param {string} experimentDir - Absolute path to the experiment directory.
 * @param {Array<object>} results - The experiment run results array.
 */
function updateReadmeProvisioningResults(experimentDir, results) {
  const readmePath = path.join(experimentDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    console.error(`README.md not found in ${experimentDir}, skipping provisioning results update.`);
    return;
  }

  const content = fs.readFileSync(readmePath, "utf-8");
  if (!content.includes("{{PROVISIONING_RESULTS}}")) {
    console.error(`No {{PROVISIONING_RESULTS}} placeholder found in README.md, skipping update.`);
    return;
  }

  const summary = buildProvisioningResultsSummary(results);
  const updated = content.replace("{{PROVISIONING_RESULTS}}", summary);
  fs.writeFileSync(readmePath, updated, "utf-8");
  console.error(`Updated README.md with provisioning results summary.`);
}

module.exports = { runExperiments, buildProvisioningResultsSummary, updateReadmeProvisioningResults };

// ── CLI usage ───────────────────────────────────────────────────────────────
// node run-experiment.js <experiment-dir> <hypothesis> <experiment-type>
//
// Example:
//   node run-experiment.js ".../exp-top-k" "Increasing top-k improves quality" "generation"
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [experimentDir, hypothesis, experimentType] = process.argv.slice(2);

  if (!experimentDir || !hypothesis || !experimentType) {
    console.error(
      "Usage: node run-experiment.js <experiment-dir> <hypothesis> <experiment-type>"
    );
    process.exit(1);
  }

  try {
    const results = runExperiments({ experimentDir, hypothesis, experimentType });
    // Print structured output to stdout for the agent to capture
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
