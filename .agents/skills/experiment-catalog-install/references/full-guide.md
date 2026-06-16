# Experiment Catalog Installation Full Guide

Use this guide when the hot-path instructions in `../SKILL.md` are not enough.
The repository README and `catalog/README.md` remain authoritative for current
configuration details.

## Installation Principles

- Ask before choosing deployment scope, region, resource names, hosting model,
  auth mode, or telemetry opt-out behavior.
- Prefer the published container image for Azure deployment unless the user asks
  to build from source.
- Use managed identity and least-privilege RBAC for Azure-hosted deployments.
- Keep deployment telemetry limited to Azure ARM control-plane provisioning.
- Do not store connection strings, account keys, bearer tokens, client secrets,
  or `.env` files in source control.

## Local Development

Required local tools:

- .NET 10 SDK
- Node.js 20+
- Azure CLI when using `INCLUDE_CREDENTIAL_TYPES=azcli`
- Docker for containerized local testing

Minimum local `.env`:

```env
INCLUDE_CREDENTIAL_TYPES=azcli
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
```

The signed-in user needs `Storage Blob Data Contributor` on the storage account.
Use a connection string only when the user explicitly chooses key-based access.

## Azure Provisioning

Typical resources:

- Resource group
- Azure Storage Account
- Container host, usually Azure Container Apps
- Managed identity for the catalog host
- `Storage Blob Data Contributor` role assignment scoped to the storage account
- Optional Log Analytics / Application Insights resources
- Optional Entra app registration for OIDC or EasyAuth

These are Azure Resource Manager control-plane operations. Unless the user opts
out, include Asset ID `acce1e78-0cec-4c66-9e3b-900c69b1c199` in the ARM
`User-Agent` for provisioning commands and generated infrastructure artifacts.
This ID is Microsoft ISE OSS usage attribution for tracking adoption of this
open source tool; it is not Experiment Catalog application telemetry and does
not instrument catalog runtime behavior, experiment data, prompts, results, or
Blob Storage contents. Users are free to opt out without affecting catalog
functionality.

### Azure CLI Pattern

When using Azure CLI for provisioning, preserve any existing custom user-agent:

```bash
if [ "${ENABLE_ISE_ASSET_TELEMETRY:-true}" != "false" ]; then
  if [ -n "${AZURE_HTTP_USER_AGENT:-}" ]; then
    export AZURE_HTTP_USER_AGENT="${AZURE_HTTP_USER_AGENT} acce1e78-0cec-4c66-9e3b-900c69b1c199"
  else
    export AZURE_HTTP_USER_AGENT="acce1e78-0cec-4c66-9e3b-900c69b1c199"
  fi
fi
```

Use that environment only around Azure ARM provisioning commands. It is not
needed for catalog API calls, blob data-plane writes, or demo-data generation.

### Terraform Pattern

When generating Terraform, include an opt-out variable and wire the AzureRM
provider attribution according to the current provider documentation:

```hcl
variable "enable_ise_asset_telemetry" {
  type        = bool
  default     = true
  description = "Enable ISE asset telemetry for Azure ARM control-plane provisioning."
}
```

Then conditionally use Asset ID `acce1e78-0cec-4c66-9e3b-900c69b1c199` in the
provider's partner/customer usage attribution field. If the provider version or
syntax differs, inspect the installed provider documentation and implement the
documented mechanism rather than guessing.

## Runtime Configuration

Minimum Azure-hosted environment:

```env
INCLUDE_CREDENTIAL_TYPES=mi
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
```

Recommended options:

- `OPEN_TELEMETRY_CONNECTION_STRING` for Application Insights/OpenTelemetry
- `AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES` for the first cloud instance
- `AZURE_STORAGE_CACHE_FOLDER=/tmp/cache` when read performance requires it
- `ENABLE_DOWNLOAD=true` plus support-doc storage configuration when users need
  to inspect inference/evaluation artifacts

## Authentication

The catalog supports anonymous, EasyAuth, and OIDC modes.

For public Azure deployments, enable authentication. Do not disable auth to work
around `401` errors.

For Entra ID / OIDC:

1. Create an app registration and service principal.
2. Register `https://<fqdn>/auth/callback`.
3. If EasyAuth is also enabled, register
   `https://<fqdn>/.auth/login/aad/callback`.
4. Set `OIDC_AUTHORITY`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and
   `OIDC_AUDIENCES`.
5. Include both `<appId>` and `api://<appId>` in `OIDC_AUDIENCES`.
6. For managed identity programmatic access, create an Application-type app
   role and assign it to the managed identity service principal.

Acquire a token for API calls with:

```bash
az account get-access-token --resource api://<appId> --query accessToken -o tsv
```

## AML Evaluation Runner Integration

The AML runner catalog action posts results only. It does not create catalog
projects or experiments. Create the project and experiment before submitting the
pipeline:

```bash
curl -X POST "<CATALOG_URL>/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "<PROJECT_NAME>"}'

curl -X POST "<CATALOG_URL>/api/projects/<PROJECT_NAME>/experiments" \
  -H "Content-Type: application/json" \
  -d '{"name": "<EXPERIMENT_NAME>", "hypothesis": "<DESCRIPTION>"}'
```

The experiment name must match the runner's `AML_EXPERIMENT_NAME`.

## Multiple Instances

Multiple API instances can point at the same storage account, but only one
instance should calculate p-values and only one should optimize append blobs.

Do not enable these settings on every replica:

```env
CALC_PVALUES_EVERY_X_MINUTES=<minutes>
AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES=<minutes>
```

## Troubleshooting

| Issue | Likely cause | Fix |
| --- | --- | --- |
| `dotnet: command not found` | .NET SDK missing | Install .NET 10 SDK |
| `node: command not found` | Node.js missing | Install Node.js 20+ |
| `az: command not found` | Azure CLI missing | Install Azure CLI |
| Storage account name rejected | Invalid or unavailable name | Use 3-24 lowercase alphanumeric characters |
| `403 Forbidden` on blobs | Missing RBAC role | Assign `Storage Blob Data Contributor` |
| `403 AuthorizationFailure` after setup | RBAC propagation delay | Wait 1-5 minutes and retry |
| `KeyBasedAuthenticationNotPermitted` | Shared key access disabled | Use managed identity or Azure CLI credentials |
| Port 6010 in use | Local port conflict | Set `PORT` to a different value |
| Container app not reachable | Ingress disabled or blocked | Verify ingress and network rules |
| `image OS/Arc must be linux/amd64` | Wrong image architecture | Build/pull `linux/amd64` for Azure |
| `az acr build` produces broken image | Dockerfile BuildKit args stripped | Use published GHCR image or local Docker build |
| OIDC redirect fails | Redirect URI missing | Add the correct callback URL to the app registration |
| `401` with valid token | Audience mismatch | Include both appId and `api://appId` in `OIDC_AUDIENCES` |
| EasyAuth redirect loop | Misconfigured callback or ID token issuance | Verify EasyAuth callback and token settings |
