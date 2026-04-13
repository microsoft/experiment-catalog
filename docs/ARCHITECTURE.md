# Experiment Catalog Architecture

## Purpose

Experiment Catalog is a platform for managing A/B experiments and their results. It provides a REST API and MCP server for creating projects, defining experiments with metric definitions, recording results, and performing statistical analysis. A Svelte SPA provides the user interface. A separate evaluator service orchestrates evaluation workflows.

## Boundaries

| Boundary           | Input                   | Output                         | Owner                              |
| ------------------ | ----------------------- | ------------------------------ | ---------------------------------- |
| REST API Layer     | HTTP request            | JSON response / DTO            | `catalog/controllers/`             |
| MCP Tool Layer     | MCP tool invocation     | Tool result                    | `catalog/mcp/`                     |
| Domain Services    | DTO / validated request | Domain model / computed result | `catalog/services/`                |
| Storage Layer      | Domain model            | Azure Blob JSON records        | `catalog/services/*StorageService` |
| Configuration      | Environment variables   | Typed config object            | `catalog/config/`                  |
| UI Build           | Svelte components       | Static HTML/JS/CSS bundle      | `ui/src/`                          |
| Evaluator API      | HTTP request            | Evaluation result              | `evaluator/controllers/`           |
| Evaluation Scripts | Python CLI args         | Evaluation scores              | `evaluation/`                      |

## Data Shape Contracts

- Parse and validate external data at controller/MCP boundaries using model binding and custom validation attributes (`catalog/extensions/`).
- Convert to internal typed models (`catalog/models/`) before crossing module boundaries.
- Keep boundary transformation logic centralized and testable.
- Storage records use `StorageRecord` for serialization to Azure Blob storage.

## Module Ownership Rules

| Module                 | Responsibility                                 | Owner boundary   |
| ---------------------- | ---------------------------------------------- | ---------------- |
| `catalog/controllers/` | HTTP request handling, routing, authorization  | API boundary     |
| `catalog/mcp/`         | MCP tool definitions and validation            | MCP boundary     |
| `catalog/models/`      | Typed domain models and request/response DTOs  | Shared contracts |
| `catalog/services/`    | Business logic, storage operations, statistics | Domain core      |
| `catalog/config/`      | Configuration loading and validation           | Infrastructure   |
| `catalog/policies/`    | Policy evaluation (e.g., percent improvement)  | Domain logic     |
| `catalog/extensions/`  | Validation attributes and helper extensions    | Cross-cutting    |
| `catalog.tests/`       | Unit tests for catalog                         | Test boundary    |
| `evaluator/`           | Evaluation orchestration service               | Separate service |
| `evaluation/`          | Python evaluation scripts                      | External tooling |
| `ui/`                  | Svelte SPA frontend                            | Client boundary  |

## Execution Flow

1. Entry: HTTP request arrives at Kestrel (catalog/Program.cs) or MCP tool invocation.
2. Boundary parse/validate: Controllers validate via model binding + custom attributes; MCP tools use `McpValidationHelper`.
3. Core execution: Services perform business logic (experiment management, statistics calculation, analysis).
4. Persistence/output: `AzureBlobStorageService` reads/writes JSON blobs; results returned as JSON responses.
5. Event/log emission: OpenTelemetry traces exported to Azure Monitor; structured logging via `ILogger`.

## Refactor Checklist

- [ ] Boundary contracts unchanged or versioned.
- [ ] Ownership map still accurate.
- [ ] Integration tests cover boundary paths.
- [ ] Documentation updated in same change.
