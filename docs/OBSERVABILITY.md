---
title: Experiment Catalog Observability
description: Observability standards and service level objectives for diagnosing and operating experiment-catalog workflows.
ms.date: 2026-09-02
ms.topic: reference
---

## Experiment Catalog Observability

## Goal

Make agent and harness workflows diagnosable without reproducing locally.

## Service level objectives

The service level objectives (SLOs) below define operational targets for availability, latency, and release reliability.

| SLO               | Target                                                 | Measurement window | Source                                     |
| ----------------- | ------------------------------------------------------ | ------------------ | ------------------------------------------ |
| API availability  | >= 99.5% successful requests                           | 30 days            | HTTP telemetry from OpenTelemetry exporter |
| Read latency      | p95 <= 800 ms for read endpoints                       | 30 days            | Request duration metrics by route          |
| Write latency     | p95 <= 1200 ms for write endpoints                     | 30 days            | Request duration metrics by route          |
| CI reliability    | >= 95% pass rate on default branch runs                | 30 days            | GitHub Actions workflow runs               |
| Security response | Triage reported vulnerabilities within 5 business days | Rolling            | Security issue tracking process            |

## Error budget policy

Availability error budget is 0.5% failed requests over a 30-day window.

- When error budget consumption exceeds 50%, prioritize reliability fixes over new feature work.
- When error budget is exhausted, pause feature merges to main until reliability is restored.
- Recovery actions and follow-up work must be documented in issue and pull request threads.

## Current Instrumentation

The catalog service uses OpenTelemetry with the Azure Monitor exporter:

- `OpenTelemetry.Instrumentation.AspNetCore` for automatic HTTP tracing.
- `OpenTelemetry.Instrumentation.Http` for outbound HTTP call tracing.
- `Azure.Monitor.OpenTelemetry.Exporter` for export to Application Insights.
- Configuration via `OPEN_TELEMETRY_CONNECTION_STRING` environment variable.

## Request-scoped custom aggregate coverage

When `CUSTOM_AGGREGATE_FUNCTIONS_PATH` is configured, runtime custom aggregate
execution can occur on these request paths:

- `GET /api/projects/{project}/experiments/{experiment}/compare`
- `GET /api/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref`
- `POST /api/analysis/meaningful-tags`

These requests are covered by the standard ASP.NET Core OpenTelemetry request
traces. The Python subprocess currently contributes timing through structured
application logs rather than a separate custom span or metric stream.

## Preferred Event Fields for New Workflow Logs

The runtime custom aggregate implementation documented below does not yet emit
the full preferred field set on each log record.

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

## Current Structured Logs

Runtime custom aggregate execution currently emits these structured `ILogger`
message templates:

- `custom aggregate execution completed for {GroupCount} groups in {DurationMs} ms.`
- `custom aggregate execution timed out after {TimeoutSeconds} seconds.`
- `Failed to get baseline experiment for project {projectName}.` on compare and
  compare-by-ref requests when the project baseline cannot be loaded

Current properties for this feature are therefore request-correlated fields such
as `GroupCount`, `DurationMs`, `TimeoutSeconds`, and `projectName`, alongside
the standard ASP.NET Core request/trace metadata.

Any `stdout` emitted by aggregate imports or `aggregate(results)` functions is
redirected to the Python process `stderr` so it does not corrupt the JSON
protocol. Successful requests do not persist that output as structured logs; on
failure, stderr is surfaced through the HTTP error path instead.

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

## Review cadence

- Review SLO dashboards weekly.
- Review alert quality monthly to reduce noisy or low-value alerts.
- Update SLO targets when architecture or traffic profile changes significantly.
