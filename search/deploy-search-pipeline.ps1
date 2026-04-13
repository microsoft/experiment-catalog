<#
.SYNOPSIS
    Deploys Azure AI Search resources: data source, skillset, index, and indexer.

.DESCRIPTION
    This script creates or updates the complete Azure AI Search pipeline including:
    - Data source (Azure Blob Storage connection)
    - Skillset (with Azure OpenAI embedding skill and custom frontmatter parsing skill)
    - Index (with vector search configuration)
    - Indexer (orchestrates the pipeline)
    
    Required values are loaded from a .env file in the same directory as the script.

.NOTES
    Required .env file format:
        AZURE_AI_SEARCH=your-search-service-name
        AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
        AZURE_STORAGE_CONTAINER_NAME=your-container
        AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com
        AZURE_OPENAI_EMBEDDING_DEPLOYMENT=your-embedding-deployment-name
        AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
        INDEX_NAME=your-index-name           # Base name for index, skillset, and indexer

    Optional chunking configuration (with defaults):
        CHUNK_SIZE=2000          # Max characters per chunk (300-50000, default: 2000)
        CHUNK_OVERLAP=500        # Overlap between chunks (0 to CHUNK_SIZE-1, default: 500)

    Optional vectorizer managed identity:
        AZURE_SEARCH_USER_ASSIGNED_IDENTITY=/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{name}
                                 # If not set, the search service's system-assigned managed identity is used

    Optional index versioning:
        INDEX_VERSION=1-0        # Version suffix appended to resource names
                                 # e.g., INDEX_NAME=myapp with INDEX_VERSION=1-0 creates:
                                 #   - myapp-index-1-0
                                 #   - myapp-skillset-1-0
                                 #   - myapp-indexer-1-0

.EXAMPLE
    .\deploy-search-pipeline.ps1
#>

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFilePath = Join-Path $scriptDir ".env"

# Function to load .env file
function Get-EnvFileValues {
    param([string]$Path)
    
    $envValues = @{}
    
    if (Test-Path $Path) {
        Get-Content $Path | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith('#')) {
                $parts = $line -split '=', 2
                if ($parts.Count -eq 2) {
                    $key = $parts[0].Trim()
                    $value = $parts[1].Trim()
                    $value = $value -replace '^["'']|["'']$', ''
                    $envValues[$key] = $value
                }
            }
        }
    }
    
    return $envValues
}

# Function to apply configuration to datasource JSON
function Set-DatasourceConfig {
    param(
        [string]$Content,
        [string]$SubscriptionId,
        [string]$ResourceGroup,
        [string]$StorageAccountName,
        [string]$ContainerName
    )
    
    $json = $Content | ConvertFrom-Json -Depth 20
    
    $connectionString = "ResourceId=/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$StorageAccountName;"
    $json.credentials.connectionString = $connectionString
    $json.container.name = $ContainerName
    
    return ($json | ConvertTo-Json -Depth 20)
}

# Function to apply configuration to skillset JSON
function Set-SkillsetConfig {
    param(
        [string]$Content,
        [string]$OpenAIEndpoint,
        [string]$OpenAIDeployment,
        [string]$OpenAIModel,
        [int]$ChunkSize,
        [int]$ChunkOverlap,
        [string]$FunctionUri,
        [string]$AuthResourceId
    )
    
    $json = $Content | ConvertFrom-Json -Depth 20
    
    foreach ($skill in $json.skills) {
        if ($skill.'@odata.type' -eq '#Microsoft.Skills.Text.SplitSkill') {
            $skill.maximumPageLength = $ChunkSize
            $skill.pageOverlapLength = $ChunkOverlap
        }
        if ($skill.'@odata.type' -eq '#Microsoft.Skills.Text.AzureOpenAIEmbeddingSkill') {
            $skill.resourceUri = $OpenAIEndpoint
            $skill.deploymentId = $OpenAIDeployment
            $skill.modelName = $OpenAIModel
        }
        if ($skill.'@odata.type' -eq '#Microsoft.Skills.Custom.WebApiSkill') {
            $skill.uri = $FunctionUri
            # Set authResourceId if configured, otherwise set to null for anonymous access
            if ($AuthResourceId) {
                $skill.authResourceId = $AuthResourceId
            } else {
                $skill.authResourceId = $null
            }
        }
    }
    
    return ($json | ConvertTo-Json -Depth 20)
}

