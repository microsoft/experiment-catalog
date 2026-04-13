# Actions

After processing a ground truth with inference result, or inference response against a set of evaluation metrics, actions provides a way for you to hook in and get the result back for your own processing. For example, you may want to do something custom action such as saving off the result somewhere else.

## AML Integration

The action manager will scan for your custom implementation in `experiment/code/actions` directory. You will need to implement the following.

1. Name your action
2. There are specific method that helps action manager determine what your class supports. In the code below, you return `True` if your class supports processing evaluation results. The `process_eval_results` takes in evaluation result, inference response, and job details.

```python
class MyAction(BaseAction):
    ...

    def is_process_eval_results(self) -> bool:
    ...

    def process_eval_results(
        self,
        eval_results: Dict[str, Any],
        inf_response: Dict[str, Any] = None,
        job_details: Dict[str, Any] = None,
    ) -> None:
    ...    
```

### job_details Dictionary

The `job_details` parameter contains metadata about the current evaluation job:

| Key | Description |
| ----- | ------------- |
| `ground_truth_ref` | The ID of the ground truth reference being evaluated |
| `iteration` | The iteration number extracted from the filename |
| `aml_job_id` | The Azure ML job ID (from `JOB_ID` environment variable) |
| `experiment_name` | The name of the experiment |
| `inference_base_path` | Base path for inference data (from `INFERENCE_BASE_PATH` environment variable) |
| `eval_base_path` | Base path for evaluation data (from `EVAL_BASE_PATH` environment variable) |
| `filename` | The name of the file being processed |

### Environment variables

You will also need to set `ENABLED_ACTIONS` with the name of your python script in the experiment directory to enable it.  

```txt
ENABLED_ACTIONS=myaction
```

If you need to configure environment variables for your code, you can use `EVAL_SET_` as a prefix for if you have evaluation hooks.

```txt
EVAL_SET_<MY_ENV>
```

## Documentation

In the `actions` directory, you should create a folder and add a README.md file that describes your implementation.

## Integration Tests

For development and testing, the repository includes an `integrationtests` action. When configured in the environment file, it runs for inference, evaluation, and summarization steps. You can review the logs to confirm the action manager is wired correctly:

```txt
DEBUG:actions.action_manager:Executing action: integrationtests
INFO:IntegrationTestsAction:============================================================
INFO:IntegrationTestsAction:  process_eval_results
INFO:IntegrationTestsAction:============================================================
INFO:IntegrationTestsAction:  eval_results:
```

This indicates the action manager is working as intended. This action is intended for test and validation scenarios rather than production workloads.

## Contribution

If you want to contribute an action, remove project-specific,
deployment-specific, or proprietary details so the result stays reusable.

Please add or update the relevant entry in [maintainers](../docs/MAINTAINERS.md#action)
so the documented repository areas stay accurate.

Thank you for your contributions!
