// Storage module - Storage Accounts, Blob Services, Containers, and Private Endpoints
targetScope = 'resourceGroup'

param location string
param prefix string
param env_flag string
param ip_list string
param enableAML bool = false
param enableCatalog bool = false

// Network params for private endpoints
param resourcesSubnetId string
param blobDnsZoneId string
param queueDnsZoneId string
param tableDnsZoneId string

// App data storage account (always created)
resource appStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: '${prefix}${env_flag}appsa'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
          action: 'Allow'
        }
      ]
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

// Catalog storage account (conditional)
resource catalogStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = if (enableCatalog) {
  name: '${prefix}${env_flag}catalogsa'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
          action: 'Allow'
        }
      ]
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

// AML storage account (conditional)
resource amlStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = if (enableAML) {
  name: '${prefix}${env_flag}amlsa'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
          action: 'Allow'
        }
      ]
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

// Blob services and containers for app storage
resource appStorageBlobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: appStorageAccount
  name: 'default'
}

resource containerGroundTruths 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: appStorageBlobService
  name: 'groundtruths'
  properties: { publicAccess: 'None' }
}

resource containerBronze 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: appStorageBlobService
  name: 'bronze'
  properties: { publicAccess: 'None' }
}

resource containerSearchIndexEmbedFiles 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: appStorageBlobService
  name: 'searchindexembedfiles'
  properties: { publicAccess: 'None' }
}

resource containerJobOutput 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: appStorageBlobService
  name: 'joboutput'
  properties: { publicAccess: 'None' }
}

// Private Endpoints for App Storage
resource appStoragePrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: '${prefix}-${env_flag}-blob-app-sa-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'storageaccount'
        properties: {
          privateLinkServiceId: appStorageAccount.id
          groupIds: ['blob']
        }
      }
    ]
  }
}

resource appStoragePeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: appStoragePrivateEndpoint
  name: 'appstorageblob-dnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: blobDnsZoneId }
      }
    ]
  }
}

// Private Endpoint for Catalog Storage (conditional)
resource catalogStoragePrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = if (enableCatalog) {
  name: '${prefix}-${env_flag}-blob-catalog-sa-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'storageaccount'
        properties: {
          privateLinkServiceId: catalogStorageAccount.id
          groupIds: ['blob']
        }
      }
    ]
  }
}

resource catalogStoragePeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = if (enableCatalog) {
  parent: catalogStoragePrivateEndpoint
  name: 'catalogstorageblob-dnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: blobDnsZoneId }
      }
    ]
  }
}

// Private Endpoints for AML Storage (blob, queue, table)
var amlStorageResources = ['blob', 'queue', 'table']
var amlDnsZoneIds = [blobDnsZoneId, queueDnsZoneId, tableDnsZoneId]

@batchSize(1) // Deploy one at a time to avoid storage account exclusive access conflicts
resource amlStoragePrivateEndpoints 'Microsoft.Network/privateEndpoints@2024-07-01' = [
  for (resource, i) in amlStorageResources: if (enableAML) {
    name: '${prefix}-${env_flag}-${resource}-aml-sa-pe'
    location: location
    properties: {
      subnet: { id: resourcesSubnetId }
      privateLinkServiceConnections: [
        {
          name: 'storageaccount'
          properties: {
            privateLinkServiceId: amlStorageAccount.id
            groupIds: [resource]
          }
        }
      ]
    }
  }
]

resource amlStoragePeDnsGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = [
  for (resource, i) in amlStorageResources: if (enableAML) {
    parent: amlStoragePrivateEndpoints[i]
    name: 'amlstorage${resource}-dnsgroup'
    properties: {
      privateDnsZoneConfigs: [
        {
          name: 'config1'
          properties: { privateDnsZoneId: amlDnsZoneIds[i] }
        }
      ]
    }
  }
]

// Outputs
output appStorageAccountId string = appStorageAccount.id
output appStorageAccountName string = appStorageAccount.name
output catalogStorageAccountId string = enableCatalog ? catalogStorageAccount.id : ''
output catalogStorageAccountName string = enableCatalog ? catalogStorageAccount.name : ''
output amlStorageAccountId string = enableAML ? amlStorageAccount.id : ''
output amlStorageAccountName string = enableAML ? amlStorageAccount.name : ''
output groundTruthsContainerName string = containerGroundTruths.name
output jobOutputContainerName string = containerJobOutput.name