# Function to apply vectorizer configuration to index JSON
function Set-IndexVectorizerConfig {
    param(
        [string]$Content,
        [string]$OpenAIEndpoint,
        [string]$OpenAIDeployment,
        [string]$OpenAIModel,
        [string]$UserAssignedIdentity,
        [int]$Dimension = 0
    )
    
    $json = $Content | ConvertFrom-Json -Depth 20
    
    # Override embedding dimension if specified
    if ($Dimension -gt 0) {
        foreach ($field in $json.fields) {
            if ($field.type -eq 'Collection(Edm.Single)' -and $field.PSObject.Properties.Name -contains 'dimensions') {
                $field.dimensions = $Dimension
            }
        }
    }
    
    # Configure vectorizers if present
    if ($json.vectorSearch -and $json.vectorSearch.vectorizers) {
        foreach ($vectorizer in $json.vectorSearch.vectorizers) {
            if ($vectorizer.kind -eq 'azureOpenAI') {
                $vectorizer.azureOpenAIParameters.resourceUri = $OpenAIEndpoint
                $vectorizer.azureOpenAIParameters.deploymentId = $OpenAIDeployment
                $vectorizer.azureOpenAIParameters.modelName = $OpenAIModel
                
                # Configure managed identity authentication
                if ($UserAssignedIdentity) {
                    # Use user-assigned managed identity
                    $vectorizer.azureOpenAIParameters.authIdentity = @{
                        '@odata.type' = '#Microsoft.Azure.Search.DataUserAssignedIdentity'
                        'userAssignedIdentity' = $UserAssignedIdentity
                    }
                } else {
                    # Use system-assigned managed identity
                    $vectorizer.azureOpenAIParameters.authIdentity = @{
                        '@odata.type' = '#Microsoft.Azure.Search.DataNone'
                    }
                    # Remove authIdentity to use system-assigned identity (default)
                    $vectorizer.azureOpenAIParameters.PSObject.Properties.Remove('authIdentity')
                }
            }
        }
    }
    
    return ($json | ConvertTo-Json -Depth 20)
}

# Function to deploy a search resource
function Deploy-SearchResource {
    param(
        [string]$ResourceType,
        [string]$ResourceName,
        [string]$JsonContent,
        [string]$SearchEndpoint,
        [string]$ApiVersion
    )
    
    Write-Host "`nDeploying $ResourceType '$ResourceName'..." -ForegroundColor Cyan
    
    # Create temp file with processed content
    $tempFile = [System.IO.Path]::GetTempFileName()
    $JsonContent | Set-Content $tempFile -Encoding UTF8
    
    $url = "$SearchEndpoint/$ResourceType/$($ResourceName)?api-version=$ApiVersion"
    
    try {
        $response = az rest --method PUT --url $url --body "@$tempFile" --headers "Content-Type=application/json" --resource "https://search.azure.com" 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Failed to deploy $ResourceType." -ForegroundColor Red
            Write-Host "  Error: $response" -ForegroundColor Red
            return $false
        }
        
        Write-Host "  $ResourceType '$ResourceName' deployed successfully!" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "  Failed to deploy $ResourceType." -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        return $false
    }
    finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }
}

# Load environment variables from .env file
$envValues = Get-EnvFileValues -Path $envFilePath

