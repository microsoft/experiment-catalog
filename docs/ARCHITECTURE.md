# Experiment Catalog Architecture

## Purpose

Experiment Catalog is a platform for managing A/B experiments and their
results. It provides a REST API and MCP server for management and analysis, a
Python CLI and notebook API for validated publishing, and a Svelte SPA for
comparison. Evaluation runners remain external integrations that publish their
results through the catalog API or Python client.

## Boundaries

| Boundary           | Input                   | Output                         | Owner                              |
| ------------------ | ----------------------- | ------------------------------ | ---------------------------------- |
| REST API Layer     | HTTP request            | JSON response / DTO            | `catalog/controllers/`             |
| MCP Tool Layer     | MCP tool invocation     | Tool result                    | `catalog/mcp/`                     |
| Domain Services    | DTO / validated request | Domain model / computed result | `catalog/services/`                |
| Runtime Custom Aggregates | Filtered comparison groups | Non-persisted aggregate metrics | `catalog/services/DerivedMetricService.cs` + `catalog/aggregate-runtime/aggregate_runner.py` |
| Storage Layer      | Domain model            | Azure Blob JSON records        | `catalog/services/*StorageService` |
| Configuration      | Environment variables   | Typed config object            | `catalog/config/`                  |
| CLI / Notebook API | CSV or Python result rows | API requests / push report    | `cli/src/experiment_catalog/`      |
| UI Build           | Svelte components       | Static HTML/JS/CSS bundle      | `ui/src/`                          |

## Data Shape Contracts

- Parse and validate external data at controller/MCP boundaries using model binding and custom validation attributes (`catalog/extensions/`).
- Convert to internal typed models (`catalog/models/`) before crossing module boundaries.
- Keep boundary transformation logic centralized and testable.
- Storage records use `StorageRecord` for serialization to Azure Blob storage.
- `MetricDefinition` includes optional presentation metadata such as
  `description`. This metadata travels with `metric_definitions` for UI
  rendering, but it is not required for result submission and does not
  participate in aggregation or storage of per-result metric values.
- `cli/src/experiment_catalog/models.py` defines and validates the CSV and
  in-memory result contracts before API writes begin; catalog-side result rules
  can still reject individual rows.
- `ExperimentService.CompareAsync`,
  `ExperimentService.CompareByRefAsync`, and
  `AnalysisService.GetMeaningfulTagsAsync` apply include/exclude filters before
  building runtime custom aggregate groups.
- Aggregate comparison metric DTOs can include response-only metadata fields
  such as `unique_refs`, `wins`, and `ties`.
- `DerivedMetricService` serializes each raw result row for Python as
  `{ref?, set?, ground_truth_uri?, inference_uri?, evaluation_uri?, metrics}`.
  Metric values remain numeric, classification strings, or retrieval objects
  shaped as `{found, expected}`.
- Runtime custom aggregate functions receive only stored/raw metrics for their
  group. Their outputs are appended to the response only, are not persisted,
  and are not fed back into later aggregate functions.
- `unique_refs` counts distinct non-null refs represented by an aggregate
  metric. Built-in metrics apply aggregate-function-specific value eligibility;
  runtime custom metrics count refs supplied to the Python function because its
  internal row usage is opaque to the catalog.
- `wins` and `ties` are computed only after the main comparison aggregates are
  built. They pair per-ref candidate and experiment-baseline aggregates by
  shared ref, require numeric values on both sides, respect the
  `lower-is-better` metric-definition tag, and treat equality as exact in v1.

## Module Ownership Rules

| Module                 | Responsibility                                 | Owner boundary   |
| ---------------------- | ---------------------------------------------- | ---------------- |
| `catalog/controllers/` | HTTP request handling, routing, authorization  | API boundary     |
| `catalog/mcp/`         | MCP tool definitions and validation            | MCP boundary     |
| `catalog/models/`      | Typed domain models and request/response DTOs  | Shared contracts |
| `catalog/services/`    | Business logic, storage operations, statistics | Domain core      |
| `catalog/config/`      | Configuration loading and validation           | Infrastructure   |
| `catalog/aggregate-runtime/` | Internal runtime aggregate protocol      | Python boundary  |
| `catalog/user-defined-aggregates/` | Administrator-provided aggregate functions | Deployment boundary |
| `catalog/policies/`    | Policy evaluation (e.g., percent improvement)  | Domain logic     |
| `catalog/extensions/`  | Validation attributes and helper extensions    | Cross-cutting    |
| `catalog.tests/`       | Unit tests for catalog                         | Test boundary    |
| `cli/`                 | CLI, notebook API, CSV parsing and validation  | Client boundary  |
| `ui/`                  | Svelte SPA frontend                            | Client boundary  |

## Execution Flow

1. Entry: HTTP request arrives at Kestrel (`catalog/Program.cs`), an MCP tool is
   invoked, or a caller uses the CLI/Python `Catalog` client.
2. Boundary parse/validate: Controllers validate through model binding and
   custom attributes, MCP tools use `McpValidationHelper`, and the Python client
   validates complete CSV or in-memory result sets before contacting the API.
3. Client orchestration: A push verifies the target experiment and appends each
   result. These calls are sequential and are not one atomic server
   transaction.
4. Core execution: Services perform business logic (experiment management,
   statistics calculation, and analysis). Runtime custom aggregate execution is
   request-scoped for
   `GET /api/projects/{project}/experiments/{experiment}/compare`,
   `GET /api/projects/{project}/experiments/{experiment}/sets/{set}/compare-by-ref`,
   and `POST /api/analysis/meaningful-tags`.
5. Request-scoped Python execution: After filtering, `ExperimentService` or
   `AnalysisService` batches all aggregate groups for the request and invokes
   one fresh Python subprocess through `DerivedMetricService`.
   `catalog/aggregate-runtime/aggregate_runner.py` loads every non-underscore file from
   `CUSTOM_AGGREGATE_FUNCTIONS_PATH`, exposes the folder on `sys.path` so helper
   modules can be imported, and enforces the shared hard timeout for the full
   request.
6. Comparison annotation: For the main experiment comparison flow,
   `ComparisonMetricCalculator` compares per-ref candidate aggregates against
   the experiment baseline and annotates aggregate metric DTOs with response-only
   `wins` and `ties` counts. The experiment baseline itself remains the
   comparison target and does not receive those counts.
7. Persistence/output: `AzureBlobStorageService` reads/writes JSON blobs;
   results or push reports are returned to the caller. Runtime custom aggregate
   values and aggregate comparison metadata are merged into response DTOs only
   and do not modify stored results or statistics jobs.
8. Event/log emission: OpenTelemetry traces are exported to Azure Monitor;
   structured logging uses `ILogger`.

## Refactor Checklist

- [ ] Boundary contracts unchanged or versioned.
- [ ] Ownership map still accurate.
- [ ] Integration tests cover boundary paths.
- [ ] Documentation updated in same change.
