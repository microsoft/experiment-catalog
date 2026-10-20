---
title: Dependency Governance
description: Policy and automation for dependency and third-party license inventory in experiment-catalog.
ms.date: 2026-05-20
ms.topic: reference
---

## Purpose

This document defines how we track third-party dependencies and generate machine-readable inventory artifacts for review.

## Policy

- Dependencies must be declared through supported package managers only.
- New dependencies require a rationale in pull request descriptions.
- Dependency updates should flow through Dependabot when possible.
- Third-party notices and dependency inventory artifacts must remain auditable.

## Automated inventory

The dependency inventory workflow produces artifacts for:

- .NET package graphs for catalog and tests
- NPM dependency graph for the UI
- NPM package license report when available

Workflow file: .github/workflows/dependency-inventory.yml

## Review expectations

- Review inventory artifacts for unexpected packages.
- Validate high-risk license families before release.
- Update THIRD_PARTY_NOTICES.md when notice obligations change.

## Compatibility Constraints

- The UI uses TypeScript 7 through the `@typescript/native` alias and
  `svelte-check --tsgo`, retaining TypeScript 6 for the Svelte tooling API and
  its peer requirements. Do not force a TypeScript 7 peer override.
- Keep Playwright at stable 1.63.0 until its test package, browser image, and
  snapshots can be updated together; a prerelease `latest` tag is not approval
  to upgrade.
- Keep the .NET tests on VSTest with `Microsoft.NET.Test.Sdk`, the xUnit
  Visual Studio adapter, and `coverlet.collector`. The collector is not
  compatible with Microsoft Testing Platform v2. Validate coverage with
  `dotnet test catalog.tests/catalog.tests.csproj --collect:"XPlat Code Coverage"`.
- Keep `Microsoft.OpenApi` on 2.12.2 while
  `Microsoft.AspNetCore.OpenApi` 10.0.12 requires a version below 3.0.0.
  A 3.x upgrade needs a compatible ASP.NET Core OpenAPI stack and separate
  validation of generated documents and the bearer-security transformer.

## Local execution

Run the same inventory script used in CI:

bash scripts/compliance/export_dependency_inventory.sh
