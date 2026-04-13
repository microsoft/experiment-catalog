# MLFlow Log

The MLflow Log action provides custom logging capabilities during the summarization phase of evaluation jobs. It can log metrics, parameters, and artifacts to MLflow at two points:

- During processing of individual eval results
- After final summarization is complete

## Usage

### Enabling the Action

Add `mlflowlog` to the `ENABLED_ACTIONS` environment variable:

```bash
export ENABLED_ACTIONS="mlflowlog"
```

**Use Cases:**

- Log per-file metrics for detailed analysis
- Track processing of individual results
- Incremental metric aggregation

## Implementation

The action is located at:

```text
experiment/code/actions/mlflowlog.py
```

## Dependencies

- `mlflow` package (automatically available in AML environment)
- Runs within the AML MLflow tracking context

## Notes

- The action gracefully handles missing MLflow installation
- Logging only occurs when `ENABLED_ACTIONS` includes `mlflowlog`
- All logs are associated with the active MLflow run
- Errors in logging are caught and logged but don't fail the job
