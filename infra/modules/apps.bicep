// Apps module - AML, CosmosDB, AI Search, AI Foundry, Container Apps
targetScope = 'resourceGroup'

param location string
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
param enableAppConfiguration bool = false

// Dependencies
param managedIdentityId string
param managedIdentityPrincipalId string
param appInsightsId string
param keyVaultId string
param containerRegistryId string
param amlStorageAccountId string
param appStorageAccountName string
param groundTruthsContainerName string
param jobOutputContainerName string

// Network params
param resourcesSubnetId string
param amlComputeSubnetId string
param appsSubnetId string
param cosmosDbDnsZoneId string
param aiSearchDnsZoneId string
param aiFoundryDnsZoneId string
param openAiDnsZoneId string
param aiServicesDnsZoneId string
param appConfigDnsZoneId string

// Observability for Container Apps
param logAnalyticsCustomerId string
@secure()
param logAnalyticsPrimaryKey string

// =====================================================
// Azure Machine Learning
// =====================================================
resource amlWorkspace 'Microsoft.MachineLearningServices/workspaces@2025-06-01' = if (enableAML) {
  name: '${prefix}-${env_flag}-aml'
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    friendlyName: prefix
    applicationInsights: appInsightsId
    containerRegistry: containerRegistryId
    description: 'Azure Machine Learning workspace for running parallel jobs'
    keyVault: keyVaultId
    storageAccount: amlStorageAccountId
    managedNetwork: {
      isolationMode: 'Disabled'
    }
    enableDataIsolation: false
    systemDatastoresAuthMode: 'identity' // Use managed identity instead of access keys for default datastores
  }
}

resource amlInputDatastore 'Microsoft.MachineLearningServices/workspaces/datastores@2025-06-01' = if (enableAML) {
  parent: amlWorkspace
  name: 'amljobinput'
  properties: {
    description: 'AML Ground Truths Job Input'
    datastoreType: 'AzureBlob'
    credentials: { credentialsType: 'None' }
    subscriptionId: subscription().subscriptionId
    resourceGroup: resourceGroup().name
    accountName: appStorageAccountName
    containerName: groundTruthsContainerName
    serviceDataAccessAuthIdentity: 'WorkspaceSystemAssignedIdentity'
  }
}

resource amlOutputDatastore 'Microsoft.MachineLearningServices/workspaces/datastores@2025-06-01' = if (enableAML) {
  parent: amlWorkspace
  name: 'amljoboutput'
  properties: {
    description: 'AML Job Output'
    datastoreType: 'AzureBlob'
    credentials: { credentialsType: 'None' }
    subscriptionId: subscription().subscriptionId
    resourceGroup: resourceGroup().name
    accountName: appStorageAccountName
    containerName: jobOutputContainerName
    serviceDataAccessAuthIdentity: 'WorkspaceSystemAssignedIdentity'
  }
}

resource amlComputeCluster 'Microsoft.MachineLearningServices/workspaces/computes@2025-06-01' = if (enableAML) {
  parent: amlWorkspace
  name: 'aml-compute-cluster'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    computeType: 'AmlCompute'
    computeLocation: location
    description: 'VNET integrated compute cluster'
    properties: {
      scaleSettings: {
        minNodeCount: 0
        maxNodeCount: 3
        nodeIdleTimeBeforeScaleDown: 'PT3600S'
      }
      subnet: { id: amlComputeSubnetId }
      enableNodePublicIp: true
      osType: 'Linux'
      vmPriority: 'Dedicated'
      vmSize: 'Standard_D3_v2'
    }
  }
}

// =====================================================
// CosmosDB
// =====================================================
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2025-11-01-preview' = if (enableCosmosDB) {
  name: '${prefix}-cdb'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    publicNetworkAccess: 'Enabled'
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: []
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    isVirtualNetworkFilterEnabled: false
    virtualNetworkRules: []
    ipRules: [
      for ip in split(ip_list, ','): {
        ipAddressOrRange: ip
      }
    ]
    enableFreeTier: false
    enableAnalyticalStorage: false
    createMode: 'Default'
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

resource cosmosDbPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = if (enableCosmosDB) {
  name: '${prefix}-cdb-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'cosmosdb'
        properties: {
          privateLinkServiceId: cosmosDb.id
          groupIds: ['Sql']
        }
      }
    ]
  }
}

resource cosmosDbPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = if (enableCosmosDB) {
  parent: cosmosDbPrivateEndpoint
  name: 'cosmosdbdnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: cosmosDbDnsZoneId }
      }
    ]
  }
}

// CosmosDB RBAC
resource cosmosDbContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCosmosDB) {
  name: guid(prefix, cosmosDb.id, managedIdentityPrincipalId, 'CosmosDBDataContributor')
  scope: cosmosDb
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c'
    )
  }
}

