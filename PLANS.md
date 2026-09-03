# PLANS.md

Use this file for multi-step work where durable context matters.

## Objective

- Outcome: Allow trusted deployment-time Python files to add derived numeric
  metrics whenever comparison responses are rendered.
- Why it matters: Teams can calculate set- and ref-scoped metrics derived from
  multiple raw metrics without changing catalog source code or persisted
  results.
- Non-goals: Persisting derived metrics, accepting function uploads through the
  API, cross-request caching, derived-on-derived dependencies, or including
  derived metrics in statistical calculations.

## Constraints

- Runtime/tooling constraints: .NET 10 invokes Python 3 as one subprocess per
  comparison request. Functions are loaded from a configured local folder and
  expose `aggregate(results)`.
- Security/compliance constraints: Functions are trusted administrator-provided
  code. The API does not upload or edit function files. Arguments use
  `ProcessStartInfo.ArgumentList`; no shell is involved.
- Performance/reliability constraints: All scopes are sent in one batch. No
  cache is added initially. A configurable timeout terminates the entire
  subprocess tree to recover from infinite loops.

## Context Snapshot

- Relevant files/modules: `catalog/models/Experiment.cs`,
  `catalog/services/ExperimentService.cs`, `catalog/config/`,
  `catalog.Dockerfile`, and `catalog.tests/`.
- Existing commands/workflows: `make check`, `make test`, and the comparison
  REST/MCP endpoints.
- Known risks: Arbitrary Python execution, subprocess output deadlocks,
  malformed function output, metric-name collisions, partial comparison
  failures, and Python availability in the runtime image.

## Execution Plan

1. Define configuration and the Python contract.
   - Expected output: Function folder, executable, and timeout settings plus a
     runner that discovers one metric per `.py` filename.
   - Verification: Python runner tests cover success, invalid functions,
     collisions, and failures.
2. Implement the derived metric subprocess service.
   - Expected output: Batched JSON input/output, hard timeout, process-tree
     termination, numeric validation, and structured logging.
   - Verification: Unit tests cover disabled configuration, success, timeout,
     and malformed output.
3. Integrate comparison scopes and document deployment.
   - Expected output: Main comparison and comparison-by-ref responses include
     derived metrics calculated from the currently filtered raw results.
   - Verification: Integration-focused tests, `make check`, and `make test`.

## Checkpoints

- [x] Baseline captured
- [x] Implementation complete
- [x] Static checks passed
- [x] Tests passed
- [x] Docs updated

## Decision Log

- Date: September 2, 2026
  - Decision: Use one fresh, batched Python subprocess per comparison request
    with no cross-request cache.
  - Reason: This provides deterministic reload behavior and reliable hard
    cancellation while keeping the first implementation simple.
  - Alternatives considered: Precomputing at upload time, an embedded Python
    runtime, a persistent worker pool, and ETag/function-hash caching.

## Final Verification

- Commands run: `make check`, `make test`, `make smoke`, targeted aggregate
  service and meaningful-tag tests, Python runner tests, `dotnet publish`, and
  a runtime-image build using the pinned ASP.NET base image.
- Key outputs: Static checks passed; 104 .NET tests passed; CLI, runner, and UI
  tests passed; smoke checks passed; the published output contains
  `aggregate-runtime/aggregate_runner.py`; and the runtime image installs Python 3 and
  compiles the runner successfully.
- Follow-up tasks: Measure runtime overhead before considering a persistent
  worker or cache. Re-run the complete `catalog.Dockerfile` build when Docker
  registry connectivity is available; verification reached the UI dependency
  install but the registry repeatedly reset the connection.
