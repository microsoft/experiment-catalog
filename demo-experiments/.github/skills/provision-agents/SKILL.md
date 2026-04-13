---
name: provision-agents
description: This skill provisions one Azure AI Foundry agent per permutation (prompt or model) in an experiment directory. It reads the baseline .env, generates per-permutation .env files in the experiment directory, and invokes agent.py for each.
---

To provision Azure AI Foundry agents for an experiment, run the following command from the workspace root:

**Prompt permutation** — one agent per `prompt_NN.md` file:

```bash
node .github/skills/provision-agents/provision-agents.js "<experiment-dir>" "<experiment-name>" prompt
```

**Model permutation** — one agent per deployment model:

```bash
node .github/skills/provision-agents/provision-agents.js "<experiment-dir>" "<experiment-name>" model <model1> <model2> ...
```

**Search-index permutation** — one agent per Azure AI Search index:

```bash
node .github/skills/provision-agents/provision-agents.js "<experiment-dir>" "<experiment-name>" search-index <index1> <index2> ...
```

**Search-config permutation** — one agent per search configuration (reads `search-config.json` from experiment dir):

```bash
node .github/skills/provision-agents/provision-agents.js "<experiment-dir>" "<experiment-name>" search-config
```

- `experimentDir` is the absolute path to the experiment directory.
- `experimentName` is the cleaned experiment name (used as a prefix for agent names).
- The third argument is the `permutationType`: `prompt`, `model`, `search-index`, or `search-config`.
- For `model` permutation, pass one or more model deployment names as additional arguments.
- For `search-index` permutation, pass one or more Azure AI Search index names as additional arguments. Index names must follow the `{name}-index-{version}` convention (e.g. `isedevblog-index-1`).
- For `search-config` permutation, the script reads a `search-config.json` file from the experiment directory. This file must contain a JSON array of objects, each with `queryType` (`"simple"`, `"full"`, or `"semantic"`), `topK` (integer 1–100), and `semanticConfig` (string or `null`). No extra CLI arguments are needed.

For example:

```bash
# Prompt permutation
node .github/skills/provision-agents/provision-agents.js "exp-top-k" "top-k" prompt

# Model permutation
node .github/skills/provision-agents/provision-agents.js "exp-model-test" "model-test" model gpt-4.1 gpt-5-chat

# Search-index permutation
node .github/skills/provision-agents/provision-agents.js "exp-index-test" "index-test" search-index isedevblog-index-1 isedevblog-index-2

# Search-config permutation (requires search-config.json in experiment dir)
node .github/skills/provision-agents/provision-agents.js "exp-config-test" "config-test" search-config
```

### Prompt permutation mode

The script discovers all `prompt_*.md` files in the experiment directory (sorted alphabetically) and, for each one:

1. Reads the baseline `.env` from `inference/foundryv2agent/.env`.
2. Creates a per-prompt `.env` file named `agent_NN.env` in the experiment directory, inheriting all baseline values and overriding `AGENT_PROMPT_PATH` (set to the absolute path of the prompt file) and `AZURE_AGENT_NAME` (set to `<experimentName>-prompt-NN`).
3. Invokes `uv run python agent.py --env-path <env-file>` from the `inference/foundryv2agent` directory to create the agent in Azure AI Foundry.

On success, the script prints a JSON array to stdout with one object per agent containing `promptFile`, `envFile`, and `agentName`.

### Model permutation mode

The script iterates over the provided model deployment names and, for each one:

1. Reads the baseline `.env` from `inference/foundryv2agent/.env`.
2. Creates a per-model `.env` file named `agent_NN.env` in the experiment directory, inheriting all baseline values and overriding `AZURE_FOUNDRY_MODEL_DEPLOYMENT` (set to the model deployment name) and `AZURE_AGENT_NAME` (set to `<experimentName>-model-NN`).
3. Invokes `uv run python agent.py --env-path <env-file>` from the `inference/foundryv2agent` directory to create the agent in Azure AI Foundry.

On success, the script prints a JSON array to stdout with one object per agent containing `modelDeployment`, `envFile`, and `agentName`.

### Search-index permutation mode

The script iterates over the provided search index names and, for each one:

1. Reads the baseline `.env` from `inference/foundryv2agent/.env`.
2. Parses the full index name (e.g. `isedevblog-index-2`) into `INDEX_NAME` (e.g. `isedevblog`) and `INDEX_VERSION` (e.g. `2`) components using the `{name}-index-{version}` convention.
3. Creates a per-index `.env` file named `agent_NN.env` in the experiment directory, inheriting all baseline values and overriding `INDEX_NAME`, `INDEX_VERSION`, and `AZURE_AGENT_NAME` (set to `<experimentName>-index-NN`).
4. Invokes `uv run python agent.py --env-path <env-file>` from the `inference/foundryv2agent` directory to create the agent in Azure AI Foundry.

On success, the script prints a JSON array to stdout with one object per agent containing `searchIndex`, `envFile`, and `agentName`.

### Search-config permutation mode

The script iterates over the provided search configuration objects and, for each one:

1. Reads the baseline `.env` from `inference/foundryv2agent/.env`.
2. Reads the `search-config.json` file from the experiment directory, which must contain a JSON array of `{queryType, topK, semanticConfig}` objects.
3. Creates a per-config `.env` file named `agent_NN.env` in the experiment directory, inheriting all baseline values and overriding `INDEX_QUERY_TYPE` (the query type), `INDEX_QUERY_TOP` (the top-K value), and `INDEX_QUERY_SEMANTIC_CONFIG` (the semantic configuration name, removed if `null`). `AZURE_AGENT_NAME` is set to `<experimentName>-config-NN`.
4. Invokes `uv run python agent.py --env-path <env-file>` from the `inference/foundryv2agent` directory to create the agent in Azure AI Foundry.

Example `search-config.json`:

```json
[
  { "queryType": "simple", "topK": 5, "semanticConfig": null },
  { "queryType": "semantic", "topK": 10, "semanticConfig": "my-semantic-config" }
]
```

On success, the script prints a JSON array to stdout with one object per agent containing `searchConfig` (the original config object), `envFile`, and `agentName`.

### Error handling

The script exits with code 1 if no prompt files are found (prompt mode), no models are provided (model mode), no search indexes are provided (search-index mode), no search configs are provided (search-config mode), or if any agent provisioning fails.
