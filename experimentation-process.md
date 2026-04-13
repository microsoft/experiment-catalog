# Experimentation Process

This document proposes a process for running experiments and then cataloging them for later comparison. This process was used by our team with good success, but there were some areas that could be improved. This document will incorporate those improvements as well.

## Workflow

The workflow for running experiments is as follows:

1. Create a Project

1. Run a Project Baseline

1. Run Experiments
   1. Create an Experiment

   1. Run an Experiment Baseline (or accept the Project Baseline)

   1. Run permutations of the experiment

   1. Determine the best permutation

   1. Run a Final Experiment Baseline

   1. Write a summary

   1. Review with your team

   1. Approve or Reject

1. Run a Final Project Baseline

## Projects (Milestones, Checkpoints)

Whether they are called projects, milestones, or checkpoints, the goal is the same - there should be a period of experimentation which produces a new version of the solution that can be measured and judged as better or worse than the previous version. As there are often many experiments in a project, this ensures that the solution is actually getting better as a whole (there is no guarantee that individual positive experiments will yield a better working solution). This new version could be deployed if it was better allowing for incremental improvement. This would be considered one iteration of experimentation and then the process could start over again for further improvement.

For our engagement, we aligned our projects with our 2-week sprints, so every two weeks we evaluated a new version of the solution and found it in each case to be better than our previous version. This is a good indicator that we should continue with experimentation. Until we reach a point where we are commonly failing to find improvement, there is obviously fertile ground for experimentation.

## Baselines

A baseline is a measurement of the current state of the solution. It is important to have a baseline to compare against when running experiments. This allows you to determine if the experiment was successful or not. If the experiment was successful, you should see an improvement over the baseline. If the experiment was not successful, you should see no improvement or a decrease in performance.

When working with non-deterministic inference or evaluation systems, it is important to run the baseline multiple times to get a good average. For our engagement, we ran all baselines with 5 iterations.

Ground truths are commonly split into "validation" and "test" sets. Baselines are run with both sets. Experimentation is often only run with "validation". This separation ensures that tuning is done on only part of the data so as not to overfit.

- **Project Baseline**: Run this before doing experimentation so there is something to compare the experiment results against.

- **Experiment Baseline**: Run this before running the experiment permutations so there is something to compare those against. If the system has not been changed since the project was started, you could opt just to make the Project Baseline the Experiment Baseline.

- **Final Experiment Baseline**: Run this after running the experiment permutations with the configuration that was the best. This will give you results for both "validation" and "test" sets with the best configuration. You can then make sure the best configuration is not overfit.

- **Final Project Baseline**: Run this after running all experiments in the project. This will give you a way to compare the start of the project with the end of the project (after merging all changes from the experiments).

## Best Permutation

Determining which permutation of the experiment is the best is not always easy to determine - with a lot of ground truth there is often almost no difference between the permutations. There were some tricks we used:

- **Look at Subsets**: Looking at all ground truth often shows very little difference, but when we look at subsets of the data, we can often see big differences. For instance, with 800 ground truths most of our experiment permutations were within 1% of each other, but when we looked at subsets like "multi-turn" examples, we might find 20-30% difference.

- **Prioritize Metrics**: We had about 20 metrics and between permutations some might be better and some might be worse. We prioritized the metrics and then looked at the best permutation based on the highest priority metrics.

- **Statistical Significance**: We did not use this, but one idea to improve the comparison further would be to determine when a metric change is significant and potentially even how significant it is.

## Summary / Review

It is important to have enough documentation about the experiment that it can be repeated. This also helps when reviewing the experiment with your team.

## Approve or Reject

An approval in this case generally refers to the code and configuration being merged into a main branch. A failed experiment that ends in rejection might still provide insights that can be used in future experiments.

## Evaluation System

From our experience, we had the following thoughts on our evaluation system:

- **Concurrency**: It was important for multiple engineers to be able to run experiments at the same time.

- **Resume**: This feature was helpful before we moved to global deployments for models which had much greater token limits.

- **Hyperparameterization**: This was missing from our system. It would have been helpful to have a way to run multiple permutations of the same experiment either in serial or parallel.

- **Retry**: This capability didn't solve the 429 issues we were having, but it was easy to implement.

- **Metric Subsets**: We only had a single evaluation script that ran all metrics. It would have been helpful to have a way to run subsets of metrics, for instance, only retrieval metrics or both retrieval + generation.

- **Local Execution**: We somewhat supported local executions, but it wasn't a fully realized scenario. It would have been helpful to have a way to run experiments locally to speed up the evaluation process.

- **Streaming**: While performance could be improved by running inference and evaluation at the same time by streaming the data from one process to another, this was not important for our engagement. Evaluations were generally about 30 minutes.

- **Transformation**: The ability to transform data formats on input and output was helpful only very early in the engagement until we standardized on a format for all files (ground truth, inference, and evaluation).

All these features are supported by the [Evaluator](./evaluator) project.

## Other Thoughts

- We had some experiments that were conducted in notebooks outside of the evaluation system using potentially different data, inference, metrics, evaluation, etc. Those were often not repeatable and therefore limited in how much knowledge we could gain from those.
