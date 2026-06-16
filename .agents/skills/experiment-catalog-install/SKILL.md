---
name: experiment-catalog-install
description: Clone, build, and run the Experiment Catalog locally or in Azure. Provisions Azure resources, builds the .NET backend and Svelte UI, and starts or deploys the solution. Trigger phrases include "install experiment catalog", "run experiment catalog", "experiment catalog", "experiment catalog dev setup", "deploy experiment catalog".
license: MIT
compatibility: Requires Azure CLI for Azure provisioning, Docker for containerized deployment, .NET 10 SDK for local backend builds, and Node.js 20+ for UI builds.
metadata:
  spec_version: "1.0"
  version: "1.0.0"
  catalog_skill_version: "1.0.0"
  catalog_project: "microsoft/experiment-catalog"
  source_repository: "https://github.com/plasne/agent-skills"
---

## Execution Model

> [!IMPORTANT]
> Do not execute this skill directly in the main thread. Delegate each discrete
> task to its own sub-agent and pass this skill path to that sub-agent.

Use phases for larger requests:

1. discovery and plan
2. storage and hosting setup
3. auth and app registration setup
4. deployment and verification
5. integration or data setup
6. validation and handoff

Keep the main thread as coordinator, store important IDs and URLs in session
artifacts, and summarize successful long-running work.

# Experiment Catalog Installation

Use this skill to deploy the catalog locally or in Azure. Keep the hot path in
this file. Open `references/full-guide.md` for detailed procedures and the full
troubleshooting matrix.

## Ask The User First

Before deploying, confirm:

- local vs Azure deployment
- region, resource group, naming, and hosting choice
- whether auth should be enabled
- whether support-document download is needed
- whether this instance will receive AML runner results
- whether deployment telemetry should remain enabled for Azure control-plane operations

Never invent names, regions, subscriptions, resource groups, security settings,
or telemetry opt-out choices without user input.

## Source Code

Repo: <https://github.com/microsoft/experiment-catalog>

Focus on:

- `catalog`
- `ui`

The repo README and `catalog/README.md` are authoritative for configuration.

## ISE OSS Usage Attribution

This project is registered as a Microsoft ISE open source asset with Asset ID:

```text
acce1e78-0cec-4c66-9e3b-900c69b1c199
```

This ID is not Experiment Catalog application telemetry. It is Microsoft ISE OSS
usage attribution that lets Microsoft measure adoption of this open source tool
when users choose to deploy Azure resources for it. It does not instrument the
catalog API, UI, evaluator, experiment data, prompts, results, or Blob Storage
contents.

When this skill creates Azure deployment artifacts or provisions Azure
resources, the deployment agent MUST apply the Asset ID to Azure Resource
Manager (ARM) control-plane calls in the prescribed Microsoft Customer Usage
Attribution style by appending it to the ARM `User-Agent`, unless the user opts
out.

Apply this only to Azure control-plane provisioning, such as:

- Terraform, Bicep, ARM template, or Azure CLI creation/update of resource
  groups, storage accounts, container hosts, managed identities, role
  assignments, app registrations, networking resources, monitoring resources,
  or deployment resources.
- Agent-generated deployment artifacts that will later create those resources.

Do not apply this to normal catalog runtime/data-plane operations, such as:

- the catalog API creating blob containers for projects
- uploading, appending, reading, or listing blobs
- demo-data generation through the catalog API

### Agent Instructions

- Before running Azure provisioning, check whether the user opted out. If they
  did not opt out, include Asset ID `acce1e78-0cec-4c66-9e3b-900c69b1c199` in
  the control-plane user agent for the selected deployment technology.
- For Azure CLI based provisioning, set the user-agent environment around the
  provisioning commands, for example:

  ```bash
  export AZURE_HTTP_USER_AGENT="acce1e78-0cec-4c66-9e3b-900c69b1c199"
  ```

  If an existing `AZURE_HTTP_USER_AGENT` value is present, append the Asset ID
  instead of replacing the existing value.
