# Experiment Catalog Observability

## Goal

Make agent and harness workflows diagnosable without reproducing locally.

## Current Instrumentation

The catalog and evaluator services already use OpenTelemetry with Azure Monitor exporter:

- `OpenTelemetry.Instrumentation.AspNetCore` for automatic HTTP tracing.
- `OpenTelemetry.Instrumentation.Http` for outbound HTTP call tracing.
- `Azure.Monitor.OpenTelemetry.Exporter` for export to Application Insights.
- Configuration via `OPEN_TELEMETRY_CONNECTION_STRING` environment variable.

## Required Event Fields

- `timestamp`
- `level`
- `event_name`
- `trace_id`
- `run_id`
- `step_id`
- `component`
- `status`
- `duration_ms`

## Event Taxonomy

### Harness Events

- `harness.start`
- `harness.step.start`
- `harness.step.finish`
- `harness.step.fail`
- `harness.check.pass`
- `harness.check.fail`

### Application Events

- `experiment.created`
- `experiment.updated`
- `result.added`
- `statistics.calculated`
- `analysis.started`
- `analysis.completed`
- `evaluation.started`
- `evaluation.completed`

## Logging Rules

- Emit structured logs for machine parsing.
- Keep field names stable over time.
- Include enough context to replay failures.
- Redact secrets and personally identifiable values.
- Use `ILogger<T>` throughout the .NET codebase.

## Metrics

- Smoke-check duration
- Check failure rate (lint/type/test)
- Retry count per run
- Time-to-first-actionable-error
- API request latency (via OpenTelemetry ASP.NET Core instrumentation)
- Blob storage operation duration

## Alerting

- Alert on repeated harness failures in CI.
- Alert on missing observability fields in critical events.
- Alert on regression in smoke-check runtime budget.