resource cosmosDbContributorUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCosmosDB) {
  name: guid(prefix, cosmosDb.id, user_object_id, 'CosmosDBDataContributor')
  scope: cosmosDb
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c'
    )
  }
}

// =====================================================
// Azure AI Search
// =====================================================
resource aiSearch 'Microsoft.Search/searchServices@2025-05-01' = if (enableAISearch) {
  name: '${prefix}-${env_flag}-ais'
  location: location
  sku: { name: 'standard' }
  identity: { type: 'SystemAssigned' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'Default'
    publicNetworkAccess: 'Enabled'
    networkRuleSet: {
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
        }
      ]
      bypass: 'None'
    }
    disableLocalAuth: true
  }
}

resource aiSearchPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = if (enableAISearch) {
  name: '${prefix}-${env_flag}-search-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'aisearch'
        properties: {
          privateLinkServiceId: aiSearch.id
          groupIds: ['searchService']
        }
      }
    ]
  }
}

resource aiSearchPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = if (enableAISearch) {
  parent: aiSearchPrivateEndpoint
  name: 'aisearchdnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: aiSearchDnsZoneId }
      }
    ]
  }
}

// AI Search RBAC - Search Index Data Contributor for User
var searchIndexDataContributorRoleId = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
resource aiSearchIndexDataContributorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAISearch) {
  name: guid(prefix, aiSearch.id, user_object_id, searchIndexDataContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
  }
}

// AI Search RBAC - Search Service Contributor for User
var searchServiceContributorRoleId = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
resource aiSearchServiceContributorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAISearch) {
  name: guid(prefix, aiSearch.id, user_object_id, searchServiceContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
  }
}

// AI Search RBAC - Search Index Data Contributor for User Assigned Managed Identity
resource aiSearchIndexDataContributorManagedIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAISearch) {
  name: guid(prefix, aiSearch.id, managedIdentityPrincipalId, searchIndexDataContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
  }
}

// AI Search RBAC - Search Service Contributor for User Assigned Managed Identity
resource aiSearchServiceContributorManagedIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAISearch) {
  name: guid(prefix, aiSearch.id, managedIdentityPrincipalId, searchServiceContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
  }
}

// Reference existing app storage account for AI Search RBAC
resource appStorageAccountRef 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: appStorageAccountName
}

// AI Search RBAC - Storage Blob Data Reader for AI Search identity on App Storage
// Note: Network access rules for AI Search are handled in storage-update.bicep module
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
resource appStorageBlobReaderForSearch 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAISearch) {
  name: guid(prefix, appStorageAccountRef.id, aiSearch.id, storageBlobDataReaderRoleId)
  scope: appStorageAccountRef
  properties: {
    principalId: aiSearch!.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
  }
}

// =====================================================
// Azure AI Foundry
// =====================================================
resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = if (enableAIFoundry) {
  name: '${prefix}-${env_flag}-aif'
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: '${prefix}-aif'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
        }
      ]
      virtualNetworkRules: []
    }
    allowProjectManagement: true
    disableLocalAuth: true
  }
}

resource aiUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry) {
  name: guid(prefix, aiFoundry.id, managedIdentityPrincipalId, 'AzureAIUser')
  scope: aiFoundry
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '53ca6127-db72-4b80-b1b0-d745d6d5456d'
    )
  }
}

// AI Foundry RBAC - Cognitive Services OpenAI User for AI Search identity
var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
resource aiFoundryOpenAIUserForSearch 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry && enableAISearch) {
  name: guid(prefix, aiFoundry.id, aiSearch.id, cognitiveServicesOpenAIUserRoleId)
  scope: aiFoundry
  properties: {
    principalId: aiSearch!.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
  }
}

// AI Foundry RBAC - Cognitive Services OpenAI User for User
resource aiFoundryOpenAIUserForUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry) {
  name: guid(prefix, aiFoundry.id, user_object_id, cognitiveServicesOpenAIUserRoleId)
  scope: aiFoundry
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
  }
}

// AI Foundry RBAC - Azure AI User for User (required for Agent operations)
var azureAIUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
resource aiFoundryAIUserForUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry) {
  name: guid(prefix, aiFoundry.id, user_object_id, azureAIUserRoleId)
  scope: aiFoundry
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
  }
}

// AI Foundry RBAC - Search Index Data Contributor for AI Foundry identity on AI Search
resource aiSearchIndexDataContributorForFoundry 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry && enableAISearch) {
  name: guid(prefix, aiSearch.id, aiFoundry.id, searchIndexDataContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: aiFoundry!.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
  }
}

// AI Foundry RBAC - Search Service Contributor for AI Foundry identity on AI Search
resource aiSearchServiceContributorForFoundry 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAIFoundry && enableAISearch) {
  name: guid(prefix, aiSearch.id, aiFoundry.id, searchServiceContributorRoleId)
  scope: aiSearch
  properties: {
    principalId: aiFoundry!.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
  }
}