- For Terraform using the AzureRM provider, configure the provider's partner
  usage attribution according to the current AzureRM provider documentation. If
  generating reusable Terraform, expose a clear opt-out variable and use the
  Asset ID only when telemetry is enabled.
- For Bicep, ARM templates, SDKs, or other provisioning tools, follow the
  current Microsoft Customer Usage Attribution guidance for appending this Asset
  ID to ARM control-plane user agents.
- Document the exact mechanism used in generated deployment artifacts so users
  can audit and remove it.

### Opt Out

Users are free to opt out of ISE OSS usage attribution. Opting out does not
affect Experiment Catalog functionality. Users can opt out by removing the Asset
ID from generated deployment artifacts or by disabling the generated attribution
flag. When creating new artifacts, prefer an explicit opt-out control such as:

```hcl
variable "enable_ise_asset_telemetry" {
  type    = bool
  default = true
}
```

For Azure CLI scripts, support opt-out by skipping the `AZURE_HTTP_USER_AGENT`
export when a variable such as `ENABLE_ISE_ASSET_TELEMETRY=false` is set.

Also respect native telemetry controls for underlying tools when the user asks
for complete telemetry opt-out guidance:

- Azure CLI telemetry: <https://learn.microsoft.com/cli/azure/azure-cli-configuration#cli-configuration-values>
- Terraform AzureRM provider telemetry: <https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs#disable_terraform_partner_id-1>

## Fast Path

### Local

Minimum Azure dependency:

- one Azure Storage Account

Minimum env:

```bash
INCLUDE_CREDENTIAL_TYPES=azcli
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
```

The user needs `Storage Blob Data Contributor` on that account.

### Azure

Minimum resources:

- Azure Storage Account
- container host, usually Azure Container Apps
- managed identity on the host

Minimum env:

```bash
INCLUDE_CREDENTIAL_TYPES=mi
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
```

Default recommendation for Azure:

- use the published GHCR image
- let the API host the UI
- enable auth for publicly reachable deployments
- enable blob optimization on the first cloud instance
- keep ISE asset telemetry enabled for Azure control-plane deployment unless the user opts out

## Critical Configuration

### Port

The API listens on `6010` by default.

### Image Choice

Prefer the published image:

```text
ghcr.io/microsoft/experiment-catalog/catalog
```

If a Microsoft image is not available for the required version, use the image
documented in this repository's release notes or build locally with Docker.

`az acr build` is a poor default for this repo because the Dockerfile uses
BuildKit variables that ACR strips silently.

### Authentication

Supported modes:

- anonymous
- EasyAuth
- OIDC

For Entra ID / OIDC, keep these gotchas inline:

- `OIDC_AUDIENCES` should include both `<appId>` and `api://<appId>`
- register `https://<fqdn>/auth/callback` for browser login
- if EasyAuth is also enabled, also register
  `https://<fqdn>/.auth/login/aad/callback`
- create delegated scopes before adding pre-authorized applications
- managed identities need an Application-type app role, not just a delegated
  scope
- if using Container Apps EasyAuth token headers, enable the token store

For programmatic access, use:

```bash
az account get-access-token --resource api://<appId>
```

## AML Runner Integration

If this catalog will receive AML runner results:

- create the project first
- create the experiment first
- keep the experiment name aligned with `AML_EXPERIMENT_NAME`
- remember the runner posts results only; it does not create projects or
  experiments
- use the `/api` path suffix in the catalog base URL provided to the runner

## Validation Checklist

Verify all of the following before handoff:

- UI loads
- API responds
- storage reads and writes succeed
- auth succeeds if enabled
- a bearer token works for API calls if required
- AML integration targets an existing project and experiment if used
- deployment artifacts include the Asset ID for ARM control-plane operations unless the user opted out

## Local References

- Extended instructions and full troubleshooting: `references/full-guide.md`
- Hardening guidance: `references/hardening.md`
