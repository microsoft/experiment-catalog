// Storage Update module - Updates app storage account network rules to allow AML workspace and AI Search access
targetScope = 'resourceGroup'

param location string
param ip_list string
param enableAML bool
param enableAISearch bool
param amlWorkspaceId string
param aiSearchId string
param appStorageAccountName string

// Build resource access rules dynamically based on enabled features
var amlAccessRule = enableAML && amlWorkspaceId != '' ? [{
  tenantId: subscription().tenantId
  resourceId: amlWorkspaceId
}] : []

var aiSearchAccessRule = enableAISearch && aiSearchId != '' ? [{
  tenantId: subscription().tenantId
  resourceId: aiSearchId
}] : []

var resourceAccessRules = concat(amlAccessRule, aiSearchAccessRule)

// Update app storage account network rules to allow AML workspace and/or AI Search
resource appStorageAccountUpdate 'Microsoft.Storage/storageAccounts@2025-01-01' = if ((enableAML && amlWorkspaceId != '') || (enableAISearch && aiSearchId != '')) {
  name: appStorageAccountName
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
      resourceAccessRules: resourceAccessRules
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}
