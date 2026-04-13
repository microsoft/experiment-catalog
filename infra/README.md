# Infrastructure Deployment

This directory contains Bicep templates and scripts for deploying platform resources to Azure.

## Prerequisites

- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) installed and configured
- Logged in to Azure CLI (`az login`)
- Appropriate permissions to create resources in the target subscription

## SetupEnv.ps1

The `SetupEnv.ps1` script deploys platform resources using Bicep templates.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `-Prefix` | No | Derived from user ID | Prefix for resource naming. If not provided, uses the first 4 characters of the current user's UPN alias + first 3 characters of the user ID GUID. Must contain only alphanumeric characters. |
| `-EnvFlag` | No | `d` | Environment flag. Valid values: `P` (Production), `T` (Test), `S` (Staging), `D` (Development). Case insensitive. |
| `-ResourceGroupName` | No | `{userPrefix}{envFlag}` | Resource group name. If not provided, derives from user prefix and environment flag. |
| `-AIFoundryProjectName` | No | `isedevblog` | Name for the AI Foundry project. Required when `EnableAIFoundry` or `EnableAll` is set. |
| `-IPAddresses` | No | Current machine IP | Comma-delimited string of IPv4 addresses for firewall rules (e.g., `"192.168.1.100,10.0.0.50"`). Current machine's IP is auto-detected and added if not in the list. |
| `-UserGroupId` | No | Current user | Entra ID group object ID for RBAC assignments. If provided, the group is validated and current user must be a member. |
| `-Location` | No | `eastus2` | Azure region for resource deployment. |

### Feature Switches

| Switch | Description |
|--------|-------------|
| `-EnableAML` | Enable Azure Machine Learning resources |
| `-EnableCosmosDB` | Enable Cosmos DB resources |
| `-EnableAISearch` | Enable Azure AI Search resources |
| `-EnableAIFoundry` | Enable Azure AI Foundry resources |
| `-EnableContainerAppEnvironment` | Enable Container App Environment resources |
| `-EnableCatalog` | Enable Catalog resources |
| `-EnableAppConfiguration` | Enable App Configuration resources |
| `-EnableAll` | Enable all features (default if no switches specified) |

> **Note:** If no feature switches are specified, `-EnableAll` is automatically set.

### Usage Examples

#### Basic Deployment (All Features)

Deploy with auto-derived prefix and resource group name:

```powershell
.\SetupEnv.ps1
```

#### Custom Prefix

Deploy with a custom prefix:

```powershell
.\SetupEnv.ps1 -Prefix "myapp"
```

#### Specific Environment

Deploy to a test environment:

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -EnvFlag "t"
```

#### Custom Resource Group and Location

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -ResourceGroupName "rg-myapp-dev" -Location "westus2"
```

#### Deploy Specific Features Only

Deploy only Azure Machine Learning and Cosmos DB:

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -EnableAML -EnableCosmosDB
```

Deploy only AI Foundry with a custom project name:

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -EnableAIFoundry -AIFoundryProjectName "myaiproject"
```

#### Configure IP Addresses for Firewall Rules

Add multiple IP addresses to firewall rules:

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -IPAddresses "192.168.1.100,10.0.0.50,203.0.113.1"
```

#### Use Entra ID Group for RBAC

Deploy using an Entra ID group for RBAC assignments:

```powershell
.\SetupEnv.ps1 -Prefix "myapp" -UserGroupId "12345678-1234-1234-1234-123456789012"
```

#### Full Production Deployment Example

```powershell
.\SetupEnv.ps1 `
    -Prefix "prodapp" `
    -EnvFlag "p" `
    -ResourceGroupName "rg-prodapp-prod" `
    -Location "eastus" `
    -AIFoundryProjectName "prod-ai-project" `
    -IPAddresses "10.0.0.1,10.0.0.2" `
    -UserGroupId "12345678-1234-1234-1234-123456789012" `
    -EnableAll
```

## Bicep Modules

The deployment uses modular Bicep templates located in the `modules/` directory:

| Module | Description |
|--------|-------------|
| `apps.bicep` | Application resources (Container Apps, etc.) |
| `network.bicep` | Network infrastructure (VNet, subnets, etc.) |
| `observability.bicep` | Monitoring and logging resources |
| `rbac.bicep` | Role-based access control assignments |
| `security.bicep` | Security resources (Key Vault, etc.) |
| `storage.bicep` | Storage account resources |
| `storage-update.bicep` | Storage account updates |
