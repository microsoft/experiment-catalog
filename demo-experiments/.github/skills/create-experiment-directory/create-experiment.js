#!/usr/bin/env node

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * If catalog details are provided, obtain a bearer token, then GET the
 * project's experiments. If the experiment does not exist, POST to create it.
 *
 * @param {string} catalogProject      - The catalog project name.
 * @param {string} catalogAppUri       - The catalog app URI (e.g. https://...azurecontainerapps.io/swagger).
 * @param {string} catalogOidcClientId - The OIDC client ID for obtaining a bearer token.
 * @param {string} experimentName      - The experiment name to check/create.
 * @param {string} hypothesis          - The experiment hypothesis text.
 * @returns {Promise<boolean>} True if the experiment exists or was created; false otherwise.
 */
async function ensureCatalogExperiment(catalogProject, catalogAppUri, catalogOidcClientId, experimentName, hypothesis) {
  const baseUrl = catalogAppUri.replace(/\/swagger\/?$/, "");

  let token;
  try {
    token = execSync(
      `az account get-access-token --scope "api://${catalogOidcClientId}/.default" --query "accessToken" -o tsv`,
      { encoding: "utf-8", timeout: 30_000 }
    ).trim();
  } catch {
    console.log("Failed to obtain bearer token — skipping catalog registration.");
    return false;
  }

  // GET /api/projects/{projectName}/experiments → Experiment[]
  try {
    const listUrl = `${baseUrl}/api/projects/${encodeURIComponent(catalogProject)}/experiments`;
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (listRes.ok) {
      const experiments = await listRes.json();
      // Experiment schema: { name: string, hypothesis: string, ... }
      if (Array.isArray(experiments) && experiments.some((e) => e.name === experimentName)) {
        console.log(`Catalog experiment "${experimentName}" already exists in project "${catalogProject}".`);
        return true;
      }
    }
  } catch {
    console.log("Failed to list catalog experiments — will attempt to create.");
  }

  // POST /api/projects/{projectName}/experiments → create Experiment
  try {
    const createUrl = `${baseUrl}/api/projects/${encodeURIComponent(catalogProject)}/experiments`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ name: experimentName, hypothesis })
    });

    if (createRes.ok) {
      console.log(`Catalog experiment "${experimentName}" created in project "${catalogProject}".`);
      return true;
    } else {
      const detail = await createRes.text();
      console.log(`Failed to create catalog experiment (${createRes.status}): ${detail}`);
    }
  } catch (err) {
    console.log(`Failed to create catalog experiment: ${err.message}`);
  }

  return false;
}

/**
 * Creates a new experiment directory with a populated README.md.
 *
 * @param {object} options
 * @param {string} options.experimentName  - Cleaned name of the experiment used for the directory (will be prefixed with "exp-").
 * @param {string} options.hypothesis      - The experiment hypothesis text.
 * @param {string} [options.displayName]       - Original (as-is) experiment name used in the README.
 *                                                Defaults to experimentName if not provided.
 * @param {string} [options.catalogProject]      - Optional catalog project name.
 * @param {string} [options.catalogAppUri]       - Optional catalog app URI. Required when catalogProject is set.
 * @param {string} [options.catalogOidcClientId] - Optional OIDC client ID. Required when catalogProject is set.
 * @param {string} [options.rootDir]             - Root directory where the exp- folder is created
 *                                                (defaults to the demo-experiments workspace root).
 * @returns {Promise<string>} The absolute path of the created experiment directory.
 */
export async function createExperiment({ experimentName, hypothesis, displayName, catalogProject, catalogAppUri, catalogOidcClientId, rootDir }) {
  if (!experimentName) throw new Error("experimentName is required.");
  if (!hypothesis) throw new Error("hypothesis is required.");

  // Use displayName (as-is name) for README; fall back to experimentName
  const readmeName = displayName || experimentName;

  const expDate = new Date().toISOString().slice(0, 10);

  // Resolve paths
  const workspaceRoot = rootDir ?? resolve(__dirname, "..", "..", "..");
  const dirName = `exp-${experimentName}`;
  const expDir = resolve(workspaceRoot, dirName);

  // Ensure the directory doesn't already exist
  try {
    await access(expDir);
    throw new Error(`Experiment directory already exists: ${expDir}`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    // ENOENT means it doesn't exist yet — that's what we want
  }

  // Read the template
  const templatePath = resolve(__dirname, "README_TEMPLATE.md");
  let content = await readFile(templatePath, "utf-8");

  // Replace placeholders
  content = content.replace("{{DATE}}", expDate);
  content = content.replace("{{EXPERIMENT_NAME}}", readmeName);
  content = content.replace("{{HYPOTHESIS}}", hypothesis);

  // Create directory and write README.md
  await mkdir(expDir, { recursive: true });
  await writeFile(resolve(expDir, "README.md"), content, "utf-8");

  // If catalog details were provided, ensure the experiment exists in the catalog
  if (catalogProject && catalogAppUri && catalogOidcClientId) {
    const catalogOk = await ensureCatalogExperiment(catalogProject, catalogAppUri, catalogOidcClientId, experimentName, hypothesis);

    // Append a Catalog Link to the Execution Details section in the README
    if (catalogOk) {
      const readmePath = resolve(expDir, "README.md");
      let readme = await readFile(readmePath, "utf-8");
      const catalogBaseUrl = catalogAppUri.replace(/\/swagger\/?$/, "");
      const catalogLink = `[Catalog Link](${catalogBaseUrl}/?project=${encodeURIComponent(catalogProject)}&experiment=${encodeURIComponent(experimentName)})`;

      // Find the "### Execution Details" section and append before the next section
      const sectionPattern = /(### Execution Details[^\n]*\n)([\s\S]*?)(\n##)/;
      const match = readme.match(sectionPattern);
      if (match) {
        const sectionHeader = match[1];
        const sectionBody = match[2].trimEnd();
        const nextSection = match[3];
        readme = readme.replace(sectionPattern, `${sectionHeader}${sectionBody}\n\n${catalogLink}\n\n${nextSection}`);
        await writeFile(readmePath, readme, "utf-8");
        console.log(`Catalog link appended to README.md in Execution Details section.`);
      }
    }
  }

  return expDir;
}

// ── CLI usage ───────────────────────────────────────────────────────────────
// node create-experiment.js <experiment-name> <hypothesis> [display-name] [catalog-project] [catalog-app-uri] [catalog-oidc-client-id]
// Example:
//   node create-experiment.js my-experiment "Users prefer dark mode" "My Experiment" my-project "https://catalog.example.io/swagger" "8b48788f-ae36-47e4-902b-39c424c46ad5"
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const [experimentName, hypothesis, displayName, catalogProject, catalogAppUri, catalogOidcClientId] = process.argv.slice(2);

  if (!experimentName || !hypothesis) {
    console.error("Usage: node create-experiment.js <experiment-name> <hypothesis> [display-name] [catalog-project] [catalog-app-uri] [catalog-oidc-client-id]");
    process.exit(1);
  }

  try {
    const dir = await createExperiment({ experimentName, hypothesis, displayName, catalogProject, catalogAppUri, catalogOidcClientId });
    console.log(`Experiment directory created: ${dir}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
