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

## Comparison target override (September 30, 2026)

- Outcome: Select any project/experiment/set as a view-only comparison target
  from a modal. Persist the choice in URL config and carry it into aggregate,
  per-ref, and chart views without changing project or experiment baselines.
- Constraints: Default requests retain current behavior. Cross-project results
  use the current project's metric definitions; do not apply current-project
  tags to the imported target. No stored statistics are shown for overrides.
  Show a cross-project warning in the selection modal and identify the selected
  target throughout without repeating the warning on comparison pages.
- Milestones:
  1. Add validated optional target to comparison endpoints and use it for
     aggregate/per-ref comparisons and wins without attaching stored statistics.
  2. Add modal selection/reset, URL config encoding, and wire target throughout
     experiment, set, and chart navigation.
  3. Cover same-/cross-project selection, reset, filtered data, stats exclusion,
     invalid targets, and regression behavior with tests; update user docs.
- Verification: Run `make check` before `make test`, plus targeted browser tests.
- Status: [x] scoped; [x] implementation; [x] checks; [x] tests; [x] docs.
- Verification: `make check` passed; `CI=1 make test` passed the .NET,
  Python, 70 UI unit, and 171 browser tests. Focused override tests passed
  in .NET (6 cases) and browser (9 cases) runs. Visual baselines were
  regenerated in the pinned Playwright Docker image.
- UI refinement: The target replaces the experiment-baseline column, per-ref
  row, and chart group; its header swaps Select for Reset. After this change,
  `make check`, 24 focused UI unit tests, 45 comparison/set/chart browser tests,
  and five comparison visual snapshots passed.
- Navigation refinement: Keep the override in URL config across project and
  experiment navigation until Reset is clicked. Highlight the active target
  header in gold and keep Reset available if an invalid target fails to load.
- Identity refinement: The Comparison Target header always names its source
  experiment, even when it is the current experiment, and names the project
  when it differs from the current project.

## Project and experiment card labels

- Outcome: Optional curated emoji and up-to-40-character note on each
  project and experiment card, editable without rewriting experiment JSONL records.
- Decision: Store display fields as ASCII-safe metadata on project containers
  and experiment append blobs. Preserve baseline and other metadata on edits;
  handle concurrent edits explicitly. Emoji values are curated IDs; notes are
  UTF-8/base64 encoded in metadata.
- Caveat: Metadata edits change the blob ETag, so a cached experiment may be
  downloaded again on its next full read. This tradeoff follows the selected
  storage choice; do not hide metadata conflicts or invalid input.
- Milestones: [x] storage model/API; [x] card editing and rendering;
  [x] tests, documentation, and verification.
- Verification: `make check` and `CI=1 make test` passed, including 130
  catalog tests and 179 Playwright tests. Metadata round-trip, preservation,
  clearing, and validation are covered by catalog tests; browser tests cover
  editing, saving, clearing, error handling, and card layout.
- Refinement: Replace the separate edit dialog with inline emoji selection and
  note editing in each card's footer. A subtle placeholder marks the empty
  emoji; note edits save on Enter or blur and cancel on Escape. The picker has
  sixteen options.
- Project display fields are stored on container metadata; project baseline
  updates preserve those fields. Project cards now use a single edit dialog
  alongside the inline emoji picker (see below).
  Container metadata does not support If-Match, so project metadata writes
  serialize within an API instance rather than using blob-style ETag retries.
- Runtime verification: An isolated API using local Azurite saved and cleared
  Unicode project labels, returned them in the project list, and retained the
  project baseline and type metadata after a baseline change.

## Permanent set hiding

- Outcome: Confirmed hide action on the set page appends an `X` tombstone to the
  experiment JSONL. Existing results and known direct set links remain readable,
  but the hidden set disappears from set lists, comparisons, charts, and
  automatic statistics.
- Guardrails: Reject missing sets and active experiment/project baselines;
  reject promoting a hidden set to an experiment baseline. Repeated hide
  requests do not append duplicate markers. Keep the marker when optimizing
  the experiment and when new results arrive for that set.
- Milestones: [x] record and storage behavior; [x] set-page action;
  [x] tests, documentation, and verification.
- Verification: `make check` and `CI=1 make test` passed (133 catalog
  tests and 183 browser tests). An isolated API/Azurite smoke test verified
  baseline and missing-set guards, one `X` record for repeated hide requests,
  exclusion from lists and comparisons, direct reads, future uploads, and
  retention through optimization.

## Unified project card editing

- Outcome: Replace the project card's rollover editors with a small edit button
  opening one dialog for emoji, note, and ground truth name.
- API: Replace the separate project ground-truth update endpoint with a single
  full project display payload at `PUT /api/projects/{projectName}/display`.
  Require all three fields (null clears one) to prevent accidental erasure by
  outdated clients; keep experiment card editing and its endpoint unchanged.
- Milestones: [x] combined storage/API contract; [x] project card and dialog;
  [x] browser/backend tests, docs, and verification.
- Verification: `make check` and `CI=1 make test` passed (138 catalog tests,
  72 UI unit tests, and 185 browser tests). An isolated API/Azurite test
  confirmed a combined Unicode save, clearing, required payload fields,
  removal of the old route, project-list responses, and preservation of
  baseline and unrelated container metadata.
- Refinement: Project cards retain the shared inline emoji icon/pulldown in
  addition to the edit dialog. Inline emoji updates send the full project
  display payload to preserve ground truth and note; those two fields remain
  editable only in the dialog.
- Experiment cards now also show a lower-right edit button and dialog for emoji
  and note. Their inline emoji picker stays available and preserves the note;
  note editing is no longer inline. The experiment display API is unchanged.
- Verification after this refinement: `make check` and 34 focused browser
  tests passed for experiment/project cards, navigation, and creation dialogs.
- Layout refinement: Align the experiment card emoji and note along the bottom
  of cards in the same row, even when their hypotheses have different heights.
  A browser layout test checks their footer coordinates.
- Navigation refinement: Let the experiment card's main button fill all space
  above the footer, leaving emoji, note, and edit controls outside its click
  target. Browser tests cover blank-space navigation and footer independence.

## Direct project lookup

- Outcome: Add `GET /api/projects/{projectName}` returning the same project
  metadata as the collection route, without enumerating every project.
- Scope: Use the detail route for direct URL loads of project, experiment, set,
  and chart pages. Keep collection requests for project lists, comparison
  selection, and background tasks that genuinely need all projects.
- Milestones: [x] storage/API lookup and not-found behavior; [x] UI routing and
  browser/API coverage; [x] docs and operator skill; [x] validation.
- Verification: `make ci` passed (139 catalog tests, 72 UI unit tests, and
  198 browser tests). An isolated read-only API smoke test confirmed that
  the detail response matches the project list and a missing project returns
  404. Browser tests verify that direct project, experiment, set, and chart
  links fetch only the named project.
