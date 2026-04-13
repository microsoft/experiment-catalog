---
title: Inference
description: Guidance for configuring and extending the published inference implementations in the AML Evaluation Runner prep repository.
ms.date: 2026-04-13
ms.topic: how-to
---

## Overview

Inference is executed before evaluation as part of the experiment pipeline. In AML configuration, you will need to configure the path of where inference is located.

```txt
AML_INF_MODULE_DIR=../inference/foundryv2agent
```

You will also need to provide the path to the environment variables used by inference.

```txt
AML_INF_ENV_PATH=../inference/foundryv2agent/.env
```

Additional inference configuration options:

```txt
AML_INFERENCE_CONCURRENCY=30  # Number of concurrent inference requests
AML_INF_TIMEOUT_SECONDS=600   # Timeout for inference operations
```

## Integration

The runner will look for a file named `inference.py` and locate the `InferenceService` class. This class must implement a `process_inference_request` method that takes a ground truth dictionary as input and returns the inference result.

```python
class InferenceService:
    def process_inference_request(self, ground_truth_source: dict) -> dict:
```

The `ground_truth_source` input contains the ground truth data loaded from the input datastore. The method should return a result dictionary that the evaluation stage, or another downstream consumer in your workflow, can process.

### Dependencies

For any required Python dependencies, update the AML environment definition used to build your job image in the orchestration environment that consumes this repo. This prep tree does not include the former `experiment/` directory that previously hosted those files.

## Remote Inference Service

As an alternative to local inference, you can configure a remote inference service by setting the following environment variables:

```txt
INF_INFERENCE_SERVICE_URL=<your-inference-service-url>
INF_INFERENCE_SERVICE_TUNNEL_TOKEN=<your-tunnel-token>
```

When configured, the experiment runner will use the remote service instead of the local `InferenceService` class.

## Reference Implementation

The `foundryv2agent` folder contains a reference implementation that uses Azure AI Foundry agents. See [foundryv2agent/README.md](foundryv2agent/README.md) for details on that specific implementation.

### Contributions

If you want to contribute an inference implementation, remove
project-specific, deployment-specific, or proprietary details so the result
stays reusable.

Please add or update the relevant entry in [maintainers](../docs/MAINTAINERS.md#inference)
so the documented repository areas stay accurate.

Thank you for your contributions!
