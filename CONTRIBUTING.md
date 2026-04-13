---
title: Contributing to AML Evaluation Runner
description: Contribution guidelines for the published AML Evaluation Runner prep repository.
ms.date: 2026-04-13
ms.topic: how-to
---

## Overview

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit <https://cla.microsoft.com>.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide a CLA and decorate the pull request appropriately, for example with a label or comment. Follow the instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

## Before you start

- Search existing issues and pull requests before opening a new one.
- Open an issue before starting substantial feature work so the approach can be discussed early.
- Use [SECURITY.md](./SECURITY.md) instead of public issues for suspected vulnerabilities.
- Review [SUPPORT.md](./SUPPORT.md) for support scope and response expectations.

## Development setup

- Install the prerequisites listed in [README.md](./README.md).
- Review the component guides that match the area you are changing:
  - [inference/README.md](./inference/README.md)
  - [actions/README.md](./actions/README.md)
  - [demo-experiments/README.md](./demo-experiments/README.md)
- Install dependencies from the component directory you are editing.
- If you are working with downstream orchestration or evaluation components that are not published in this prep tree, keep the related private documentation and configuration aligned with your code changes.
- If you contribute reusable inference or action implementations, update the relevant documentation and maintainer information in `docs/MAINTAINERS.md` when appropriate.

## Pull requests

- Prefer forks rather than direct branches for external contributions.
- Keep changes focused and update documentation in the same pull request when behavior changes.
- Run the relevant validation flow for the component you touched before requesting review.
- Add or update tests where practical for behavior changes.
- Do not merge a pull request unless the `license/cla` check has passed.

## Review expectations

- Be responsive to review feedback and keep the pull request discussion in one place.
- If a pull request changes inference, action behavior, or deployment guidance, update the corresponding README or docs page in the same change.