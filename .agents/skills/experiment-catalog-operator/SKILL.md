---
name: experiment-catalog-operator
description: Operate and analyze Experiment Catalog instances from any repository that depends on the catalog. Use when creating projects, experiments, baselines, sets/permutations, metric definitions, tags, or result uploads; comparing experiment results; finding regressions or improvements; analyzing per-ref/ground-truth behavior; calculating statistics; identifying meaningful tags; or explaining catalog data.
license: MIT
compatibility: Requires a reachable Experiment Catalog API and/or experiment-catalog MCP tools.
metadata:
  spec_version: "1.0"
  version: "1.0.0"
  catalog_skill_version: "1.0.0"
  catalog_project: "microsoft/experiment-catalog"
---

# Experiment Catalog Operator

Use this skill to operate a running Experiment Catalog and analyze its content. Prefer MCP tools when available; use REST when MCP is unavailable or the task is bulk ingestion.

## What To Load

- Use `references/operations.md` for project, experiment, baseline, metric, tag, and result workflows.
- Use `references/analysis.md` for comparison, per-ref diagnosis, p-values, meaningful tags, and final summaries.
- Use `references/api-and-mcp.md` for exact MCP tool names, REST endpoints, request shapes, and response fields.
- Use `references/downstream-integration.md` when adapting another repo to publish results into the catalog.

## Inputs To Discover

- Catalog access: MCP tool namespace or API base URL, usually `http://localhost:6010/api`.
- Auth mode: anonymous, bearer token, cookie/header token, or reverse-proxy auth.
- Target names: `project`, `experiment`, `set`/permutation, metric names, tag names.
- User intent: operate data, ingest results, compare sets, investigate refs, or write an experiment summary.

Do not invent project, experiment, baseline, auth, or storage settings. Ask when they materially affect writes.

## Vocabulary

| Term       | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| Project    | Fixed evaluation environment, often a sprint or milestone.            |
| Experiment | Hypothesis-driven test inside a project.                              |
| Set        | One evaluation run/permutation/configuration variant.                 |
| Result     | Metrics for one ref iteration.                                        |
| Ref        | Ground-truth identifier used for aggregation and per-item comparison. |
| Baseline   | Reference measurement for project or experiment comparison.           |

Translate "ground truth" to `ref` in catalog operations.

## Default Workflow

1. Identify the target catalog and access method.
2. Inspect existing project/experiment state only as needed.
3. For writes, create or verify the project, experiment, baseline, metric definitions, and tags before result upload.
4. For comparison, call aggregate comparison first; only drill into refs or raw set results when the question requires it.
5. For summaries, report high-priority metric deltas, p-values/confidence when present, important regressions, meaningful tags, and decision guidance.

## Tool Selection Rules

- Use `CompareExperiment` for normal "which set/permutation is better?" questions. Do not call `ListSetsForExperiment` just to validate a set first.
- Use `CompareByRef` only for individual ground-truth/ref improvement or regression questions.
- Use `GetNamedSet` only when raw iteration-level details are needed.
- Use `MeaningfulTags` when the user asks which subsets explain a metric change.
- Use `CalculateStatistics` before claiming statistical significance if p-values are missing.
- Use REST `POST /results` for bulk or scripted ingestion because MCP does not expose result upload in the current catalog tools.

## Analysis Rules

- Prioritize metrics marked `is_important`.
- Respect metric direction. Tags such as `lower-is-better` mean a lower value is an improvement.
- Prefer `normalized` values when comparing metrics with `min`/`max`; otherwise compare `value`.
- Treat missing metrics as evidence to investigate, not as zero.
- Report sample size (`count`, result counts) next to conclusions.
- Separate overall aggregate findings from subset/tag/ref findings.
- Do not call a change statistically significant unless `p_value` supports it or statistics have been calculated.

## Safety Rules

- Writes are persistent. Confirm destructive or broad writes, large uploads, and baseline changes unless explicitly requested.
- Never expose storage connection strings, bearer tokens, or OIDC secrets.
- Keep result uploads idempotent from the caller's perspective: stable project, experiment, set, ref, metrics, and source URIs.
- If optimization returns conflict or ingestion fails during maintenance, surface the conflict and retry only when the user asks or the caller has retry policy.

## Versioning

This skill uses `metadata.catalog_skill_version` with SemVer.

- `MAJOR`: breaking workflow, API, or response-interpretation changes.
- `MINOR`: new catalog feature coverage or new analysis workflows.
- `PATCH`: corrections, clarifications, or endpoint/tool updates.