# Get values from .env file
$SearchServiceName = $envValues["AZURE_AI_SEARCH"]
$StorageAccountName = $envValues["AZURE_STORAGE_ACCOUNT_NAME"]
$ContainerName = $envValues["AZURE_STORAGE_CONTAINER_NAME"]
$OpenAIEndpoint = $envValues["AZURE_OPENAI_ENDPOINT"]
$OpenAIDeployment = $envValues["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"]
$OpenAIModel = $envValues["AZURE_OPENAI_EMBEDDING_MODEL"]
$ResourceGroup = $envValues["AZURE_RESOURCE_GROUP"]
$IndexName = $envValues["INDEX_NAME"]
$IndexVersion = $envValues["INDEX_VERSION"]
$IndexDimension = if ($envValues["INDEX_DIMENSION"]) { [int]$envValues["INDEX_DIMENSION"] } else { 0 }

# User-assigned managed identity for Azure OpenAI vectorizer authentication
# Format: /subscriptions/{sub-id}/resourceGroups/{rg}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{identity-name}
$UserAssignedIdentity = $envValues["AZURE_SEARCH_USER_ASSIGNED_IDENTITY"]

# Support both Azure Function and Container App URIs
# AZURE_CONTAINER_APP_URI takes precedence if set
$SkillUri = $envValues["AZURE_CONTAINER_APP_URI"]
if (-not $SkillUri) {
    $SkillUri = $envValues["AZURE_FUNCTION_URI"]
}

# Support authResourceId for Entra ID authentication
# Azure AI Search requires the authResourceId to use the client application ID (GUID)
# Format: api://{client-id}/.default or {client-id}/.default
$ClientId = $envValues["AZURE_CONTAINER_APP_CLIENT_ID"]
if (-not $ClientId) {
    $ClientId = $envValues["AZURE_FUNCTION_CLIENT_ID"]
}

# Build authResourceId from client ID if available
if ($ClientId) {
    $AuthResourceId = "api://$ClientId/.default"
} else {
    # Fall back to explicit auth resource ID if client ID not available
    $AuthResourceId = $envValues["AZURE_CONTAINER_APP_AUTH_RESOURCE_ID"]
    if (-not $AuthResourceId) {
        $AuthResourceId = $envValues["AZURE_FUNCTION_AUTH_RESOURCE_ID"]
    }
    # Ensure authResourceId ends with /.default as required by Azure AI Search
    if ($AuthResourceId -and -not $AuthResourceId.EndsWith("/.default")) {
        $AuthResourceId = "$AuthResourceId/.default"
    }
}

# Chunk configuration with defaults
$ChunkSize = if ($envValues["CHUNK_SIZE"]) { [int]$envValues["CHUNK_SIZE"] } else { 2000 }
$ChunkOverlap = if ($envValues["CHUNK_OVERLAP"]) { [int]$envValues["CHUNK_OVERLAP"] } else { 500 }

# Validate chunk parameters
$chunkErrors = @()

# maximumPageLength: min 300, max 50000
if ($ChunkSize -lt 300 -or $ChunkSize -gt 50000) {
    $chunkErrors += "CHUNK_SIZE must be between 300 and 50000 (current: $ChunkSize)"
}

# pageOverlapLength: must be >= 0 and < maximumPageLength
if ($ChunkOverlap -lt 0) {
    $chunkErrors += "CHUNK_OVERLAP must be >= 0 (current: $ChunkOverlap)"
}
elseif ($ChunkOverlap -ge $ChunkSize) {
    $chunkErrors += "CHUNK_OVERLAP ($ChunkOverlap) must be less than CHUNK_SIZE ($ChunkSize)"
}

