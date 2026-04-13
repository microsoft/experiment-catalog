---
name: create-experiment-directory
description: This skill should be used to create an experiment directory with a README.md file that contains the experiment's description and details.
---

# Create Experiment Directory

This skill creates a new experiment directory and initializes it with a README.md file containing the experiment's description and details.

## How to use

Run the following command in the terminal from the workspace root:

```sh
node .github/skills/create-experiment-directory/create-experiment.js "<experiment-name>" "<hypothesis>" "<display-name>" "<catalog-project>" "<catalog-app-uri>" "<catalog-oidc-client-id>"
```

For example:

```sh
node .github/skills/create-experiment-directory/create-experiment.js "my-experiment" "Users prefer dark mode over light mode" "My Experiment" "my-project" "https://catalog.example.io/swagger" "abcdedf-1234-5678-90ab-cdef12345678"
```

## Parameters

| Parameter        | Type   | Required | Description                                                      |
|------------------|--------|----------|------------------------------------------------------------------|
| `experimentName` | string | Yes      | Cleaned name of the experiment (used for the directory).         |
| `hypothesis`     | string | Yes      | The experiment hypothesis text.                                  |
| `displayName`    | string | No       | Original (as-is) experiment name shown in the README heading. Defaults to `experimentName` if omitted. |
| `catalogProject` | string | No       | Catalog project name. When provided (along with `catalogAppUri` and `catalogOidcClientId`), the experiment is registered in the catalog API if it does not already exist. |
| `catalogAppUri` | string | No       | Catalog application URI (e.g. `https://...azurecontainerapps.io/swagger`). Required when `catalogProject` is set. |
| `catalogOidcClientId` | string | No  | OIDC client ID used to obtain a bearer token for the catalog API. Required when `catalogProject` is set. |
| `rootDir`        | string | No       | Root directory for the experiment folder (defaults to workspace). |

## Behavior

- Returns the absolute path to the created experiment directory.
- Throws an error if the experiment directory already exists or if there is an issue during directory creation or file writing.