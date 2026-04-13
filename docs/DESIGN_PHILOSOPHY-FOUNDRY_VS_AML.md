# Design Philosophy: Foundry vs AML Evaluation Runner

This document explains the fundamental difference in how Azure AI Foundry and AML Evaluation Runner approach experiments, evaluations, and the development lifecycle.

## Scope of This Comparison

This comparison focuses on how each platform approaches **evaluation** — specifically the methodology for running, organizing, and analyzing evaluation experiments.

## Foundry Architecture Overview

Based on official documentation, Microsoft Foundry provides:

### SDK Structure
- **Azure AI Foundry SDK** (`AIProjectClient`): Client for Azure AI Foundry services (Models, Evaluations, Data, Connections)
- **Microsoft Agent Framework** (`AzureAIProjectAgentProvider`): Unified agent framework that works across Azure AI Foundry, Azure AI Agent Service, and other platforms
- **Project Endpoint**: One endpoint for all operations

### Evaluation-Relevant Capabilities
- **Agent Versioning**: Immutable versions after save; useful for A/B testing
- **Observability**: OpenTelemetry integration, tracing, Azure Monitor
- **Evaluation**: Results returned after `evaluate()` completes; logged to connected Azure Storage account and viewable via Foundry portal

## The Real Difference: Scale and Organization

### Azure AI Foundry: "Agent-First Development"

Foundry is designed for building and deploying AI agents:

```
Build Agent → Test in Playground → Evaluate → Publish → Monitor
```

**Foundry excels at:**
- Rapid agent prototyping with visual playground
- Agent versioning with immutability
- OpenTelemetry observability and tracing
- Quick evaluation runs with built-in evaluators

**Foundry limitations for systematic evaluation:**
- Evaluation is designed as a **quality check**, not experiment management
- Results only available after completion (stored in Azure Storage)
- No native "Experiment" grouping concept for evaluation runs
- No automatic multi-iteration inference (must implement manually)
- No real-time step progress during evaluation
- No built-in pipeline visualization (inference → evaluation as separate steps)

### AML Evaluation Runner: "Systematic Evaluation at Scale"

AML Evaluation Runner is designed for rigorous experiment management:

```
Configure → Infer (N iterations) → Evaluate → Compare → Repeat
```

**AML Evaluation Runner excels at:**

*Azure ML provides natively:*
- Hierarchical organization (Experiment → Run → Step)
- Real-time progress tracking in Azure ML Studio

*This framework adds:*
- Built-in iteration support for statistical significance (configuration-driven)
- Resume capability at step and item level
- Cross-run comparison within experiments
- Structured tagging and metadata

## Hierarchy Comparison

### Azure AI Foundry Structure

```
Foundry Resource
└── Project
    ├── Agents (versioned)
    │   ├── MyAgent:v1
    │   ├── MyAgent:v2
    │   └── MyAgent:v3
    ├── Models (deployments)
    ├── Evaluations (flat list)
    │   ├── Evaluation Run 1
    │   ├── Evaluation Run 2
    │   └── Evaluation Run 3
    └── Connections
```

- Agents are versioned with immutability
- Evaluations are a flat list under the project
- No "Experiment" concept to group related evaluation runs
- `display_name` is the primary way to identify evaluation runs

### AML Evaluation Runner Structure

```
Workspace
└── Experiment (logical grouping)
    ├── Run 1 (top-k=5)
    │   ├── Step: Inference
    │   └── Step: Evaluation
    ├── Run 2 (top-k=10)
    │   ├── Step: Inference
    │   └── Step: Evaluation
    └── Run 3 (top-k=15)
        ├── Step: Inference
        └── Step: Evaluation
```

- Experiment groups related runs for comparison
- Steps are visible with individual progress and logs
- Tags and metadata are structured and queryable
- Built-in comparison view within experiments

## Feature Comparison

| Feature | Azure AI Foundry | AML Evaluation Runner |
|---------|------------------|----------------------|
| **Primary Focus** | Agent development & deployment | Systematic evaluation at scale |
| **Versioning** | Agent versioning (immutable) | Run versioning within experiments |
| **Iteration Support** | Manual (loop in code) | Framework-provided (configuration-driven) |
| **Progress Tracking** | After completion (results in Azure Storage) | Real-time (Azure ML Studio - native) |
| **Hierarchy** | Project → Evaluations (flat) | Workspace → Experiment → Run → Step (Azure ML native) |
| **Resume Capability** | Must implement custom checkpointing | Framework-provided at step level |
| **Observability** | OpenTelemetry + Azure Monitor | Azure ML Studio + custom logging |

## Integration Opportunity

The two approaches can be complementary:

1. **Develop agents in Foundry** — a one-stop shop for rapid agent development, deployment, quality evaluation, and observability
2. **Run systematic evaluations with AML Evaluation Runner** when you need rigorous experimentation at scale (many configurations, statistical significance, large datasets)

This combines Foundry's unified agent development experience with AML's evaluation rigor for large-scale experimentation.

## References

- [Foundry SDK Overview](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/sdk-overview)
- [Agent Development](https://learn.microsoft.com/en-us/azure/ai-foundry/agents/)
- [Azure AI Evaluation SDK](https://github.com/Azure/azure-sdk-for-python/tree/main/sdk/evaluation/azure-ai-evaluation)
- [Agent Framework GitHub](https://github.com/microsoft/agent-framework)
- [Deploy Hosted Agents](https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/deploy-hosted-agent)
- [Cloud Evaluation Documentation](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/cloud-evaluation)
