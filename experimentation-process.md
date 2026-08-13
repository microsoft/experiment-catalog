# Experimentation Process

This document proposes a process for running experiments and cataloging them for later comparison. It incorporates practices that have worked well in real-world use, along with improvements identified through experience.

## Workflow

The workflow for running experiments is as follows:

1. Create a Project

1. Run a Project Baseline

1. Run Experiments
   1. Create an Experiment

   1. Run an Experiment Baseline (or accept the Project Baseline)

   1. Run permutations of the experiment

   1. Determine the best permutation

   1. Write a summary

   1. Review with your team

   1. Approve or Reject

1. Run a Final Project Baseline

## Exploration and Formal Evaluation

Notebooks, prototypes, and other ad hoc tools are appropriate for exploring ideas quickly. Once an idea shows enough promise to warrant comparison, review, or adoption, transition it into the formal experimentation workflow. Reproduce it through the official evaluation runner using the standard scripts, metrics, and ground truth data, then record the experiment and its results in the catalog. This preserves the flexibility of early exploration while ensuring that decisions rely on repeatable and comparable evidence.

## Projects (Milestones, Checkpoints)

Whether they are called projects, milestones, or checkpoints, the goal is the same - there should be a period of experimentation which produces a new version of the solution that can be measured and judged as better or worse than the previous version. As there are often many experiments in a project, this ensures that the solution is actually getting better as a whole (there is no guarantee that individual positive experiments will yield a better working solution). This new version could be deployed if it was better allowing for incremental improvement. This would be considered one iteration of experimentation and then the process could start over again for further improvement.

Projects can align with a regular delivery cadence, such as 2-week sprints. At the end of each period, evaluate a new version of the solution against the previous version. Consistent improvement is a good indicator that experimentation should continue. Until experiments commonly fail to produce improvements, there is still fertile ground for further experimentation.

## Baselines

A baseline is a measurement of the current state of the solution. It is important to have a baseline to compare against when running experiments. This allows you to determine if the experiment was successful or not. If the experiment was successful, you should see an improvement over the baseline. If the experiment was not successful, you should see no improvement or a decrease in performance.

When working with non-deterministic inference or evaluation systems, it is important to run the baseline multiple times to get a representative average. Five iterations is a practical starting point for each baseline.

- **Project Baseline**: Run this before doing experimentation so there is something to compare the experiment results against.

- **Experiment Baseline**: Run this before running the experiment permutations so there is something to compare those against. If the system has not been changed since the project was started, you could opt just to make the Project Baseline the Experiment Baseline.

- **Final Project Baseline**: Run this after running all experiments in the project. This will give you a way to compare the start of the project with the end of the project (after merging all changes from the experiments).

## Best Permutation

Determining which experiment permutation is best is not always easy. With a large ground truth set, there is often almost no difference between permutations. The following techniques can help:

- **Look at Subsets**: Looking at all ground truth often shows very little difference, but subsets of the data can reveal significant differences. For example, with 800 ground truths, most experiment permutations might be within 1% of each other, while a subset such as "multi-turn" examples might show a 20-30% difference.

- **Prioritize Metrics**: When an evaluation uses many metrics, some may improve while others worsen between permutations. Prioritize the metrics, then identify the best permutation based on the highest-priority metrics.

- **Statistical Significance**: Use the catalog's built-in bootstrap p-value calculation to determine whether differences between permutations are statistically significant rather than relying on raw metric deltas alone. The catalog supports this via a configurable sample size, confidence level, and minimum-iterations threshold, and can compute p-values automatically on a schedule. This is the recommended way to compare permutations.

## Summary / Review

It is important to have enough documentation about the experiment that it can be repeated. This also helps when reviewing the experiment with your team. Results presented for review should come from the standardized evaluation process and be recorded in the catalog so that reviewers can compare them using consistent data, metrics, and execution methods.

## Approve or Reject

An approval in this case generally refers to the code and configuration being merged into a main branch. Before approval, promising results discovered through exploratory work should be reproduced with the official evaluation runner, scripts, metrics, and ground truth data, with the resulting experiment and measurements recorded in the catalog. A failed experiment that ends in rejection might still provide insights that can be used in future experiments.

## Evaluation System

An evaluation system should account for the following considerations:

- **Concurrency**: It was important for multiple engineers to be able to run experiments at the same time.

- **Resume**: Resume support is helpful when model deployments have constrained token limits. It may become less important when using global deployments with much greater token limits.

- **Hyperparameterization**: An Experimentation Agent can understand how to use the evaluation framework and tools to execute experiments. A user describes what they want in natural language, and the agent builds the necessary configurations and launches the runs.

- **Retry**: Retry support is easy to implement, although it does not necessarily resolve HTTP 429 issues.

- **Metric Subsets**: A single evaluation script that runs all metrics can be limiting. Support subsets of metrics, such as retrieval metrics only or both retrieval and generation metrics.

- **Local Execution**: Fully supporting local execution can speed up the evaluation process.

- **Streaming**: Performance can be improved by running inference and evaluation at the same time and streaming data from one process to the other. This may not be important when evaluations generally take about 30 minutes.

- **Transformation**: The ability to transform input and output data formats is most helpful early in a project. Its value diminishes after standardizing the format of ground truth, inference, and evaluation files.

All these features are supported by the [Evaluator](./evaluator) project.
