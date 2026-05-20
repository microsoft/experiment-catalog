# AGENTS.md

## Project Overview

- Project: `experiment-catalog`
- Primary runtime(s): .NET 10 (C#), Node/Svelte (TypeScript), Python
- Main entrypoint(s): `catalog/Program.cs` (API), `evaluator/Program.cs` (evaluator), `ui/` (Svelte SPA)
- Solution file: `experiment-catalog.sln`

## Harness Commands

Run from repository root:

| Goal                    | Command         |
| ----------------------- | --------------- |
| Dev environment setup   | `make setup`    |
| Fast sanity check       | `make smoke`    |
| Static checks           | `make check`    |
| Full test suite         | `make test`     |
| Security scanning       | `make security` |
| CI-equivalent local run | `make ci`       |

## Constraints And Guardrails

- Prefer deterministic scripts over interactive/manual steps.
- Keep command names stable (`smoke`, `check`, `test`, `ci`).
- Update docs and scripts in the same change when workflow behavior changes.
- Avoid side effects outside the repo unless explicitly required.
- The .NET solution requires `dotnet` SDK 10.0+.
- The UI requires Node.js 20+ and npm.
- Do not commit `.env` files; use `.env.example` patterns for configuration.

## Project Structure

| Path                 | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `catalog/`           | ASP.NET Core API service (exp-catalog) with MCP server, REST controllers, and Azure Blob storage |
| `catalog.tests/`     | xUnit test project for catalog                                                                   |
| `evaluator/`         | ASP.NET Core evaluator service                                                                   |
| `evaluation/`        | Python-based evaluation scripts                                                                  |
| `ui/`                | Svelte 5 SPA with Vite                                                                           |
| `catalog.Dockerfile` | Container image for catalog + UI                                                                 |

## Architecture Boundaries

- Parse and validate external data at boundaries (controllers, MCP tools).
- Keep internal data models typed and normalized (see `catalog/models/`).
- Keep each module focused on one responsibility.
- Document boundary ownership in `docs/ARCHITECTURE.md`.

## Observability Expectations

- OpenTelemetry is already instrumented in catalog and evaluator via Azure Monitor exporter.
- Include `trace_id` and `run_id` in long-running workflow logs.
- Emit structured event names for major transitions (start, step, success, failure).
- Keep event fields stable for querying and alerting.
- Maintain field definitions in `docs/OBSERVABILITY.md`.

## Execution Plans

- For tasks expected to exceed ~30 minutes, create/update `PLANS.md` before coding.
- Track scope, constraints, milestones, and verification steps.
- Update status checkpoints during execution and after major decisions.

## Static Analysis And Quality Gates

- Run `make check` before `make test`.
- Run `make ci` before pushing large refactors.
- Treat lint/type failures as blocking.

## Entropy Management

- Remove stale scripts/docs quickly.
- Keep templates and real workflows in sync.
- Run periodic harness audits:
  - `scripts/audit_harness.sh .`
