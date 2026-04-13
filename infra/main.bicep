// Main orchestration file - uses modular Bicep files
targetScope = 'resourceGroup'

// =====================================================
// Parameters
// =====================================================
param location string
@minLength(5)
param prefix string
param env_flag string
param ip_list string
param foundry_project_name string
param user_object_id string

// Feature flags
param enableAML bool = false
param enableCosmosDB bool = false
param enableAISearch bool = false
param enableAIFoundry bool = false
param enableContainerAppEnvironment bool = false
param enableCatalog bool = false
param enableAppConfiguration bool = false

// =====================================================
// Modules
// =====================================================

// Network Module - VNet, NSGs, Subnets, Private DNS Zones
module network 'modules/network.bicep' = {
  name: 'network-deployment'
  params: {
    location: location
    prefix: prefix
    env_flag: env_flag
  }
}

// Observability Module - Log Analytics, Application Insights
module observability 'modules/observability.bicep' = {
  name: 'observability-deployment'
  params: {
    location: location
    prefix: prefix
    env_flag: env_flag
  }
}

// Security Module - Managed Identity, Key Vault, Container Registry
module security 'modules/security.bicep' = {
  name: 'security-deployment'
  params: {
    location: location
    prefix: prefix
    env_flag: env_flag
    ip_list: ip_list
    user_object_id: user_object_id
    resourcesSubnetId: network.outputs.resourcesSubnetId
    keyVaultDnsZoneId: network.outputs.privateDnsZoneIds.keyVault
    acrDnsZoneId: network.outputs.privateDnsZoneIds.acr
  }
}

// Storage Module - Storage Accounts, Containers, Private Endpoints
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    location: location
    prefix: prefix
    env_flag: env_flag
    ip_list: ip_list
    enableAML: enableAML
    enableCatalog: enableCatalog
    resourcesSubnetId: network.outputs.resourcesSubnetId
    blobDnsZoneId: network.outputs.privateDnsZoneIds.blob
    queueDnsZoneId: network.outputs.privateDnsZoneIds.queue
    tableDnsZoneId: network.outputs.privateDnsZoneIds.table
  }
}

// RBAC Module - Storage Role Assignments
module rbac 'modules/rbac.bicep' = {
  name: 'rbac-deployment'
  params: {
    prefix: prefix
    managedIdentityPrincipalId: security.outputs.managedIdentityPrincipalId
    user_object_id: user_object_id
    enableAML: enableAML
    enableCatalog: enableCatalog
    enableAppConfiguration: enableAppConfiguration
    amlStorageAccountName: storage.outputs.amlStorageAccountName
    appStorageAccountName: storage.outputs.appStorageAccountName
    catalogStorageAccountName: storage.outputs.catalogStorageAccountName
    appConfigurationName: apps.outputs.appConfigurationName
    amlWorkspaceSystemIdentityPrincipalId: apps.outputs.amlWorkspaceSystemIdentityPrincipalId
  }
}

