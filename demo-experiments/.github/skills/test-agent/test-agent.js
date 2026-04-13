const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Paths ───────────────────────────────────────────────────────────────────
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const AGENT_DIR = path.join(WORKSPACE_ROOT, "inference", "foundryv2agent");
const TEST_QUESTION_JSON = path.join(AGENT_DIR, "gt_test.json");

/**
 * Discover agent env files in the experiment directory matching
 * agent_*.env, sorted alphabetically.
 *
 * @param {string} experimentDir - Absolute path to the experiment directory.
 * @returns {string[]} Sorted array of absolute paths to agent env files.
 */
function discoverAgentEnvFiles(experimentDir) {
  const files = fs
    .readdirSync(experimentDir)
    .filter((f) => /^agent_\d+\.env$/i.test(f))
    .sort();

  return files.map((f) => path.join(experimentDir, f));
}

/**
 * Extract the agent name from an env file by reading the AZURE_AGENT_NAME value.
 *
 * @param {string} envPath - Absolute path to the .env file.
 * @returns {string} The agent name, or the filename if not found.
 */
function extractAgentName(envPath) {
  const content = fs.readFileSync(envPath, "utf-8");

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

    if (key === "AZURE_AGENT_NAME") return value;
  }

  return path.basename(envPath, ".env");
}

/**
 * Test all provisioned agents in an experiment directory.
 * Uses the gt_test.json file located alongside run_app.py.
 *
 * @param {object} options
 * @param {string} options.experimentDir - Absolute path to the experiment directory.
 * @returns {Array<{envFile: string, agentName: string, passed: boolean, output: string}>}
 */
function testAgents({ experimentDir }) {
  if (!experimentDir) throw new Error("experimentDir is required.");

  const testQuestionJson = TEST_QUESTION_JSON;

  if (!fs.existsSync(testQuestionJson)) {
    throw new Error(`Test question JSON not found: ${testQuestionJson}`);
  }

  // Validate that the test question file is valid JSON with required fields
  try {
    const questionData = JSON.parse(
      fs.readFileSync(testQuestionJson, "utf-8")
    );
    if (!questionData.question) {
      throw new Error(
        `Test question JSON must contain a "question" field: ${testQuestionJson}`
      );
    }
  } catch (err) {
    if (err.message.includes("question")) throw err;
    throw new Error(
      `Invalid JSON in test question file: ${testQuestionJson}\n${err.message}`
    );
  }

  const envFiles = discoverAgentEnvFiles(experimentDir);
  if (envFiles.length === 0) {
    throw new Error(
      `No agent env files (agent_*.env) found in: ${experimentDir}`
    );
  }

  const results = [];
  let passCount = 0;

  for (const envFile of envFiles) {
    const agentName = extractAgentName(envFile);

    console.error(
      `Testing agent "${agentName}" with env: ${envFile}`
    );

    let passed = false;
    let output = "";

    try {
      output = execSync(
        `uv run python run_app.py --env_path "${envFile}" --path "${testQuestionJson}" --test`,
        {
          cwd: AGENT_DIR,
          encoding: "utf-8",
          stdio: ["inherit", "pipe", "pipe"],
          timeout: 120000, // 2 minute timeout per agent
        }
      );
      passed = true;
      passCount++;
      console.error(`  ✓ Agent "${agentName}" passed`);
    } catch (err) {
      output = err.stdout || err.stderr || err.message;
      console.error(`  ✗ Agent "${agentName}" failed: ${output.slice(0, 200)}`);
    }

    results.push({
      envFile,
      agentName,
      passed,
      output: output.trim(),
    });
  }

  if (passCount === 0) {
    throw new Error("All agent tests failed.");
  }

  return results;
}

module.exports = { testAgents };

// ── CLI usage ───────────────────────────────────────────────────────────────
// node test-agent.js <experiment-dir>
// Example:
//   node test-agent.js ".../exp-top-k"
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [experimentDir] = process.argv.slice(2);

  if (!experimentDir) {
    console.error(
      "Usage: node test-agent.js <experiment-dir>"
    );
    process.exit(1);
  }

  try {
    const results = testAgents({ experimentDir });
    // Print structured output to stdout for the agent to capture
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
