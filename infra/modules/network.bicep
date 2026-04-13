// Network module - VNet, NSGs, Subnets, Private DNS Zones
targetScope = 'resourceGroup'

param location string
param prefix string
param env_flag string

var subnets = [
  'resources'
  'amlcompute'
  'apps'
]

var vnet_name = '${prefix}-${env_flag}-vnet'

resource nsgs 'Microsoft.Network/networkSecurityGroups@2024-07-01' = [
  for subnetName in subnets: {
    name: '${vnet_name}-${subnetName}-nsg'
    location: location
    properties: {
      securityRules: []
    }
  }
]

resource vnet 'Microsoft.Network/virtualNetworks@2024-07-01' = {
  name: vnet_name
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      for (subnetName, i) in subnets: {
        name: subnetName
        properties: {
          addressPrefix: '10.0.${i}.0/24'
          privateEndpointNetworkPolicies: (subnetName == 'resources') ? 'NetworkSecurityGroupEnabled' : 'Disabled'
          networkSecurityGroup: {
            id: nsgs[i].id
          }
          delegations: (subnetName == 'amlcompute')
            ? [
                {
                  name: 'Microsoft.MachineLearningServices/workspaceComputes'
                  properties: {
                    serviceName: 'Microsoft.MachineLearningServices/workspaceComputes'
                  }
                  type: 'Microsoft.Network/virtualNetworks/subnets/delegations'
                }
              ]
            : (subnetName == 'apps')
                ? [
                    {
                      name: 'Microsoft.App/environments'
                      properties: {
                        serviceName: 'Microsoft.App/environments'
                      }
                      type: 'Microsoft.Network/virtualNetworks/subnets/delegations'
                    }
                  ]
                : []
        }
      }
    ]
  }
}

// Private DNS Zones
resource privateDnsZoneKeyVault 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneAcr 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.azurecr.io'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneBlobStorage 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneQueueStorage 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.queue.${environment().suffixes.storage}'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneTableStorage 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.table.${environment().suffixes.storage}'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneCosmosDb 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.documents.azure.com'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneAiSearch 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.search.windows.net'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneAiFoundry 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.cognitiveservices.azure.com'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneOpenAi 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.openai.azure.com'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneAiServices 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.services.ai.azure.com'
  location: 'global'
  dependsOn: [vnet]
}

resource privateDnsZoneAppConfig 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.azconfig.io'
  location: 'global'
  dependsOn: [vnet]
}

// VNet Links for DNS Zones
resource keyVaultDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneKeyVault
  name: '${privateDnsZoneKeyVault.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource acrDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneAcr
  name: '${privateDnsZoneAcr.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource blobDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneBlobStorage
  name: '${privateDnsZoneBlobStorage.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource queueDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneQueueStorage
  name: '${privateDnsZoneQueueStorage.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource tableDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneTableStorage
  name: '${privateDnsZoneTableStorage.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource cosmosDbDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneCosmosDb
  name: '${privateDnsZoneCosmosDb.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource aiSearchDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneAiSearch
  name: '${privateDnsZoneAiSearch.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource aiFoundryDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneAiFoundry
  name: '${privateDnsZoneAiFoundry.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource openAiDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneOpenAi
  name: '${privateDnsZoneOpenAi.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource aiServicesDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneAiServices
  name: '${privateDnsZoneAiServices.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource appConfigDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZoneAppConfig
  name: '${privateDnsZoneAppConfig.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// Outputs
output vnetId string = vnet.id
output vnetName string = vnet.name
output resourcesSubnetId string = vnet.properties.subnets[0].id
output amlComputeSubnetId string = vnet.properties.subnets[1].id
output appsSubnetId string = vnet.properties.subnets[2].id

output privateDnsZoneIds object = {
  keyVault: privateDnsZoneKeyVault.id
  acr: privateDnsZoneAcr.id
  blob: privateDnsZoneBlobStorage.id
  queue: privateDnsZoneQueueStorage.id
  table: privateDnsZoneTableStorage.id
  cosmosDb: privateDnsZoneCosmosDb.id
  aiSearch: privateDnsZoneAiSearch.id
  aiFoundry: privateDnsZoneAiFoundry.id
  openAi: privateDnsZoneOpenAi.id
  aiServices: privateDnsZoneAiServices.id
  appConfig: privateDnsZoneAppConfig.id
}
