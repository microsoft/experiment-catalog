---
name: test-agent
description: This skill tests provisioned Azure AI Foundry agents by running a test question against each agent's environment file using run_app.py in test mode.
---

To test provisioned agents for an experiment, run the following command from the workspace root:

```bash
node .github/skills/test-agent/test-agent.js "<experiment-dir>"
```

- `experimentDir` is the absolute path to the experiment directory containing `agent_NN.env` files (created by the `provision-agents` skill).

For example:

```bash
node .github/skills/test-agent/test-agent.js "exp-top-k"
```

The script auto-discovers `agent_*.env` files in the experiment directory.

On success, the script prints a JSON array to stdout with one object per agent containing `envFile`, `agentName`, `passed`, and `output`. It exits with code 1 if no agent env files are found or if all agent tests fail.
