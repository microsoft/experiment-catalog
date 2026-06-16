---
title: Experiment Catalog Maintainers
description: Maintainer ownership model, role expectations, and escalation paths for experiment-catalog.
ms.date: 2026-05-20
ms.topic: reference
---

## Maintainer model

This repository uses a role-based maintainer model so ownership can scale as contribution volume grows.

| Role | Scope | Primary | Backup | Responsibilities |
| --- | --- | --- | --- | --- |
| Product owner | Roadmap and prioritization | @plasne | Open seat | Prioritize backlog, approve scope, arbitrate trade-offs |
| Platform maintainer | CI, release, governance automation | @plasne | Open seat | Maintain workflows, branch policy, release integrity |
| API maintainer | catalog and catalog.tests | @plasne | Open seat | Review API changes, maintain tests and contracts |
| UI maintainer | ui and frontend test assets | @plasne | Open seat | Review UI changes, maintain usability and frontend checks |
| Security contact | Vulnerability intake and response | @plasne | Open seat | Triage and coordinate response under SECURITY.md |

## Staffing target

The near-term target is to fill at least two dedicated maintainer seats in addition to the product owner.

## Review routing

- CODEOWNERS routes all changes to the current primary maintainer.
- PRs that change CI, security, or release files should include platform maintainer review.
- PRs that affect runtime behavior should include the relevant domain maintainer review.

## Escalation

- Security issues: follow SECURITY.md reporting guidance.
- Release blockers: escalate to the platform maintainer.
- Priority conflicts: escalate to the product owner.

## Updating this file

Update this file whenever ownership changes so governance checks and contribution guidance remain accurate.
