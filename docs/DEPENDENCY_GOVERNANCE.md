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

## Local execution

Run the same inventory script used in CI:

bash scripts/compliance/export_dependency_inventory.sh
