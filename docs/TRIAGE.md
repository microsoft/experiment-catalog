---
title: Issue Triage Guide
description: Workflow and label conventions for issue intake, prioritization, and contributor onboarding.
ms.date: 2026-05-20
ms.topic: how-to
---

## Triage goals

- Keep issue status clear within one business week.
- Route work to the right maintainer quickly.
- Maintain a steady stream of contributor-friendly work items.

## Triage cadence

- Review new issues at least once per week.
- Confirm severity and scope before assigning milestones.
- Close stale or out-of-scope requests with rationale and alternatives.

## Label set

Use these labels consistently:

- kind:bug
- kind:feature
- kind:docs
- priority:P0
- priority:P1
- priority:P2
- area:api
- area:ui
- area:governance
- status:needs-triage
- status:blocked
- status:ready
- good first issue

## Intake workflow

1. Confirm the template is complete and reproducible.
2. Add kind, area, and priority labels.
3. Assign status:needs-triage until ownership is confirmed.
4. Route to the maintainer role from MAINTAINERS.md.
5. Convert to good first issue when scope is small, low risk, and well-bounded.

## Good first issue criteria

A task can be labeled good first issue when all criteria are met:

- Expected effort is less than one day.
- Failure impact is low and isolated.
- Acceptance criteria and test expectations are explicit.
- A maintainer is available for onboarding support.

## Security and sensitive reports

Do not triage suspected vulnerabilities in public issues. Use SECURITY.md guidance for private reporting.