// Apps Module - AML, CosmosDB, AI Search, AI Foundry, Container Apps
module apps 'modules/apps.bicep' = {
  name: 'apps-deployment'
  params: {
    location: location
    prefix: prefix
    env_flag: env_flag
    ip_list: ip_list
    foundry_project_name: foundry_project_name
    user_object_id: user_object_id
    enableAML: enableAML
    enableCosmosDB: enableCosmosDB
    enableAISearch: enableAISearch
    enableAIFoundry: enableAIFoundry
    enableContainerAppEnvironment: enableContainerAppEnvironment
    enableAppConfiguration: enableAppConfiguration
    managedIdentityId: security.outputs.managedIdentityId
    managedIdentityPrincipalId: security.outputs.managedIdentityPrincipalId
    appInsightsId: observability.outputs.appInsightsId
    keyVaultId: security.outputs.keyVaultId
    containerRegistryId: security.outputs.containerRegistryId
    amlStorageAccountId: storage.outputs.amlStorageAccountId
    appStorageAccountName: storage.outputs.appStorageAccountName
    groundTruthsContainerName: storage.outputs.groundTruthsContainerName
    jobOutputContainerName: storage.outputs.jobOutputContainerName
    resourcesSubnetId: network.outputs.resourcesSubnetId
    amlComputeSubnetId: network.outputs.amlComputeSubnetId
    appsSubnetId: network.outputs.appsSubnetId
    cosmosDbDnsZoneId: network.outputs.privateDnsZoneIds.cosmosDb
    aiSearchDnsZoneId: network.outputs.privateDnsZoneIds.aiSearch
    aiFoundryDnsZoneId: network.outputs.privateDnsZoneIds.aiFoundry
    openAiDnsZoneId: network.outputs.privateDnsZoneIds.openAi
    aiServicesDnsZoneId: network.outputs.privateDnsZoneIds.aiServices
    appConfigDnsZoneId: network.outputs.privateDnsZoneIds.appConfig
    logAnalyticsCustomerId: observability.outputs.logAnalyticsCustomerId
    logAnalyticsPrimaryKey: observability.outputs.logAnalyticsPrimaryKey
  }
}

// Storage Update Module - Updates app storage network rules to allow AML workspace and AI Search access (must run after apps)
module storageUpdate 'modules/storage-update.bicep' = if (enableAML || enableAISearch) {
  name: 'storage-update-deployment'
  params: {
    location: location
    ip_list: ip_list
    enableAML: enableAML
    enableAISearch: enableAISearch
    amlWorkspaceId: apps.outputs.amlWorkspaceId
    aiSearchId: apps.outputs.aiSearchId
    appStorageAccountName: storage.outputs.appStorageAccountName
  }
  dependsOn: [
    rbac
  ]
}

// =====================================================
// Outputs
// =====================================================

// AML outputs
output aml_storage_name string = storage.outputs.amlStorageAccountName
output aml_id string = apps.outputs.amlWorkspaceId
output aml_tenant_id string = subscription().tenantId
output aml_workspace_name string = apps.outputs.amlWorkspaceName
output aml_compute_name string = apps.outputs.amlComputeName
output app_job_input_datastore string = apps.outputs.amlInputDatastoreName
output app_job_output_datastore string = apps.outputs.amlOutputDatastoreName

// Storage outputs
output catalog_storage_account_name string = storage.outputs.catalogStorageAccountName
output apps_storage_account_name string = storage.outputs.appStorageAccountName
output ground_truths_container_name string = storage.outputs.groundTruthsContainerName

// Security outputs
output key_vault_name string = security.outputs.keyVaultName
output managed_identity_id string = security.outputs.managedIdentityClientId
output aml_managed_identity_id string = security.outputs.managedIdentityClientId
output container_registry_name string = security.outputs.containerRegistryName

// Observability outputs
output app_insights_connection_string string = observability.outputs.appInsightsConnectionString

// Feature flags
output enableAML bool = enableAML

// CosmosDB outputs
output cosmos_db_name string = apps.outputs.cosmosDbName

// AI Search outputs
output ai_search_name string = apps.outputs.aiSearchName
output ai_search_endpoint string = apps.outputs.aiSearchEndpoint

// AI Foundry outputs
output ai_foundry_project_endpoint string = apps.outputs.aiFoundryProjectEndpoint
output ai_foundry_model_deployment string = apps.outputs.gpt41DeploymentName
output azure_openai_endpoint string = apps.outputs.azureOpenAiEndpoint
output azure_openai_api_version string = apps.outputs.azureOpenAiApiVersion
output azure_openai_embedding_deployment string = apps.outputs.embeddingDeploymentName
output azure_openai_embedding_model string = apps.outputs.embeddingModelName

// Container App Environment outputs
output container_app_environment_name string = apps.outputs.containerAppEnvironmentName

// App Configuration outputs
output app_configuration_name string = apps.outputs.appConfigurationName
output app_configuration_endpoint string = apps.outputs.appConfigurationEndpoint
