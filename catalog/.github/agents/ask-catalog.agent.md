---
description: "Ask questions about experiments using the catalog MCP tools."
tools: ["read", "experiment-catalog/*"]
---

This agent uses the experiment catalog MCP server to analyze experiments.

# Experiment Catalog

A comprehensive tool for cataloging, comparing, and analyzing experiment results. The Experiment Catalog enables teams to track evaluation runs across projects, compare metrics against baselines, and identify performance regressions or improvements in AI/ML experimentation workflows.

## Overview

The experiment catalog organizes experimental data in a hierarchical structure:

| Level      | Also Known As     | Description                                                                    |
| ---------- | ----------------- | ------------------------------------------------------------------------------ |
| Project    | Sprint, Milestone | Fixed evaluation environment (baseline, ground truth, metrics) for experiments |
| Experiment | -                 | A hypothesis-driven test varying inference within a project                    |
| Set        | Permutation       | A configuration variant within an experiment                                   |
| Result     | -                 | All metric values for a single ground truth iteration                          |
| Ref        | Ground Truth      | Reference to the entity being evaluated, used for aggregation and comparison   |

## Key Concepts

### Projects

A project represents a fixed evaluation environment in which experiments are conducted. The project establishes:

- Baseline measurements for comparison
- Ground truth data (often split into validation and test sets)
- Metric definitions and evaluation scripts
- Stable infrastructure configuration

Projects align with milestones or sprints. During a project, the evaluation tooling and data remain constant while developers vary inference approaches through experiments. Each project iteration produces a new version of the solution that can be measured against the previous version.

### Experiments

An experiment tests a specific hypothesis by varying inference parameters, code, or configuration. Experiments contain multiple evaluation runs (sets) to compare different approaches. The goal is to prove or disprove the hypothesis by comparing results against baselines.

### Baselines

Baselines provide measurement points for comparison:

| Baseline Type             | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| Project Baseline          | Initial measurement before experimentation begins           |
| Experiment Baseline       | First run of an experiment before making changes            |
| Final Experiment Baseline | Best configuration run on both validation and test sets     |
| Final Project Baseline    | End-of-project measurement to compare against project start |

When working with non-deterministic inference or evaluation systems, run baselines multiple times (commonly 5 iterations) to establish reliable averages.

### Sets and Refs

- **Set**: A collection of results from a single evaluation run. Running 5 iterations of 12 ground truths constitutes one set. Additional iterations can be added to an existing set.
- **Ref**: The catalog term for a ground truth. Every ground truth is stored and queried as a "ref" throughout the catalog API, MCP tools, and data model. When a user asks about ground truth performance, improvements, or regressions, translate "ground truth" to "ref" in all catalog operations. Refs enable aggregation across iterations and comparison of individual ground truth performance across evaluation runs.

### Iterations

An iteration is a single execution of inference and evaluation for a ground truth. Because AI agents and LLM-based systems are non-deterministic, running multiple iterations is essential:

- **Minimum recommendation**: At least 5 iterations per ground truth
- **Averaging**: Multiple iterations allow averaging results to account for variance in non-deterministic systems
- **Statistical analysis**: P-values and confidence intervals are calculated per ground truth, requiring multiple iterations to determine a reasonable range versus baseline

A result captures all metric values for one ground truth iteration. When a set contains 5 iterations of 12 ground truths, it stores 60 individual results (5 × 12).

## Experimentation Workflow

The recommended workflow follows these phases:

1. **Create a Project**: Establish the fixed evaluation environment
2. **Run a Project Baseline**: Measure initial state before experimentation
3. **Run Experiments**:
   - Create an experiment with a hypothesis
   - Run an experiment baseline (or accept the project baseline)
   - Run permutations varying inference parameters
   - Determine the best permutation
   - Run a final experiment baseline on validation and test sets
   - Write a summary documenting the experiment
   - Review with your team
   - Approve (merge) or reject
4. **Run a Final Project Baseline**: Measure end state after all experiments

## Determining Best Permutation

With many ground truths, differences between permutations are often minimal. Techniques for identifying the best approach:

- **Look at Subsets**: Subsets like "multi-turn" examples may show 20-30% differences where overall metrics show only 1% variance
- **Prioritize Metrics**: Rank metrics by importance and evaluate based on highest-priority metrics first
- **Statistical Significance**: Use p-value calculations to determine when metric changes are meaningful

## Tool Selection

- When comparing a permutation (set) to the baseline, use `CompareExperiment` directly. Do not call `ListSetsForExperiment` first to validate the set name.
- Use `CompareByRef` only when the user asks about individual ground truth (ref) performance, such as which refs improved or regressed.
- Call each tool only when its output is needed. Avoid discovery or pre-check calls before comparison tools.
