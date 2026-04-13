# Requirements

The following are core requirements for AML Evaluation Runner. We also did some quick comparison with Azure AI Foundry but found a few gaps. One example of a key difference is the ability to support any inference engine directly. There are workarounds such as [containerizing](https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/deploy-hosted-agent?view=foundry&tabs=bash) and deploying it into the Foundry Agent Service.

> **See also:** [Design Philosophy - Foundry vs AML](DESIGN_PHILOSOPHY-FOUNDRY_VS_AML.md) for an evaluation approach comparison.

| ID | Requirement | How Supported | Supported in Foundry |
| ---- | ------------- | --------------- | ---------------------- |
| 1 | User-defined number of iterations | Supported by framework | No - [Workaround](#1-user-defined-number-of-iterations) |
| 2 | Ground Truth, Inference output, and Evaluation outputs are stored in blob storage and are immutable once the job completes | Supported by AML datastore setup and configuration | Yes |
| 3 | Resuming from inference step, run evaluation step separately | Supported by framework | No - [Workaround](#3-resuming-from-specific-step) |
| 4 | Allow developers to run inference and evaluation locally | Supported by framework | Partial - [Workaround](#4-allow-developers-to-run-inference-and-evaluation-locally) |
| 5 | Ensure that jobs complete reliably even when there are quota violations (ex. rate-limiting, back-off, retry, etc.) | Retry supported by AML retry configuration for Parallel job | No |
| 6 | Allow for X consumer-defined users to run multiple experiments at the same time | Supported by AML | Yes |
| 7 | Allow developers to track the progress of their long-running experiments | Supported by AML Studio | Partial |
| 8 | An experiment can have multiple permutation, where each permutation differs from another. Support for a hierarchical configuration-driven approach. For example, an experiment run can differ from other experiment run at both configuration level and code level (for example, an extra processing step). | Supported by framework | Yes (use SDK) |
| 9 | Ensure that settings are cleanly segmented, so that non-secret settings are stored in a single config file and only secrets are relegated to the keyvault for cloud-based runs. Local runs will require a separate environment file | Supported by framework | [Yes](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/set-up-key-vault-connection?view=foundry&preserve-view=true) |
| 10 | Support running in serverless or compute instances | Supported by AML compute setup and configuration | No - [Workaround](#10-support-running-in-serverless-or-compute-instances) |
| 11 | Support for easy extraction of evaluation results to be used in custom analysis. Support for exporting all runs for a particular experiment | Supported by framework | Yes |
| 12 | Support tagging runs and experiments, i.e. tagging a run as baseline | Supported by framework | No |

## 1. User-defined number of iterations

LLM output is none-deterministic and the answers generated could vary. In order to even out for this behavior, iterating for 3 or more times allows us to smooth those results so we can tell better whether the change is real or not. The drawback of running more times does mean higher cost and longer time to process. As such, the guidance is that if we are running specific ground truth datasets for testing and quick feedback loop, 3 might work. For actual/official experiment runs, 5 is recommended because it is a more balanced approach statistically.

### Azure AI Foundry Workaround

**Azure AI Foundry does not have built-in iteration support like Azure ML**. To achieve multiple iterations, you must implement a manual loop in your code using either the Agent Framework SDK or the Foundry SDK directly.

> **Note:** Iterations apply to **inference only**. We run inference N times to account for LLM non-determinism, then aggregate results.

#### Option 1: Using Agent Framework SDK

The Agent Framework provides a higher-level abstraction for building agents with Foundry models:

```python
import asyncio
import os
import json
from agent_framework.azure import AzureAIProjectAgentProvider
from azure.identity.aio import AzureCliCredential

async def run_iterations():
    async with (
        AzureCliCredential() as credential,
        AzureAIProjectAgentProvider(
            project_endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"],
            model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
            credential=credential,
        ) as provider,
    ):
        agent = await provider.create_agent(
            name="InferenceAgent",
            instructions="You are a helpful assistant.",
        )

        # Manual iteration loop
        num_iterations = 5
        all_results = []

        for ground_truth in ground_truth_data:
            for iteration in range(num_iterations):
                response = await agent.run(ground_truth["query"])
                all_results.append({
                    "query": ground_truth["query"],
                    "response": str(response),
                    "iteration": iteration,
                })

        # Save results
        with open("inference_results.jsonl", "w") as f:
            for result in all_results:
                f.write(json.dumps(result) + "\n")

if __name__ == "__main__":
    asyncio.run(run_iterations())
```

#### Option 2: Using Foundry SDK Directly

Use `azure-ai-projects` package to call Foundry models directly:

```python
import os
import json
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

# Initialize client
project = AIProjectClient(
    endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
)

# Get OpenAI-compatible client for chat completions
openai_client = project.get_openai_client(api_version="2024-10-21")

# Manual iteration loop
num_iterations = 5
all_results = []

for ground_truth in ground_truth_data:
    for iteration in range(num_iterations):
        response = openai_client.chat.completions.create(
            model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
            messages=[{"role": "user", "content": ground_truth["query"]}],
        )
        all_results.append({
            "query": ground_truth["query"],
            "response": response.choices[0].message.content,
            "iteration": iteration,
        })

# Save results
with open("inference_results.jsonl", "w") as f:
    for result in all_results:
        f.write(json.dumps(result) + "\n")
```

#### References

- [Agent Framework GitHub](https://github.com/microsoft/agent-framework)
- [Foundry SDK Overview](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/sdk-overview)

## 2. Immutable Blob output

The output for inference and evaluation results could be in any shape. Having a blob storage is the most flexible way to store the data format. AML allows for the results to be immutable via AML datastore. To be clear, the blob output path is not read-only at runtime because we are writing to it. However, once written to storage, if we open up Azure ML Studio, it is read-only view and we can only download the blob.

A user with access to the storage account could still directly manipulate the content in blob storage directly but that will need to be handled differently via governance. For example, the user could be granted Storage Blob Data Reader only.

## 3. Resuming from specific Step

When running evaluation step, it could fail for various reasons such as rate-limiting or outage. Instead of running through all ground truths to redo inference step which is another cost, we could resume from the inference step and just start evaluation again. This helps save cost. All original configurations are reused and reduce the need to review the configuration for correctness.

### Foundry Workaround

**Azure AI Foundry treats inference and evaluation as separate SDK operations**. Implement checkpointing to resume within a step:

```python
import os
import json
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

def run_inference_with_checkpoint(input_file: str, output_file: str, checkpoint_file: str = "checkpoint.json"):
    start_index = 0
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file) as f:
            start_index = json.load(f).get("last_completed", 0)
    
    with open(input_file) as f:
        items = [json.loads(line) for line in f]
    
    client = AIProjectClient(endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"], credential=DefaultAzureCredential())
    openai_client = client.get_openai_client(api_version="2024-10-21")
    
    mode = "a" if start_index > 0 else "w"
    with open(output_file, mode) as out:
        for i, item in enumerate(items[start_index:], start=start_index):
            response = openai_client.chat.completions.create(
                model=os.environ["MODEL_NAME"],
                messages=[{"role": "user", "content": item["query"]}],
            )
            out.write(json.dumps({"query": item["query"], "response": response.choices[0].message.content}) + "\n")
            out.flush()
            with open(checkpoint_file, "w") as cp:
                json.dump({"last_completed": i + 1}, cp)
    
    if os.path.exists(checkpoint_file):
        os.remove(checkpoint_file)
```

## 4. Allow developers to run inference and evaluation locally

You may be initially writing inference (or evaluation) code and you need to test to ensure it works and debug with breakpoints. By running inference locally and hosting it with [DevTunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview), when AML job is running, we can tell it to connect to the DevTunnel endpoint which will connect to your local instance. The same setup can be accomplished with evaluation.

### Foundry Workaround

**Partial Support - Requires Network Connectivity**

| Component | Execution Location |
|-----------|-------------------|
| `evaluate()` orchestration | Local (your machine) |
| AI-assisted evaluators (Relevance, Groundedness) | Local SDK → Azure OpenAI API calls |
| NLP-based evaluators (F1Score, BleuScore) | Fully local (no API calls) |
| Results upload to Foundry | Requires `azure_ai_project` at evaluation time |

```python
from azure.ai.evaluation import evaluate, RelevanceEvaluator, F1ScoreEvaluator

result = evaluate(
    data="data.jsonl",
    evaluators={
        "relevance": RelevanceEvaluator(model_config),  # Requires network
        "f1_score": F1ScoreEvaluator(),  # Fully offline
    },
    azure_ai_project=azure_ai_project,  # Required for portal sync
)
print(result.studio_url)
```

## 5. Ensure that jobs complete reliably even when there are quota violations

Due to rate-limiting and other potential transient issues, there is a need to configure retries and control the number of attempts. This will help in reducing the need to refresh from start.

## 6. Run multiple experiments at the same time

There could be on or more users running X permutations of an experiment. We should note that each step of an experiment would run in the context of a node and more nodes mean more experiments can run at the same time. One thing to be careful is to set expectations of how many experiment runs can go at the same time. This is because the LLM model could be set to a specific limit and if we can control the number of experiment runs (nodes), we can reduce the rate-limit type of errors since less jobs are running in parallel. In AML compute configuration, the [node configuration](https://learn.microsoft.com/en-us/azure/machine-learning/how-to-create-attach-compute-cluster?view=azureml-api-2&tabs=python#create) determines the minimum and maximum nodes.

## 7. Track experiment progress

It will be useful to visually track how far an experiment has progress or some logs to infer progress. In AML, we can track the progress of each step of inference, evaluation and summarization visually in the Azure ML Studio UI. We can further open the job progress log to see how many files have been processed and the estimated time to complete.

## 8. Allow for experiment runs to differ using configuration

Each experiment run could be testing different permutations of an experiment. For example, a top-K experiment for retrieval (Azure AI search) might test top-K of 5, 10, 15, and 20. We need each experiment run to be configured differently but only for this configuration key of top-K with different value.

## 9. Support secret from KeyVault

To maintain security, we should be able to pull secrets from key vault. AML Evaluation Runner supports configuration with explicit keyvault url reference and will pull secrets that way via a built-in client. For example, a configuration could have <https://somekeykb.vault.azure.net/secrets/app-insights-connection-string/> as the value and AML Evaluation Runner will pull the appropriate value during runtime.

## 10. Support running in serverless or compute instances

The compute needed for AML should be able to selectively be running either in a serverless context which means there are no pre-provisioned compute OR running in a pre-provisioned compute. A compute instance could be running in a Azure Virtual Network and can connect to resources via private endpoints to ensure network privacy while serverless does not have this capability. A compute instance can also be configured to stay online for a period of time which means if we have several experiments throughout the day, we can have a "hot" instance ready to pick up a job while a serverless means we need to wait for it to be spin up before being able to run a job.

### Foundry Workaround

**Azure AI Foundry evaluations are serverless and managed**. For compute isolation (VNet, private endpoints), containerize and deploy as a hosted agent:

```python
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import ImageBasedHostedAgentDefinition

client = AIProjectClient(endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"], credential=DefaultAzureCredential())

agent = client.agents.create_version(
    agent_name="evaluation-agent",
    definition=ImageBasedHostedAgentDefinition(
        cpu="2",
        memory="4Gi",
        image="myregistry.azurecr.io/eval-agent:v1",
    )
)
```

## 11. Support for easy extraction of evaluation results to be used in custom analysis

The results are stored in blob and follow the convention of `experiment_name/job_id`. Developers can use the Storage SDK or azcopy to download the blob content.

## 12. Support tagging runs and experiments

At runtime, we want to have the ability to tag each experiment run such as saying top-k-experiment and top-k-10 for example. When doing comparisons, this helps us compare across runs.
