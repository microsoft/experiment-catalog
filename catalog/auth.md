# Authentication

There are a number of ways to secure the Experiment Catalog API. This guide will describe some of the common methods.

Regardless of the method used for authentication, this is the order in which tokens are evaluated:

- Authorization header with a Bearer token
- Cookie specified by `OIDC_VALIDATE_COOKIE`
- Header specified by `OIDC_VALIDATE_HEADER`

## Anonymous

By default, the Experiment Catalog does not require authentication. This is suitable for development and testing scenarios, or when the catalog is hosted in a secure environment where access is controlled by other means.

## EasyAuth

If hosting the catalog in Azure App Service or Container Apps, EasyAuth can be configured using the Microsoft identity provider or the OpenID Connect provider. This is sufficient for providing a secure solution.

When using the Microsoft identity provider, the X-MS-TOKEN-AAD-ID-TOKEN and/or X-MS-TOKEN-AAD-ACCESS-TOKEN headers are passed to the underlying application. The Experiment Catalog can be configured to validate the token signature by setting `OIDC_AUTHORITY`. You can optionally validate other claims such as `OIDC_AUDIENCES`, `OIDC_ISSUERS`, `OIDC_VALIDATE_LIFETIME`, and `OIDC_ACCEPTABLE_ROLES`. While validation of the token is not strictly necessary when using EasyAuth, it does provide an additional layer of security, for example, if the EasyAuth configuration is disabled or changed.

### App Registration Requirements

The Entra ID app registration used by EasyAuth must have **ID token issuance** enabled under the implicit grant settings. EasyAuth uses `response_type=code+id_token` with `response_mode=form_post`, which requires this setting. Without it, the authentication callback returns a 401.

To enable via Azure CLI:

```bash
az ad app update --id <client-id> --enable-id-token-issuance true
```

### Container Apps Token Store

On Azure Container Apps, the token store must be explicitly enabled for EasyAuth to forward the `X-MS-TOKEN-AAD-ID-TOKEN` header to the application. Unlike App Service, Container Apps does not enable the token store by default and requires a blob storage container as the backing store.

Without the token store enabled, API requests will fail with 401 because the catalog's JWT middleware cannot find a token to validate (the `X-MS-TOKEN-AAD-ID-TOKEN` header is not forwarded).

To enable the token store:

```bash
# create a blob container for the token store
az storage container create --name tokenstore --account-name <storage-account> --auth-mode login

# enable the token store on the Container App
az containerapp auth update \
  --name <app-name> \
  --resource-group <resource-group> \
  --token-store true \
  --blob-container-uri "https://<storage-account>.blob.core.windows.net/tokenstore"
```

The managed identity assigned to the Container App must have **Storage Blob Data Contributor** on the storage account used for the token store.

After enabling the token store, users must log out and log back in to get a fresh session.

## OpenID Connect (OIDC)

If you want to use OIDC authentication directly, you can configure the Experiment Catalog to use an OIDC provider using a PKCE code flow such as Azure AD, Auth0, or Okta. You will need to set the following configuration values:

- `OIDC_AUTHORITY`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET` (this may be optional for some providers)

With those parameters set, the Experiment Catalog API provides the following endpoints:

- `GET /auth/login`: Redirects the user to the OIDC provider's authorization endpoint to initiate the login process.

- `GET /auth/callback`: Handles the callback from the OIDC provider after the user has authenticated. This endpoint exchanges the authorization code for tokens and sets a secure cookie with the `id_token`. It then redirects the user to the home page or a specified return URL.

- `POST /auth/logout`: Logs the user out by clearing the authentication cookie and redirecting to the OIDC provider's logout endpoint.

- `GET /auth/status`: Returns information about whether authentication is required and whether the user is currently authenticated.

In addition to the above configuration values, you may also want to set:

- `OIDC_AUDIENCES`
- `OIDC_ISSUERS`
- `OIDC_VALIDATE_LIFETIME`
- `OIDC_ACCEPTABLE_ROLES`

### Microsoft Entra ID Setup

When using Entra ID as the OIDC provider, create an app registration and configure the catalog as follows.

#### Create App Registration

```bash
az ad app create --display-name "<your-app-name>" \
  --sign-in-audience AzureADMyOrg
