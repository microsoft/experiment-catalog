# Experimentation Ideas

To get the full benefit of how you can leverage AML Evaluation runner, you can run the following experiments to get an idea of the inner workings. Consider what evaluation metrics is key to your experiment and you need to change in order to get the experiment to work. You should also create a baseline that you can use so you can track improvements.

I encourage you to run the experiments using the [Custom agent](../demo-experiments/README.md).

## Retrieval Experiments

We can experiment with improving the scores by considering the following:

1. The default is `text-embedding-3-large`. Try with `text-embedding-3-small` or `embed-v-4-0`.
2. Change default chunk size (smaller or larger).
3. Change the chunking strategy from chunking by size to something else.

## Generation Experiments

We can experiment with improving the scores by considering the following:

1. The default model is `GPT 4.1`. Try with `GPT 5` models such as `mini` ones.
