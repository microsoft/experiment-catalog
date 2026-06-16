# Hardening

When deploying for production or within a customer environment, consider
defense-in-depth principles to protect the catalog and its data. Ask the user
before applying these measures.

## Token Validation

Even when using Azure App Service Authentication or Container Apps EasyAuth, the
application should validate JWT signature and claims on incoming tokens. Validate
`iss`, `aud`, and `exp` at minimum.

Reference: <https://learn.microsoft.com/azure/app-service/overview-authentication-authorization>

## Network Isolation

Place the catalog host and storage account inside an Azure Virtual Network. Use
private endpoints for storage so blob traffic avoids the public internet.
Disable public network access on the storage account once private endpoints are
working.

Reference: <https://learn.microsoft.com/azure/storage/common/storage-private-endpoints>

## Reverse Proxy / Web Application Firewall

Place Azure Front Door or Azure Application Gateway with WAF in front of public
catalog endpoints. Lock down the catalog host so it accepts traffic only from
the reverse proxy path.

References:

- <https://learn.microsoft.com/azure/frontdoor/front-door-overview>
- <https://learn.microsoft.com/azure/web-application-firewall/overview>

## Managed Identity And Least Privilege

Use managed identity for service-to-service authentication. Assign only the
minimum required RBAC roles, such as `Storage Blob Data Contributor` scoped to
the specific storage account. Avoid connection strings and account keys; if keys
are unavoidable, store them in Azure Key Vault.

Reference: <https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview>

## Diagnostic Logging And Monitoring

Enable diagnostic settings on storage and hosting resources. Send logs to Log
Analytics or Application Insights and configure alerts for failed auth,
unexpected RBAC changes, anomalous storage access, and health-check failures.

Reference: <https://learn.microsoft.com/azure/storage/blobs/monitor-blob-storage>