```

Capture the `appId` from the output. Then set the identifier URI and create a service principal:

```bash
az ad app update --id <appId> \
  --identifier-uris "api://<appId>"

az ad sp create --id <appId>
```

#### Add Redirect URI for Browser Login

The catalog uses a PKCE-based login flow with `/auth/callback`. The app registration must have a Web redirect URI matching the catalog's public URL:

```bash
az ad app update --id <appId> \
  --web-redirect-uris "https://<catalog-fqdn>/auth/callback"
```

Without the redirect URI, the browser login flow completes authentication at Azure AD but fails on the callback with an AADSTS redirect mismatch error. This is easy to miss when initially configuring OIDC because API-only auth (bearer tokens) works without it.

#### Configure Environment Variables

Set these environment variables on the catalog host:

| Variable             | Value                                                | Notes                                          |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `OIDC_AUTHORITY`     | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Must include `/v2.0` for v2 tokens             |
| `OIDC_CLIENT_ID`     | `<appId>`                                            | The app registration's application (client) ID |
| `OIDC_CLIENT_SECRET` | `<secret>`                                           | Store in Key Vault when running in Azure       |
| `OIDC_AUDIENCES`     | `<appId>,api://<appId>`                              | Must include both formats — see below          |

> **Audience format**: Azure AD v2.0 tokens set the `aud` claim to the raw appId (for example, `95c2c531-...`), not the identifier URI (`api://95c2c531-...`). If `OIDC_AUDIENCES` only contains the `api://` form, all v2.0 tokens are rejected with 401. Always include both the raw appId and the `api://` URI.

#### Client Secret Lifetime

Some Entra ID tenants have policies limiting credential lifetimes. If `az ad app credential reset` fails with "Credential lifetime exceeds max value allowed by policy," reduce the `--end-date` until it falls within the policy limit.

### Service Principal and Managed Identity Access

Managed identities and service principals authenticate using the client credentials flow. This flow requires an **Application**-type app role on the app registration — a delegated scope is not sufficient.

#### Create an Application-Type App Role

```bash
az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/<app-object-id>" \
  --headers "Content-Type=application/json" \
  --body '{
    "appRoles": [{
      "allowedMemberTypes": ["Application"],
      "displayName": "Catalog ReadWrite",
      "description": "Read and write catalog data",
      "id": "<generate-a-guid>",
      "isEnabled": true,
      "value": "Catalog.ReadWrite"
    }]
  }'
```

Use `uuidgen` or equivalent to generate the GUID for the `id` field.

#### Assign the Role to a Service Principal

```bash
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/<catalog-sp-id>/appRoleAssignedTo" \
  --headers "Content-Type=application/json" \
  --body '{
    "principalId": "<target-principal-id>",
    "resourceId": "<catalog-sp-id>",
    "appRoleId": "<app-role-id>"
  }'
```

Where `<target-principal-id>` is the object ID of the managed identity or service principal that needs access, `<catalog-sp-id>` is the service principal ID of the catalog app registration, and `<app-role-id>` is the GUID from the app role definition.

### Pre-Authorizing Azure CLI for Interactive Testing

To allow `az account get-access-token --resource api://<appId>` for manual testing, expose a delegated scope and pre-authorize the Azure CLI app:

```bash
az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/<app-object-id>" \
  --headers "Content-Type=application/json" \
  --body '{
    "api": {
      "oauth2PermissionScopes": [{
        "adminConsentDescription": "Access catalog as user",
        "adminConsentDisplayName": "access_as_user",
        "id": "<generate-a-guid>",
        "isEnabled": true,
        "type": "User",
        "value": "access_as_user"
      }],
      "preAuthorizedApplications": [{
        "appId": "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
        "delegatedPermissionIds": ["<scope-id>"]
      }]
    }
  }'
```

The Azure CLI app ID (`04b07795-8ddb-461a-bbee-02f9e1bf7b46`) is a well-known Microsoft first-party application. Without this pre-authorization, `az account get-access-token` fails with `AADSTS650057: Invalid resource`.
