// Security module - Managed Identity, Key Vault, Container Registry
targetScope = 'resourceGroup'

param location string
param prefix string
param env_flag string
param ip_list string
param user_object_id string

// Network params for private endpoints
param resourcesSubnetId string
param keyVaultDnsZoneId string
param acrDnsZoneId string

// Managed Identity
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-01-31-preview' = {
  name: '${prefix}-${env_flag}-mi'
  location: location
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: '${prefix}-${env_flag}-kv'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
        }
      ]
    }
  }
}

// Key Vault Private Endpoint
resource keyVaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: '${prefix}-${env_flag}-kv-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'keyvault'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: ['vault']
        }
      }
    ]
  }
}

resource keyVaultPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: keyVaultPrivateEndpoint
  name: 'keyvaultdnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: keyVaultDnsZoneId }
      }
    ]
  }
}

// Key Vault RBAC - Managed Identity (Secrets User)
resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, keyVault.id, managedIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
  }
}

// Key Vault RBAC - User (Secrets Officer)
resource kvSecretsOfficerUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, keyVault.id, user_object_id, 'KeyVaultSecretsOfficer')
  scope: keyVault
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
    )
  }
}

// Container Registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: '${prefix}${env_flag}acr'
  location: location
  sku: {
    name: 'Premium'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    networkRuleSet: {
      defaultAction: 'Deny'
      ipRules: [
        for ip in split(ip_list, ','): {
          value: ip
          action: 'Allow'
        }
      ]
    }
    zoneRedundancy: 'Disabled'
    networkRuleBypassOptions: 'AzureServices'
  }
}

// Container Registry Private Endpoint
resource acrPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: '${prefix}-${env_flag}-acr-pe'
  location: location
  properties: {
    subnet: { id: resourcesSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'registry'
        properties: {
          privateLinkServiceId: containerRegistry.id
          groupIds: ['registry']
        }
      }
    ]
  }
}

resource acrPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: acrPrivateEndpoint
  name: 'acrdnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: { privateDnsZoneId: acrDnsZoneId }
      }
    ]
  }
}

// ACR RBAC - Managed Identity (AcrPull)
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, containerRegistry.id, managedIdentity.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
  }
}

// ACR RBAC - Managed Identity (AcrPush)
resource acrPushRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, containerRegistry.id, managedIdentity.id, 'AcrPush')
  scope: containerRegistry
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '8311e382-0749-4cb8-b61a-304f252e45ec'
    )
  }
}

// ACR RBAC - User (AcrPull)
resource acrPullUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, containerRegistry.id, user_object_id, 'AcrPull')
  scope: containerRegistry
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
  }
}

// ACR RBAC - User (AcrPush)
resource acrPushUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(prefix, containerRegistry.id, user_object_id, 'AcrPush')
  scope: containerRegistry
  properties: {
    principalId: user_object_id
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '8311e382-0749-4cb8-b61a-304f252e45ec'
    )
  }
}

// Outputs
output managedIdentityId string = managedIdentity.id
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output containerRegistryId string = containerRegistry.id
output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
