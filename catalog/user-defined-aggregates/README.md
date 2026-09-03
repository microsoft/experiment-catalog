# User-Defined Aggregates

Place trusted Python aggregate functions in this folder for local development.
Point the catalog at it before starting the API:

```bash
export CUSTOM_AGGREGATE_FUNCTIONS_PATH="$PWD/catalog/user-defined-aggregates"
```

Each public `*.py` filename becomes a metric name and must define:

```python
def aggregate(results):
    return 0.0
```

Return a finite number, or `None` when the metric cannot be calculated. Files
beginning with `_` are available as helper modules but do not create metrics.

These files execute as trusted arbitrary Python code. Production deployments
should mount an administrator-controlled folder read-only rather than relying
on the repository example.
