# Experiment Catalog CLI and Python API

The `experiment-catalog` command and the `experiment_catalog.Catalog` class
share the same implementation. They support creating projects, creating
experiments, and pushing metric rows from CSV files or notebook data.

## Requirements and installation

- Python 3.10 or later
- A reachable Experiment Catalog API URL, including `/api`

From the repository root:

```bash
python3 -m venv cli/.venv
cli/.venv/bin/python -m pip install -e ./cli
source cli/.venv/bin/activate
```

`make setup` performs the same editable installation. Set the API URL:

```bash
export EXPERIMENT_CATALOG_BASE_URL=http://localhost:6010/api
```

If bearer authentication is enabled, set `EXPERIMENT_CATALOG_TOKEN`. The
equivalent command forms are:

```bash
experiment-catalog --help
python -m experiment_catalog --help
```

Global options must appear before the command:

```text
experiment-catalog [--base-url URL] [--token TOKEN] [--timeout SECONDS] COMMAND
```

## Create a project

```bash
experiment-catalog create-project sprint-42
```

The command is idempotent and prints whether it created the project:

```json
{
  "project": "sprint-42",
  "created": true
}
```

## Create an experiment

Create the project first, then run:

```bash
experiment-catalog create-experiment \
  --project sprint-42 \
  notebook-test \
  --hypothesis "The candidate prompt improves answer correctness."
```

The command is idempotent when the existing hypothesis matches. It fails when
an experiment with the same name has a different hypothesis.

## Push metrics from CSV

The project and experiment must already exist. Pass their names and the set
name as command parameters:

```bash
experiment-catalog push results.csv \
  --project sprint-42 \
  --experiment notebook-test \
  --set candidate-a
```

Use `--dry-run` to validate the CSV and verify that the experiment exists
without writing results:

```bash
experiment-catalog push results.csv \
  --project sprint-42 \
  --experiment notebook-test \
  --set candidate-a \
  --dry-run
```

The command prints a report:

```json
{
  "project": "sprint-42",
  "experiment": "notebook-test",
  "set": "candidate-a",
  "result_count": 2,
  "dry_run": false
}
```

### CSV format

The first row contains column names:

```csv
ref,inference_uri,generation_correctness,meta_inference_time
question-001,outputs/question-001.json,0.9,1275
question-002,outputs/question-002.json,0.8,1140
```

The runnable example is
[`examples/notebook-results.csv`](examples/notebook-results.csv).

The columns are:

| Column | Required | Meaning |
| --- | --- | --- |
| `ref` | yes | Ground-truth or evaluated-item identifier. |
| `ground_truth_uri` | no | URI for the ground-truth artifact. |
| `inference_uri` | no | URI for the inference artifact. |
| `evaluation_uri` | no | URI for the evaluation artifact. |
| Any other column | at least one | Metric name; the cell contains its value. |

`project`, `experiment`, `set`, and `metrics` are not CSV columns because the
target names are command parameters and metric columns are inferred from the
header.

Rules:

- Each row must have a valid `ref` and at least one non-empty metric value.
- Empty metric cells are omitted from that result.
- Metric values may be finite numbers or catalog classification labels:
  `t+`, `t-`, `f+`, or `f-`.
- Classification labels are accepted by the catalog only for metric names
  containing `accuracy`, `precision`, `recall`, or `f1`.
- Structured retrieval values are not supported by the CSV format; use the
  Python API or REST API when a metric requires `found` and `expected` arrays.
- Names may contain letters, digits, `_`, `-`, `.`, or `:` and are limited to
  100 characters.
- Metric definitions are not required. Existing project definitions are used
  automatically when present, and otherwise the catalog infers default
  aggregation behavior from metric names and values.

## Python and notebook API

Use the same `Catalog` class directly from a notebook:

```python
from experiment_catalog import Catalog

catalog = Catalog("http://localhost:6010/api")

catalog.create_project("sprint-42")
catalog.create_experiment(
    "sprint-42",
    "notebook-test",
    "The candidate prompt improves answer correctness.",
)

report = catalog.push_metrics(
    project="sprint-42",
    experiment="notebook-test",
    set_name="candidate-a",
    results=[
        {
            "ref": "question-001",
            "inference_uri": "outputs/question-001.json",
            "metrics": {
                "generation_correctness": 0.9,
                "meta_inference_time": 1275,
            },
        },
        {
            "ref": "question-002",
            "metrics": {
                "generation_correctness": 0.8,
                "meta_inference_time": 1140,
            },
        },
    ],
)

print(report.to_dict())
```

To push a CSV from Python:

```python
report = catalog.push_csv(
    "results.csv",
    project="sprint-42",
    experiment="notebook-test",
    set_name="candidate-a",
    dry_run=False,
)
```

`create_project` and `create_experiment` return `True` when they create an
object and `False` when it already exists. `push_metrics` and `push_csv` return
a `PushReport`.

## Failure behavior

The CLI validates the complete CSV before sending results. Result writes are
then appended one row at a time and are not transactional. If a later request
fails, earlier rows remain in the catalog; retry only rows known not to have
been accepted.

CLI exit codes are:

- `0`: success, including an idempotent create command;
- `1`: catalog API or network error;
- `2`: command-line usage or validation error.

