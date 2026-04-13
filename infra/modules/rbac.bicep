// RBAC module - Storage Role Assignments
targetScope = 'resourceGroup'

param prefix string
param managedIdentityPrincipalId string
param user_object_id string
param enableAML bool
param enableCatalog bool
param enableAppConfiguration bool
param amlStorageAccountName string
param appStorageAccountName string
param catalogStorageAccountName string
param appConfigurationName string
param amlWorkspaceSystemIdentityPrincipalId string

// Reference existing storage accounts
resource amlStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = if (enableAML) {
  name: amlStorageAccountName
}

resource appStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: appStorageAccountName
}

resource catalogStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = if (enableCatalog) {
  name: catalogStorageAccountName
}

resource appConfiguration 'Microsoft.AppConfiguration/configurationStores@2024-05-01' existing = if (enableAppConfiguration) {
  name: appConfigurationName
}

// Storage role definition IDs
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

// App Configuration role definition ID
var appConfigDataOwnerRoleId = '5ae67dd6-50cb-40e7-96ff-dc2bfa4b606b'

// AML Storage - Managed Identity
resource amlStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAML && amlStorageAccountName != '') {
  name: guid(prefix, amlStorageAccount.id, managedIdentityPrincipalId, storageBlobDataContributorRoleId)
  scope: amlStorageAccount
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource amlStorageQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAML && amlStorageAccountName != '') {
  name: guid(prefix, amlStorageAccount.id, managedIdentityPrincipalId, storageQueueDataContributorRoleId)
  scope: amlStorageAccount
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
  }
}

resource amlStorageTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAML && amlStorageAccountName != '') {
  name: guid(prefix, amlStorageAccount.id, managedIdentityPrincipalId, storageTableDataContributorRoleId)
  scope: amlStorageAccount
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
  }
}

// AML Storage - User
resource amlStorageBlobContributorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAML && amlStorageAccountName != '') {
  name: guid(prefix, amlStorageAccount.id, user_object_id, storageBlobDataContributorRoleId)
  scope: amlStorageAccount
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// App Storage - Managed Identity
resource appStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, appStorageAccount.id, managedIdentityPrincipalId, storageBlobDataContributorRoleId)
  scope: appStorageAccount
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// App Storage - User
resource appStorageBlobContributorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, appStorageAccount.id, user_object_id, storageBlobDataContributorRoleId)
  scope: appStorageAccount
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// App Storage - AML Workspace System Identity (CRITICAL for datastores)
resource appStorageBlobContributorAMLWorkspace 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAML && amlWorkspaceSystemIdentityPrincipalId != '') {
  name: guid(prefix, appStorageAccount.id, amlWorkspaceSystemIdentityPrincipalId, storageBlobDataContributorRoleId)
  scope: appStorageAccount
  properties: {
    principalId: amlWorkspaceSystemIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// Catalog Storage - Managed Identity
resource catalogStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCatalog && catalogStorageAccountName != '') {
  name: guid(prefix, catalogStorageAccount.id, managedIdentityPrincipalId, storageBlobDataContributorRoleId)
  scope: catalogStorageAccount
  properties: {
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// Catalog Storage - User
resource catalogStorageBlobContributorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCatalog && catalogStorageAccountName != '') {
  name: guid(prefix, catalogStorageAccount.id, user_object_id, storageBlobDataContributorRoleId)
  scope: catalogStorageAccount
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// App Configuration - User (Data Owner)
resource appConfigDataOwnerUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableAppConfiguration && appConfigurationName != '') {
  name: guid(prefix, appConfiguration.id, user_object_id, appConfigDataOwnerRoleId)
  scope: appConfiguration
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigDataOwnerRoleId)
  }
}