// AI Foundry - Deploy text-embedding model
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (enableAIFoundry) {
  parent: aiFoundry
  name: 'text-embedding-3-large'
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-large'
      version: '1'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// AI Foundry - Deploy gpt-4.1 model
resource gpt41Deployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (enableAIFoundry) {
  parent: aiFoundry
  name: 'gpt-4.1'
  sku: {
    name: 'Standard'
    capacity: 100
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1'
      version: '2025-04-14'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
  dependsOn: [
    embeddingDeployment
  ]
}

resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = if (enableAIFoundry) {
  name: foundry_project_name
  parent: aiFoundry
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {}
  dependsOn: [
    embeddingDeployment
    gpt41Deployment
  ]
}

resource aiFoundryPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = if (enableAIFoundry) {
  name: '${prefix}-${env_flag}-aif-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: '${prefix}-aif-pe-connection'
        properties: {
          privateLinkServiceId: aiFoundry.id
          groupIds: ['account']
        }
      }
    ]
  }
  dependsOn: [
    embeddingDeployment
    gpt41Deployment
  ]
}

resource aiFoundryPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = if (enableAIFoundry) {
  parent: aiFoundryPrivateEndpoint
  name: 'aifoundrydnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices'
        properties: { privateDnsZoneId: aiFoundryDnsZoneId }
      }
      {
        name: 'openai'
        properties: { privateDnsZoneId: openAiDnsZoneId }
      }
      {
        name: 'aiservices'
        properties: { privateDnsZoneId: aiServicesDnsZoneId }
      }
    ]
  }
}

// =====================================================
// Container App Environment
// =====================================================
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = if (enableContainerAppEnvironment) {
  name: '${prefix}-${env_flag}-cae'
  location: location
  properties: {
    workloadProfiles: [
      {
        name: 'ai-apps'
        minimumCount: 0
        maximumCount: 3
        workloadProfileType: 'D4'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimaryKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: appsSubnetId
      internal: false
    }
    zoneRedundant: false
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
}

// =====================================================
// Azure App Configuration
// =====================================================
resource appConfiguration 'Microsoft.AppConfiguration/configurationStores@2024-05-01' = if (enableAppConfiguration) {
  name: '${prefix}-${env_flag}-appconfig'
  location: location
  sku: {
    name: 'Developer'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource appConfigPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = if (enableAppConfiguration) {
  name: '${prefix}-appconfig-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'appconfig'
        properties: {
          privateLinkServiceId: appConfiguration.id
          groupIds: ['configurationStores']
        }
      }
    ]
  }
}

resource appConfigPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = if (enableAppConfiguration) {
  parent: appConfigPrivateEndpoint
  name: 'appconfigdnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: appConfigDnsZoneId }
      }
    ]
  }
}

// Outputs
output amlWorkspaceId string = enableAML ? amlWorkspace.id : ''
output amlWorkspaceName string = enableAML ? amlWorkspace.name : ''
output amlWorkspaceSystemIdentityPrincipalId string = enableAML ? amlWorkspace!.identity.principalId : ''
output amlComputeName string = enableAML ? amlComputeCluster.name : ''
output amlInputDatastoreName string = enableAML ? amlInputDatastore.name : ''
output amlOutputDatastoreName string = enableAML ? amlOutputDatastore.name : ''
output cosmosDbName string = enableCosmosDB ? cosmosDb.name : ''
output aiSearchId string = enableAISearch ? aiSearch.id : ''
output aiSearchName string = enableAISearch ? aiSearch.name : ''
output aiSearchEndpoint string = enableAISearch ? 'https://${aiSearch.name}.search.windows.net' : ''
output aiFoundryName string = enableAIFoundry ? aiFoundry.name : ''
output aiFoundryProjectEndpoint string = enableAIFoundry ? 'https://${aiFoundry!.properties.customSubDomainName}.services.ai.azure.com/api/projects/${foundry_project_name}' : ''
output embeddingDeploymentName string = enableAIFoundry ? embeddingDeployment.name : ''
output embeddingModelName string = enableAIFoundry ? embeddingDeployment!.properties.model.name : ''
output azureOpenAiEndpoint string = enableAIFoundry ? aiFoundry!.properties.endpoint : ''
output gpt41DeploymentName string = enableAIFoundry ? gpt41Deployment.name : ''
output azureOpenAiApiVersion string = '2024-12-01-preview'
output containerAppEnvironmentId string = enableContainerAppEnvironment ? containerAppEnvironment.id : ''
output containerAppEnvironmentName string = enableContainerAppEnvironment ? containerAppEnvironment.name : ''
output appConfigurationName string = enableAppConfiguration ? appConfiguration.name : ''
output appConfigurationEndpoint string = enableAppConfiguration ? appConfiguration!.properties.endpoint : ''
