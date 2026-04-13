// Observability module - Log Analytics and Application Insights
targetScope = 'resourceGroup'

param location string
param prefix string
param env_flag string

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: '${prefix}-${env_flag}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-${env_flag}-ai'
  location: location
  kind: 'web'
  properties: {
    RetentionInDays: 30
    IngestionMode: 'LogAnalytics'
    Application_Type: 'web'
    Flow_Type: 'Redfield'
    Request_Source: 'IbizaAIExtension'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// Outputs
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
output logAnalyticsCustomerId string = logAnalyticsWorkspace.properties.customerId
@description('Primary shared key for Log Analytics - use getSecret in consuming module')
#disable-next-line outputs-should-not-contain-secrets
output logAnalyticsPrimaryKey string = logAnalyticsWorkspace.listKeys().primarySharedKey
output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output appInsightsConnectionString string = appInsights.properties.ConnectionString