if ($chunkErrors.Count -gt 0) {
    Write-Host "`nInvalid chunk configuration!" -ForegroundColor Red
    foreach ($err in $chunkErrors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    exit 1
}

# Validate required values
$requiredValues = @{
    "AZURE_AI_SEARCH" = $SearchServiceName
    "AZURE_STORAGE_ACCOUNT_NAME" = $StorageAccountName
    "AZURE_STORAGE_CONTAINER_NAME" = $ContainerName
    "AZURE_OPENAI_ENDPOINT" = $OpenAIEndpoint
    "AZURE_OPENAI_EMBEDDING_DEPLOYMENT" = $OpenAIDeployment
    "AZURE_OPENAI_EMBEDDING_MODEL" = $OpenAIModel
    "INDEX_NAME" = $IndexName
    "AZURE_RESOURCE_GROUP" = $ResourceGroup
    "AZURE_CONTAINER_APP_URI or AZURE_FUNCTION_URI" = $SkillUri
}

$missingValues = @()
foreach ($key in $requiredValues.Keys) {
    if (-not $requiredValues[$key]) {
        $missingValues += $key
    }
}

if ($missingValues.Count -gt 0) {
    Write-Host "`nMissing required values in .env file!" -ForegroundColor Red
    Write-Host "Missing: $($missingValues -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "Configuration loaded from .env file:" -ForegroundColor Green
Write-Host "  Search Service: $SearchServiceName"
Write-Host "  Storage Account: $StorageAccountName"
Write-Host "  Container: $ContainerName"
Write-Host "  OpenAI Endpoint: $OpenAIEndpoint"
Write-Host "  Embedding Deployment: $OpenAIDeployment"
Write-Host "  Embedding Model: $OpenAIModel"
Write-Host "  Index Name: $IndexName"
Write-Host "  Chunk Size: $ChunkSize characters"
Write-Host "  Chunk Overlap: $ChunkOverlap characters"
if ($IndexDimension -gt 0) {
    Write-Host "  Embedding Dimension: $IndexDimension (overriding default)"
}
Write-Host "  Custom Skill URI: $SkillUri"
if ($AuthResourceId) {
    Write-Host "  Auth Resource ID: $AuthResourceId (Entra ID auth enabled)"
} else {
    Write-Host "  Auth Resource ID: (not configured - anonymous access)"
}
if ($IndexVersion) {
    Write-Host "  Index Version: $IndexVersion"
}
if ($UserAssignedIdentity) {
    Write-Host "  Vectorizer Identity: $UserAssignedIdentity (user-assigned)"
} else {
    Write-Host "  Vectorizer Identity: system-assigned managed identity"
}

# Build resource names from INDEX_NAME (with optional version suffix)
$indexResourceName = if ($IndexVersion) { "$IndexName-index-$IndexVersion" } else { "$IndexName-index" }
$skillsetResourceName = if ($IndexVersion) { "$IndexName-skillset-$IndexVersion" } else { "$IndexName-skillset" }
$indexerResourceName = if ($IndexVersion) { "$IndexName-indexer-$IndexVersion" } else { "$IndexName-indexer" }

# Check Azure CLI login
Write-Host "`nVerifying Azure CLI authentication..." -ForegroundColor Cyan
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "You are not logged in to Azure CLI. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "  Logged in as: $($account.user.name)" -ForegroundColor Green

# Get subscription ID for managed identity
Write-Host "`nRetrieving subscription ID..." -ForegroundColor Cyan
$subscriptionId = az account show --query id -o tsv
if (-not $subscriptionId) {
    Write-Host "Failed to get subscription ID." -ForegroundColor Red
    exit 1
}
Write-Host "  Subscription ID retrieved." -ForegroundColor Green

# Set up API parameters
$searchEndpoint = "https://$SearchServiceName.search.windows.net"
$apiVersion = "2024-07-01"

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Deploying Azure AI Search Pipeline" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Deploy in order: index, data source, skillset, indexer
$success = $true

# 1. Deploy Index (apply vectorizer configuration)
$indexFile = Join-Path $scriptDir "search-index.json"
if (Test-Path $indexFile) {
    $indexContent = Get-Content $indexFile -Raw
    $indexJson = $indexContent | ConvertFrom-Json
    $indexJson.name = $indexResourceName
    $indexContent = $indexJson | ConvertTo-Json -Depth 20
    # Apply vectorizer configuration with Azure OpenAI settings and managed identity
    $indexContent = Set-IndexVectorizerConfig -Content $indexContent -OpenAIEndpoint $OpenAIEndpoint -OpenAIDeployment $OpenAIDeployment -OpenAIModel $OpenAIModel -UserAssignedIdentity $UserAssignedIdentity -Dimension $IndexDimension
    if (-not (Deploy-SearchResource -ResourceType "indexes" -ResourceName $indexResourceName -JsonContent $indexContent -SearchEndpoint $searchEndpoint -ApiVersion $apiVersion)) {
        $success = $false
    }
} else {
    Write-Host "Index file not found: $indexFile" -ForegroundColor Red
    $success = $false
}

# 2. Deploy Data Source (apply storage configuration)
$datasourceFile = Join-Path $scriptDir "search-datasource.json"
if (Test-Path $datasourceFile) {
    $dsContent = Get-Content $datasourceFile -Raw
    $dsJson = $dsContent | ConvertFrom-Json
    $dsContent = Set-DatasourceConfig -Content $dsContent -SubscriptionId $subscriptionId -ResourceGroup $ResourceGroup -StorageAccountName $StorageAccountName -ContainerName $ContainerName
    if (-not (Deploy-SearchResource -ResourceType "datasources" -ResourceName $dsJson.name -JsonContent $dsContent -SearchEndpoint $searchEndpoint -ApiVersion $apiVersion)) {
        $success = $false
    }
} else {
    Write-Host "Data source file not found: $datasourceFile" -ForegroundColor Red
    $success = $false
}

# 3. Deploy Skillset (apply OpenAI, chunk configuration, function URI, and names)
$skillsetFile = Join-Path $scriptDir "search-skillset.json"
if (Test-Path $skillsetFile) {
    $ssContent = Get-Content $skillsetFile -Raw
    $ssContent = Set-SkillsetConfig -Content $ssContent -OpenAIEndpoint $OpenAIEndpoint -OpenAIDeployment $OpenAIDeployment -OpenAIModel $OpenAIModel -ChunkSize $ChunkSize -ChunkOverlap $ChunkOverlap -FunctionUri $SkillUri -AuthResourceId $AuthResourceId
    $ssJson = $ssContent | ConvertFrom-Json
    $ssJson.name = $skillsetResourceName
    # Update targetIndexName in indexProjections if present
    if ($ssJson.indexProjections -and $ssJson.indexProjections.selectors) {
        foreach ($selector in $ssJson.indexProjections.selectors) {
            $selector.targetIndexName = $indexResourceName
        }
    }
    $ssContent = $ssJson | ConvertTo-Json -Depth 20
    if (-not (Deploy-SearchResource -ResourceType "skillsets" -ResourceName $skillsetResourceName -JsonContent $ssContent -SearchEndpoint $searchEndpoint -ApiVersion $apiVersion)) {
        $success = $false
    }
} else {
    Write-Host "Skillset file not found: $skillsetFile" -ForegroundColor Red
    $success = $false
}

# 4. Deploy Indexer (apply names)
$indexerFile = Join-Path $scriptDir "search-indexer.json"
if (Test-Path $indexerFile) {
    $ixContent = Get-Content $indexerFile -Raw
    $ixJson = $ixContent | ConvertFrom-Json
    $ixJson.name = $indexerResourceName
    $ixJson.targetIndexName = $indexResourceName
    $ixJson.skillsetName = $skillsetResourceName
    $ixJson.dataSourceName = $dsJson.name
    $ixContent = $ixJson | ConvertTo-Json -Depth 20
    if (-not (Deploy-SearchResource -ResourceType "indexers" -ResourceName $indexerResourceName -JsonContent $ixContent -SearchEndpoint $searchEndpoint -ApiVersion $apiVersion)) {
        $success = $false
    }
} else {
    Write-Host "Indexer file not found: $indexerFile" -ForegroundColor Red
    $success = $false
}

Write-Host "`n========================================" -ForegroundColor Yellow
if ($success) {
    Write-Host "Pipeline deployed successfully!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Run the indexer manually or wait for scheduled run"
    Write-Host "  2. Monitor indexer status in Azure Portal"
    Write-Host "  3. Test search queries once indexing completes"
} else {
    Write-Host "Pipeline deployment completed with errors." -ForegroundColor Red
    Write-Host "Please review the errors above and fix any issues." -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Yellow
