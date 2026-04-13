<#
.SYNOPSIS
    Deploys the ParseMarkdown HTTP service as an Azure Container App and configures RBAC for Azure AI Search.

.DESCRIPTION
    This script:
    1. Builds and pushes the Docker image to Azure Container Registry
    2. Creates a Container App Environment if it doesn't exist
    3. Creates or updates the Container App with system-assigned managed identity
    4. Configures Entra ID authentication (optional, via App Registration)
    5. Grants Azure AI Search managed identity access to call the Container App
    6. Updates .env file with container app URI

.NOTES
    Required .env file variables:
        AZURE_RESOURCE_GROUP=your-resource-group
        AZURE_CONTAINER_REGISTRY=your-container-registry-name
        AZURE_AI_SEARCH=your-search-service-name
    
    Optional .env variables:
        AZURE_CONTAINER_APP_ENV=your-container-app-environment-name
        AZURE_CONTAINER_APP_NAME=your-container-app-name
    
    Created .env variables:
        AZURE_CONTAINER_APP_NAME=your-container-app-name
        AZURE_CONTAINER_APP_URI=https://your-container-app.azurecontainerapps.io/api/ParseMarkdown

.EXAMPLE
    .\deploy-container-app.ps1
#>

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFilePath = Join-Path $scriptDir ".env"
$parseMarkdownPath = Join-Path $scriptDir "ParseMarkdown"

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

# Function to update or add a value in .env file
function Set-EnvFileValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )
    
    $lines = @()
    $found = $false
    
    if (Test-Path $Path) {
        $lines = Get-Content $Path
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^$Key=") {
                $lines[$i] = "$Key=$Value"
                $found = $true
                break
            }
        }
    }
    
    if (-not $found) {
        $lines += "$Key=$Value"
    }
    
    $lines | Set-Content $Path -Encoding UTF8
}

# Function to check if a role assignment exists
function Test-RoleAssignment {
    param(
        [string]$Scope,
        [string]$RoleDefinitionName,
        [string]$PrincipalId
    )
    
    $existing = az role assignment list `
        --scope $Scope `
        --role $RoleDefinitionName `
        --assignee $PrincipalId `
        --query "[0]" `
        -o json 2>$null | ConvertFrom-Json
    
    return $null -ne $existing
}

# Function to assign a role if not already assigned
function Set-RoleAssignmentIfNeeded {
    param(
        [string]$Scope,
        [string]$RoleDefinitionName,
        [string]$PrincipalId,
        [string]$ResourceDescription,
        [string]$PrincipalType = "ServicePrincipal"
    )
    
    Write-Host "`nChecking role '$RoleDefinitionName' on $ResourceDescription..." -ForegroundColor Cyan
    
    if (Test-RoleAssignment -Scope $Scope -RoleDefinitionName $RoleDefinitionName -PrincipalId $PrincipalId) {
        Write-Host "  Role already assigned." -ForegroundColor Green
        return @{ Success = $true; NewAssignment = $false }
    }
    
    Write-Host "  Role not found. Assigning..." -ForegroundColor Yellow
    
    $result = az role assignment create `
        --scope $Scope `
        --role $RoleDefinitionName `
        --assignee-object-id $PrincipalId `
        --assignee-principal-type $PrincipalType `
        -o json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Failed to assign role." -ForegroundColor Red
        Write-Host "  Error: $result" -ForegroundColor Red
        return @{ Success = $false; NewAssignment = $false }
    }
    
    Write-Host "  Role assigned successfully." -ForegroundColor Green
    return @{ Success = $true; NewAssignment = $true }
}

# Load environment variables from .env file
$envValues = Get-EnvFileValues -Path $envFilePath

# Get values from .env file
$ResourceGroup = $envValues["AZURE_RESOURCE_GROUP"]
$ContainerRegistryName = $envValues["AZURE_CONTAINER_REGISTRY_NAME"]
$ContainerRegistryResourceGroup = $envValues["AZURE_CONTAINER_REGISTRY_RESOURCE_GROUP"]
if (-not $ContainerRegistryResourceGroup) {
    $ContainerRegistryResourceGroup = $ResourceGroup
}
$SearchServiceName = $envValues["AZURE_AI_SEARCH"]
$IndexName = $envValues["INDEX_NAME"]
$Location = $envValues["AZURE_LOCATION"]

# User-assigned managed identity for ACR pulls (can be auto-discovered if not specified)
$UserAssignedIdentityName = $envValues["AZURE_USER_ASSIGNED_IDENTITY_NAME"]

# App Registration for Entra ID authentication
$AppRegistrationName = $envValues["AZURE_CONTAINER_APP_REG_NAME"]

# Container App specific configuration
$ContainerAppEnvName = $envValues["AZURE_CONTAINER_APP_ENV"]

$ContainerAppName = $envValues["AZURE_CONTAINER_APP_NAME"]
if (-not $ContainerAppName) {
    $ContainerAppName = "$IndexName-parsemd"
}

# Image name
$ImageName = "parsemarkdown"
$ImageTag = "latest"

# Function to find a user-assigned managed identity with AcrPull role on the ACR
function Find-AcrPullIdentity {
    param(
        [string]$ResourceGroup,
        [string]$AcrName,
        [string]$AcrResourceGroup
    )
    
    Write-Host "`nSearching for user-assigned managed identity with AcrPull role on ACR..." -ForegroundColor Cyan
    
    # Get ACR resource ID
    $acrId = az acr show --name $AcrName --resource-group $AcrResourceGroup --query id -o tsv 2>$null
    if (-not $acrId) {
        Write-Host "  Could not find ACR '$AcrName'." -ForegroundColor Yellow
        return $null
    }
    
    # List all user-assigned managed identities in the resource group
    $identitiesJson = az identity list --resource-group $ResourceGroup -o json 2>$null
    if (-not $identitiesJson) {
        Write-Host "  No user-assigned managed identities found in resource group." -ForegroundColor Yellow
        return $null
    }
    
    $identities = $identitiesJson | ConvertFrom-Json
    
    foreach ($identity in $identities) {
        $principalId = $identity.principalId
        $identityName = $identity.name
        
        # Check if this identity has AcrPull role on the ACR
        $roleAssignment = az role assignment list `
            --scope $acrId `
            --assignee $principalId `
            --role "AcrPull" `
            --query "[0]" `
            -o json 2>$null | ConvertFrom-Json
        
        if ($roleAssignment) {
            Write-Host "  Found identity '$identityName' with AcrPull role on ACR." -ForegroundColor Green
            return @{
                Name = $identityName
                Id = $identity.id
                PrincipalId = $principalId
                ClientId = $identity.clientId
            }
        }
    }
    
    Write-Host "  No user-assigned managed identity with AcrPull role found." -ForegroundColor Yellow
    return $null
}

# Validate required values
$requiredValues = @{
    "AZURE_RESOURCE_GROUP" = $ResourceGroup
    "AZURE_CONTAINER_REGISTRY_NAME" = $ContainerRegistryName
    "AZURE_AI_SEARCH" = $SearchServiceName
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
    Write-Host "`nPlease ensure your .env file contains:" -ForegroundColor Yellow
    Write-Host "  AZURE_RESOURCE_GROUP=<your-resource-group>"
    Write-Host "  AZURE_CONTAINER_REGISTRY_NAME=<your-container-registry-name>"
    Write-Host "  AZURE_CONTAINER_REGISTRY_RESOURCE_GROUP=<acr-resource-group> (optional, defaults to AZURE_RESOURCE_GROUP)"
    Write-Host "  AZURE_AI_SEARCH=<your-search-service-name>"
    exit 1
}

# Check Azure CLI login
Write-Host "`nVerifying Azure CLI authentication..." -ForegroundColor Cyan
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "You are not logged in to Azure CLI. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "  Logged in as: $($account.user.name)" -ForegroundColor Green

$tenantId = $account.tenantId

# Get location from resource group if not specified
if (-not $Location) {
    Write-Host "`nRetrieving location from resource group..." -ForegroundColor Cyan
    $Location = az group show --name $ResourceGroup --query location -o tsv
    if (-not $Location) {
        Write-Host "Failed to get location from resource group." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nConfiguration:" -ForegroundColor Green
Write-Host "  Resource Group: $ResourceGroup"
Write-Host "  Location: $Location"
Write-Host "  Container Registry: $ContainerRegistryName (in $ContainerRegistryResourceGroup)"
if ($ContainerAppEnvName) {
    Write-Host "  Container App Environment: $ContainerAppEnvName"
} else {
    Write-Host "  Container App Environment: (will auto-discover from resource group)"
}
Write-Host "  Container App Name: $ContainerAppName"
Write-Host "  Search Service: $SearchServiceName"
if ($UserAssignedIdentityName) {
    Write-Host "  User-Assigned Identity: $UserAssignedIdentityName"
} else {
    Write-Host "  User-Assigned Identity: (will auto-discover from ACR role assignments)"
}
if ($AppRegistrationName) {
    Write-Host "  App Registration: $AppRegistrationName (Entra ID auth enabled)"
} else {
    Write-Host "  App Registration: (not configured - endpoint will be public)"
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Building and Pushing Docker Image" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Check if ParseMarkdown folder exists
if (-not (Test-Path $parseMarkdownPath)) {
    Write-Host "  ParseMarkdown folder not found: $parseMarkdownPath" -ForegroundColor Red
    exit 1
}

# Get ACR login server
Write-Host "`nRetrieving Container Registry details..." -ForegroundColor Cyan
$acrLoginServer = az acr show --name $ContainerRegistryName --resource-group $ContainerRegistryResourceGroup --query loginServer -o tsv 2>$null

if ($LASTEXITCODE -ne 0 -or -not $acrLoginServer) {
    Write-Host "  Failed to get Container Registry details." -ForegroundColor Red
    Write-Host "  Please ensure the container registry '$ContainerRegistryName' exists in resource group '$ContainerRegistryResourceGroup'." -ForegroundColor Yellow
    exit 1
}

# Ensure we only have the login server (filter out any warning messages)
$acrLoginServer = ($acrLoginServer -split "`n" | Where-Object { $_ -match '\.azurecr\.io$' } | Select-Object -First 1).Trim()

Write-Host "  ACR Login Server: $acrLoginServer" -ForegroundColor Green

# Login to ACR
Write-Host "`nLogging in to Azure Container Registry..." -ForegroundColor Cyan
$loginResult = az acr login --name $ContainerRegistryName -g $ResourceGroup 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed to login to ACR." -ForegroundColor Red
    Write-Host "  Error: $loginResult" -ForegroundColor Red
    Write-Host "  Please ensure your IP is allowed in the ACR firewall settings." -ForegroundColor Yellow
    exit 1
}

Write-Host "  Successfully logged in to ACR." -ForegroundColor Green

# Target platform for Azure Container Apps
$TargetPlatform = "linux/amd64"

# Calculate hash of source files to detect changes
Write-Host "`nCalculating source file hash..." -ForegroundColor Cyan

$sourceFiles = Get-ChildItem -Path $parseMarkdownPath -Recurse -File | 
    Where-Object { $_.Extension -in '.cs', '.csproj', '.json' -or $_.Name -eq 'Dockerfile' } |
    Sort-Object FullName

$hashInput = ""
foreach ($file in $sourceFiles) {
    $fileHash = Get-FileHash -Path $file.FullName -Algorithm SHA256
    $hashInput += "$($file.Name):$($fileHash.Hash);"
}

# Include platform in hash to ensure rebuild when platform changes
$hashInput += "platform:$TargetPlatform;"

$sourceHash = (Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($hashInput))) -Algorithm SHA256).Hash.Substring(0, 12).ToLower()
Write-Host "  Source hash: $sourceHash" -ForegroundColor Green

$hashTag = $sourceHash
$fullImageName = "$acrLoginServer/${ImageName}:${ImageTag}"
$hashImageName = "$acrLoginServer/${ImageName}:${hashTag}"

Write-Host "  Image (latest): $fullImageName"
Write-Host "  Image (hash): $hashImageName"

# Check if image with this hash already exists in ACR
Write-Host "`nChecking if image with hash '$hashTag' exists in ACR..." -ForegroundColor Cyan
$existingTag = az acr repository show-tags `
    --name $ContainerRegistryName `
    --repository $ImageName `
    --query "[?@ == '$hashTag']" `
    -o tsv 2>$null

$skipBuild = $false
if ($existingTag) {
    Write-Host "  Image with hash '$hashTag' already exists. Skipping build." -ForegroundColor Green
    $skipBuild = $true
} else {
    Write-Host "  Image not found. Building new image..." -ForegroundColor Yellow
}

if (-not $skipBuild) {
    # Build and push image locally using Docker
    Write-Host "`nBuilding Docker image locally..." -ForegroundColor Cyan
    Write-Host "  This may take a few minutes..." -ForegroundColor Yellow

    Push-Location $parseMarkdownPath

    # Build with both latest and hash tags
    # Note: Explicitly target linux/amd64 platform for Azure Container Apps compatibility
    $buildResult = docker build --platform $TargetPlatform -t $fullImageName -t $hashImageName . 2>&1
    $buildExitCode = $LASTEXITCODE

    if ($buildExitCode -ne 0) {
        Pop-Location
        Write-Host "  Failed to build Docker image." -ForegroundColor Red
        Write-Host "  Error: $buildResult" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Docker image built successfully." -ForegroundColor Green

    # Push both tags to ACR
    Write-Host "`nPushing Docker images to ACR..." -ForegroundColor Cyan
    
    Write-Host "  Pushing latest tag..." -ForegroundColor Cyan
    $pushLatestResult = docker push $fullImageName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "  Failed to push latest tag." -ForegroundColor Red
        Write-Host "  Error: $pushLatestResult" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Pushing hash tag..." -ForegroundColor Cyan
    $pushHashResult = docker push $hashImageName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "  Failed to push hash tag." -ForegroundColor Red
        Write-Host "  Error: $pushHashResult" -ForegroundColor Red
        exit 1
    }

    Pop-Location

    Write-Host "  Docker images built and pushed successfully." -ForegroundColor Green
} else {
    Write-Host "`nUsing existing image from ACR." -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Discovering Container App Environment" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

if ($ContainerAppEnvName) {
    # Validate the specified Container App Environment exists
    Write-Host "`nValidating specified Container App Environment '$ContainerAppEnvName'..." -ForegroundColor Cyan
    $existingEnv = az containerapp env show `
        --name $ContainerAppEnvName `
        --resource-group $ResourceGroup `
        -o json 2>$null | ConvertFrom-Json
    
    if (-not $existingEnv) {
        Write-Host "  Container App Environment '$ContainerAppEnvName' not found in resource group '$ResourceGroup'." -ForegroundColor Red
        Write-Host "  Please ensure the Container App Environment exists before running this script." -ForegroundColor Red
        Write-Host "  You can create one using: az containerapp env create --name <name> --resource-group $ResourceGroup --location $Location" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "  Found Container App Environment '$ContainerAppEnvName'." -ForegroundColor Green
} else {
    # Auto-discover Container App Environment in the resource group
    Write-Host "`nAuto-discovering Container App Environment in resource group '$ResourceGroup'..." -ForegroundColor Cyan
    
    $envListJson = az containerapp env list `
        --resource-group $ResourceGroup `
        -o json 2>$null
    
    if (-not $envListJson) {
        Write-Host "  No Container App Environments found in resource group '$ResourceGroup'." -ForegroundColor Red
        Write-Host "  Please create a Container App Environment first or specify AZURE_CONTAINER_APP_ENV in your .env file." -ForegroundColor Red
        Write-Host "  You can create one using: az containerapp env create --name <name> --resource-group $ResourceGroup --location $Location" -ForegroundColor Yellow
        exit 1
    }
    
    $envList = $envListJson | ConvertFrom-Json
    
    if ($envList.Count -eq 0) {
        Write-Host "  No Container App Environments found in resource group '$ResourceGroup'." -ForegroundColor Red
        Write-Host "  Please create a Container App Environment first or specify AZURE_CONTAINER_APP_ENV in your .env file." -ForegroundColor Red
        Write-Host "  You can create one using: az containerapp env create --name <name> --resource-group $ResourceGroup --location $Location" -ForegroundColor Yellow
        exit 1
    } elseif ($envList.Count -gt 1) {
        Write-Host "  Multiple Container App Environments found in resource group:" -ForegroundColor Red
        foreach ($env in $envList) {
            Write-Host "    - $($env.name)" -ForegroundColor Yellow
        }
        Write-Host "  Please specify AZURE_CONTAINER_APP_ENV in your .env file to select which one to use." -ForegroundColor Red
        exit 1
    }
    
    $ContainerAppEnvName = $envList[0].name
    Write-Host "  Discovered Container App Environment: '$ContainerAppEnvName'" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Deploying Container App" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Check if Container App exists
Write-Host "`nChecking if Container App exists..." -ForegroundColor Cyan
$existingApp = az containerapp show `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    -o json 2>$null | ConvertFrom-Json

if ($existingApp) {
    Write-Host "  Container App '$ContainerAppName' already exists. Updating..." -ForegroundColor Yellow
    
    # Update existing container app with new image
    $updateResult = az containerapp update `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --image $fullImageName `
        -o json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Failed to update Container App." -ForegroundColor Red
        Write-Host "  Error: $updateResult" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Container App updated successfully." -ForegroundColor Green
} else {
    Write-Host "  Creating Container App '$ContainerAppName'..." -ForegroundColor Cyan
    
    # Determine identity configuration for ACR pulls
    $userIdentityId = $null
    
    if ($UserAssignedIdentityName) {
        # Use explicitly specified user-assigned managed identity
        Write-Host "  Retrieving user-assigned managed identity '$UserAssignedIdentityName'..." -ForegroundColor Cyan
        $userIdentityId = az identity show `
            --name $UserAssignedIdentityName `
            --resource-group $ResourceGroup `
            --query id -o tsv 2>$null
        
        if (-not $userIdentityId) {
            Write-Host "  Failed to find user-assigned managed identity '$UserAssignedIdentityName'." -ForegroundColor Red
            Write-Host "  Please ensure the identity exists in resource group '$ResourceGroup'." -ForegroundColor Yellow
            exit 1
        }
        Write-Host "  Identity ID: $userIdentityId" -ForegroundColor Green
    } else {
        # Auto-discover a user-assigned managed identity with AcrPull role
        $discoveredIdentity = Find-AcrPullIdentity `
            -ResourceGroup $ResourceGroup `
            -AcrName $ContainerRegistryName `
            -AcrResourceGroup $ContainerRegistryResourceGroup
        
        if ($discoveredIdentity) {
            $userIdentityId = $discoveredIdentity.Id
            $UserAssignedIdentityName = $discoveredIdentity.Name
            Write-Host "  Using discovered identity: $UserAssignedIdentityName" -ForegroundColor Green
            Write-Host "  Identity ID: $userIdentityId" -ForegroundColor Green
        }
    }
    
    if ($userIdentityId) {
        # Create container app with user-assigned managed identity for ACR pulls
        $createResult = az containerapp create `
            --name $ContainerAppName `
            --resource-group $ResourceGroup `
            --environment $ContainerAppEnvName `
            --image $fullImageName `
            --registry-server $acrLoginServer `
            --registry-identity $userIdentityId `
            --user-assigned $userIdentityId `
            --target-port 8080 `
            --ingress external `
            --min-replicas 1 `
            --max-replicas 3 `
            --cpu 0.5 `
            --memory 1.0Gi `
            --system-assigned `
            -o json 2>&1
    } else {
        # Fallback to system-assigned managed identity (requires pre-configured AcrPull role)
        Write-Host "  Warning: No user-assigned identity found. Using system-assigned identity." -ForegroundColor Yellow
        Write-Host "  This may fail if AcrPull role is not pre-assigned." -ForegroundColor Yellow
        
        $createResult = az containerapp create `
            --name $ContainerAppName `
            --resource-group $ResourceGroup `
            --environment $ContainerAppEnvName `
            --image $fullImageName `
            --registry-server $acrLoginServer `
            --registry-identity system `
            --target-port 8080 `
            --ingress external `
            --min-replicas 1 `
            --max-replicas 3 `
            --cpu 0.5 `
            --memory 1.0Gi `
            --system-assigned `
            -o json 2>&1
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Failed to create Container App." -ForegroundColor Red
        Write-Host "  Error: $createResult" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Container App created successfully." -ForegroundColor Green
}

# Get Container App details
Write-Host "`nRetrieving Container App details..." -ForegroundColor Cyan
$containerApp = az containerapp show `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    -o json | ConvertFrom-Json

if (-not $containerApp) {
    Write-Host "  Failed to retrieve Container App details." -ForegroundColor Red
    exit 1
}

$containerAppId = $containerApp.id
$containerAppFqdn = $containerApp.properties.configuration.ingress.fqdn
$containerAppPrincipalId = $containerApp.identity.principalId

Write-Host "  Container App ID: $containerAppId"
Write-Host "  FQDN: $containerAppFqdn"
Write-Host "  Managed Identity Principal ID: $containerAppPrincipalId"

# Construct the full URI for the ParseMarkdown endpoint
$containerAppUri = "https://$containerAppFqdn/api/ParseMarkdown"
Write-Host "  ParseMarkdown Endpoint: $containerAppUri" -ForegroundColor Green

$acrId = az acr show --name $ContainerRegistryName --resource-group $ContainerRegistryResourceGroup --query id -o tsv

# Get Azure AI Search managed identity
Write-Host "`nRetrieving Azure AI Search managed identity..." -ForegroundColor Cyan

$searchServiceJson = az search service show `
    --name $SearchServiceName `
    --resource-group $ResourceGroup `
    -o json 2>$null

if ($LASTEXITCODE -ne 0 -or -not $searchServiceJson) {
    Write-Host "  Failed to retrieve Search service details." -ForegroundColor Red
    exit 1
}

$searchService = $searchServiceJson | ConvertFrom-Json
$searchPrincipalId = $searchService.identity.principalId

if (-not $searchPrincipalId) {
    Write-Host "  Azure AI Search does not have a managed identity enabled." -ForegroundColor Red
    Write-Host "  Please enable system-assigned managed identity on the Search service." -ForegroundColor Red
    exit 1
}

Write-Host "  Search Service Principal ID: $searchPrincipalId" -ForegroundColor Green

# Configure Entra ID authentication if App Registration name is provided
$authResourceId = $null
$appClientId = $null

if ($AppRegistrationName) {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "Configuring Entra ID Authentication" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    
    # Check if App Registration already exists
    Write-Host "`nChecking if App Registration '$AppRegistrationName' exists..." -ForegroundColor Cyan
    $existingAppJson = az ad app list --display-name $AppRegistrationName --query "[0]" -o json 2>$null
    $existingApp = if ($existingAppJson) { $existingAppJson | ConvertFrom-Json } else { $null }
    
    if ($existingApp -and $existingApp.appId) {
        Write-Host "  App Registration already exists." -ForegroundColor Green
        $appClientId = $existingApp.appId
        $appObjectId = $existingApp.id
    } else {
        Write-Host "  Creating App Registration '$AppRegistrationName'..." -ForegroundColor Cyan
        
        # Create the App Registration with just the display name first (identifier URIs added after we have the client ID)
        $newAppJson = az ad app create `
            --display-name $AppRegistrationName `
            --sign-in-audience AzureADMyOrg `
            -o json 2>$null
        
        if ($LASTEXITCODE -ne 0 -or -not $newAppJson) {
            Write-Host "  Failed to create App Registration." -ForegroundColor Red
            exit 1
        }
        
        $appDetails = $newAppJson | ConvertFrom-Json
        $appClientId = $appDetails.appId
        $appObjectId = $appDetails.id
        
        Write-Host "  App Registration created successfully." -ForegroundColor Green
    }
    
    if (-not $appClientId) {
        Write-Host "  Error: Could not retrieve App Client ID." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  App Client ID: $appClientId"
    
    # Use the client ID format for authResourceId - this is the format Azure AI Search expects
    $authResourceId = "api://$appClientId"
    Write-Host "  Auth Resource ID: $authResourceId"
    
    # Ensure identifier URIs include the client ID format (required for AI Search token acquisition)
    Write-Host "`nConfiguring App Registration identifier URIs..." -ForegroundColor Cyan
    
    # Get current app data to check existing identifier URIs
    $currentAppDataJson = az ad app show --id $appClientId -o json 2>$null
    $currentAppData = $currentAppDataJson | ConvertFrom-Json
    $existingUris = $currentAppData.identifierUris
    
    # Ensure we have the client ID format URI (api://{clientId}) which AI Search expects
    $clientIdUri = "api://$appClientId"
    
    if ($existingUris -contains $clientIdUri) {
        Write-Host "  Identifier URI '$clientIdUri' already exists." -ForegroundColor Green
    } else {
        Write-Host "  Adding identifier URI '$clientIdUri'..." -ForegroundColor Cyan
        
        # Build the list of URIs to set (include existing ones plus the new one)
        $newUris = @($clientIdUri)
        if ($existingUris) {
            foreach ($uri in $existingUris) {
                if ($uri -ne $clientIdUri -and $newUris -notcontains $uri) {
                    $newUris += $uri
                }
            }
        }
        
        $uriBody = @{
            identifierUris = $newUris
        } | ConvertTo-Json -Compress
        
        $tempUriFile = [System.IO.Path]::GetTempFileName()
        $uriBody | Out-File -FilePath $tempUriFile -Encoding utf8 -NoNewline
        
        try {
            az rest `
                --method PATCH `
                --uri "https://graph.microsoft.com/v1.0/applications/$appObjectId" `
                --headers "Content-Type=application/json" `
                --body "@$tempUriFile" `
                -o none 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Identifier URI '$clientIdUri' added successfully." -ForegroundColor Green
            } else {
                Write-Host "  Warning: Could not add identifier URI. AI Search may fail to authenticate." -ForegroundColor Yellow
            }
        } finally {
            Remove-Item -Path $tempUriFile -Force -ErrorAction SilentlyContinue
        }
        
        # Wait for propagation
        Start-Sleep -Seconds 2
    }
    
    # Check if service principal exists for the app registration
    Write-Host "`nChecking if Service Principal exists for App Registration..." -ForegroundColor Cyan
    $existingSpJson = az ad sp list --filter "appId eq '$appClientId'" --query "[0]" -o json 2>$null
    $existingSp = if ($existingSpJson) { $existingSpJson | ConvertFrom-Json } else { $null }
    
    if ($existingSp -and $existingSp.id) {
        Write-Host "  Service Principal already exists." -ForegroundColor Green
        $appSpObjectId = $existingSp.id
    } else {
        Write-Host "  Creating Service Principal for App Registration..." -ForegroundColor Cyan
        
        $newSpJson = az ad sp create --id $appClientId -o json 2>$null
        
        if ($LASTEXITCODE -ne 0 -or -not $newSpJson) {
            Write-Host "  Failed to create Service Principal." -ForegroundColor Red
            exit 1
        }
        
        $spDetails = $newSpJson | ConvertFrom-Json
        $appSpObjectId = $spDetails.id
        Write-Host "  Service Principal created successfully." -ForegroundColor Green
    }
    
    # Configure oauth2PermissionScopes and pre-authorize Azure CLI
    Write-Host "`nConfiguring OAuth2 permission scopes and pre-authorizing Azure CLI..." -ForegroundColor Cyan
    
    # Get the current app configuration
    $currentAppJson = az ad app show --id $appClientId -o json 2>$null
    $currentApp = $currentAppJson | ConvertFrom-Json
    
    # Generate a stable scope ID
    $scopeId = [guid]::Parse("00000000-0000-0000-0000-000000000002")
    
    # Check if oauth2PermissionScopes already exist
    $existingScope = $currentApp.api.oauth2PermissionScopes | Where-Object { $_.value -eq "user_impersonation" }
    
    if (-not $existingScope) {
        Write-Host "  Creating oauth2PermissionScope 'user_impersonation'..." -ForegroundColor Cyan
        
        $oauth2Scope = @{
            api = @{
                oauth2PermissionScopes = @(
                    @{
                        adminConsentDescription = "Allow the application to access $AppRegistrationName on behalf of the signed-in user."
                        adminConsentDisplayName = "Access $AppRegistrationName"
                        id = $scopeId.ToString()
                        isEnabled = $true
                        type = "User"
                        userConsentDescription = "Allow the application to access $AppRegistrationName on your behalf."
                        userConsentDisplayName = "Access $AppRegistrationName"
                        value = "user_impersonation"
                    }
                )
            }
        } | ConvertTo-Json -Depth 10 -Compress
        
        $tempScopeFile = [System.IO.Path]::GetTempFileName()
        $oauth2Scope | Out-File -FilePath $tempScopeFile -Encoding utf8 -NoNewline
        
        try {
            az rest `
                --method PATCH `
                --uri "https://graph.microsoft.com/v1.0/applications/$appObjectId" `
                --headers "Content-Type=application/json" `
                --body "@$tempScopeFile" `
                -o none 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Created oauth2PermissionScope 'user_impersonation'." -ForegroundColor Green
            } else {
                Write-Host "  Warning: Could not create oauth2PermissionScope." -ForegroundColor Yellow
            }
        } finally {
            Remove-Item -Path $tempScopeFile -Force -ErrorAction SilentlyContinue
        }
        
        # Wait for propagation
        Start-Sleep -Seconds 2
    } else {
        $scopeId = [guid]::Parse($existingScope.id)
        Write-Host "  oauth2PermissionScope 'user_impersonation' already exists." -ForegroundColor Green
    }
    
    # Pre-authorize Azure CLI to access this app without admin consent
    Write-Host "  Pre-authorizing Azure CLI for user token acquisition..." -ForegroundColor Cyan
    
    # Azure CLI app ID (well-known)
    $azureCliAppId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"
    
    # Refresh app data to get current state
    $refreshedAppJson = az ad app show --id $appClientId -o json 2>$null
    $refreshedApp = $refreshedAppJson | ConvertFrom-Json
    
    # Check if Azure CLI is already pre-authorized
    $existingPreAuth = $refreshedApp.api.preAuthorizedApplications | Where-Object { $_.appId -eq $azureCliAppId }
    
    if (-not $existingPreAuth) {
        # Get the scope ID from the refreshed app
        $currentScope = $refreshedApp.api.oauth2PermissionScopes | Where-Object { $_.value -eq "user_impersonation" }
        if ($currentScope) {
            $scopeId = $currentScope.id
        }
        
        $preAuthBody = @{
            api = @{
                preAuthorizedApplications = @(
                    @{
                        appId = $azureCliAppId
                        delegatedPermissionIds = @($scopeId.ToString())
                    }
                )
            }
        } | ConvertTo-Json -Depth 10 -Compress
        
        $tempPreAuthFile = [System.IO.Path]::GetTempFileName()
        $preAuthBody | Out-File -FilePath $tempPreAuthFile -Encoding utf8 -NoNewline
        
        try {
            az rest `
                --method PATCH `
                --uri "https://graph.microsoft.com/v1.0/applications/$appObjectId" `
                --headers "Content-Type=application/json" `
                --body "@$tempPreAuthFile" `
                -o none 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Azure CLI pre-authorized successfully." -ForegroundColor Green
            } else {
                Write-Host "  Warning: Could not pre-authorize Azure CLI." -ForegroundColor Yellow
            }
        } finally {
            Remove-Item -Path $tempPreAuthFile -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "  Azure CLI is already pre-authorized." -ForegroundColor Green
    }
    
    # Grant AI Search managed identity permission to get tokens for this app
    # This is done by adding AI Search as an authorized client
    Write-Host "`nConfiguring AI Search access to the App Registration..." -ForegroundColor Cyan
    
    # Generate a unique app role ID (use a stable GUID based on app name)
    $appRoleId = [guid]::Parse("00000000-0000-0000-0000-000000000001")
    
    # Refresh app data and check if app role already exists
    Write-Host "  Checking if app role exists on App Registration..." -ForegroundColor Cyan
    $appDataJson = az ad app show --id $appClientId -o json 2>$null
    $appData = $appDataJson | ConvertFrom-Json
    $existingRole = $appData.appRoles | Where-Object { $_.value -eq "Search.Invoke" }
    
    if ($existingRole) {
        Write-Host "  App role 'Search.Invoke' already exists." -ForegroundColor Green
        $appRoleId = $existingRole.id
    } else {
        Write-Host "  Creating app role 'Search.Invoke'..." -ForegroundColor Cyan
        
        # Create the app role via Graph API using az rest
        $appRoleDefinition = @(
            @{
                allowedMemberTypes = @("Application")
                description = "Allow Azure AI Search to call this API"
                displayName = "Search.Invoke"
                id = $appRoleId.ToString()
                isEnabled = $true
                value = "Search.Invoke"
            }
        )
        
        $updateBody = @{
            appRoles = $appRoleDefinition
        } | ConvertTo-Json -Depth 10 -Compress
        
        $tempAppFile = [System.IO.Path]::GetTempFileName()
        $updateBody | Out-File -FilePath $tempAppFile -Encoding utf8 -NoNewline
        
        try {
            $updateResult = az rest `
                --method PATCH `
                --uri "https://graph.microsoft.com/v1.0/applications/$appObjectId" `
                --headers "Content-Type=application/json" `
                --body "@$tempAppFile" `
                -o json 2>$null
            
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Warning: Could not create app role via Graph API. Trying CLI..." -ForegroundColor Yellow
            } else {
                Write-Host "  App role created successfully." -ForegroundColor Green
            }
        } finally {
            Remove-Item -Path $tempAppFile -Force -ErrorAction SilentlyContinue
        }
        
        # Wait a moment for the role to propagate
        Start-Sleep -Seconds 3
    }
    
    # Assign the app role to AI Search managed identity
    Write-Host "  Assigning app role to Azure AI Search managed identity..." -ForegroundColor Cyan
    
    # Check if role assignment already exists
    $existingAssignmentsJson = az rest `
        --method GET `
        --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$searchPrincipalId/appRoleAssignments" `
        -o json 2>$null
    
    $existingAssignments = $existingAssignmentsJson | ConvertFrom-Json
    $alreadyAssigned = $existingAssignments.value | Where-Object { $_.resourceId -eq $appSpObjectId -and $_.appRoleId -eq $appRoleId.ToString() }
    
    if ($alreadyAssigned) {
        Write-Host "  App role already assigned to AI Search." -ForegroundColor Green
    } else {
        # Use Microsoft Graph to assign app role to service principal
        $roleAssignmentBody = @{
            principalId = $searchPrincipalId
            resourceId = $appSpObjectId
            appRoleId = $appRoleId.ToString()
        } | ConvertTo-Json -Compress
        
        # Write body to temp file
        $tempRoleFile = [System.IO.Path]::GetTempFileName()
        $roleAssignmentBody | Out-File -FilePath $tempRoleFile -Encoding utf8 -NoNewline
        
        try {
            $roleResult = az rest `
                --method POST `
                --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$searchPrincipalId/appRoleAssignments" `
                --headers "Content-Type=application/json" `
                --body "@$tempRoleFile" `
                -o json 2>&1
            
            if ($LASTEXITCODE -ne 0) {
                # Check if it's because assignment already exists
                if ($roleResult -like "*already exists*" -or $roleResult -like "*Permission being assigned already exists*") {
                    Write-Host "  App role already assigned to AI Search." -ForegroundColor Green
                } else {
                    Write-Host "  Warning: Could not assign app role. Error: $roleResult" -ForegroundColor Yellow
                    Write-Host "  You may need to manually grant the app role assignment." -ForegroundColor Yellow
                }
            } else {
                Write-Host "  App role assigned to AI Search successfully." -ForegroundColor Green
            }
        } finally {
            Remove-Item -Path $tempRoleFile -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Update Container App with environment variables for authentication
    Write-Host "`nUpdating Container App with authentication configuration..." -ForegroundColor Cyan
    
    $envVarsResult = az containerapp update `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --set-env-vars "AZURE_TENANT_ID=$tenantId" "AZURE_CLIENT_ID=$appClientId" `
        -o json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: Failed to update Container App environment variables." -ForegroundColor Yellow
        Write-Host "  Error: $envVarsResult" -ForegroundColor Yellow
    } else {
        Write-Host "  Container App updated with AZURE_TENANT_ID and AZURE_CLIENT_ID." -ForegroundColor Green
    }
    
    Write-Host "`n  Entra ID authentication configured successfully!" -ForegroundColor Green
    Write-Host "  AI Search will use authResourceId: $authResourceId" -ForegroundColor Green

} else {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "RBAC Note: Container App Authentication" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The Container App is deployed with external ingress, making the endpoint publicly accessible." -ForegroundColor Cyan
    Write-Host "This is similar to an Azure Function with AuthorizationLevel.Anonymous." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To enable Entra ID authentication, add to your .env file:" -ForegroundColor Yellow
    Write-Host "  AZURE_CONTAINER_APP_REG_NAME=your-app-registration-name" -ForegroundColor White
    Write-Host ""
    Write-Host "Then re-run this script to configure authentication." -ForegroundColor Yellow
}

# Wait for any new role assignments to propagate
if ($acrRoleResult.NewAssignment) {
    Write-Host "`nWaiting 30 seconds for RBAC propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    Write-Host "  Done waiting." -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Updating .env File" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Update .env file with container app details
Set-EnvFileValue -Path $envFilePath -Key "AZURE_CONTAINER_APP_ENV" -Value $ContainerAppEnvName
Set-EnvFileValue -Path $envFilePath -Key "AZURE_CONTAINER_APP_NAME" -Value $ContainerAppName
Set-EnvFileValue -Path $envFilePath -Key "AZURE_CONTAINER_APP_URI" -Value $containerAppUri

Write-Host "  Updated AZURE_CONTAINER_APP_ENV=$ContainerAppEnvName" -ForegroundColor Green
Write-Host "  Updated AZURE_CONTAINER_APP_NAME=$ContainerAppName" -ForegroundColor Green
Write-Host "  Updated AZURE_CONTAINER_APP_URI=$containerAppUri" -ForegroundColor Green

if ($authResourceId) {
    Set-EnvFileValue -Path $envFilePath -Key "AZURE_CONTAINER_APP_AUTH_RESOURCE_ID" -Value $authResourceId
    Set-EnvFileValue -Path $envFilePath -Key "AZURE_CONTAINER_APP_CLIENT_ID" -Value $appClientId
    Write-Host "  Updated AZURE_CONTAINER_APP_AUTH_RESOURCE_ID=$authResourceId" -ForegroundColor Green
    Write-Host "  Updated AZURE_CONTAINER_APP_CLIENT_ID=$appClientId" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Container App Details:" -ForegroundColor Cyan
Write-Host "  Name: $ContainerAppName"
Write-Host "  FQDN: $containerAppFqdn"
Write-Host "  ParseMarkdown Endpoint: $containerAppUri"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Run deploy-search-pipeline.ps1 to update the search pipeline"
Write-Host ""
Write-Host "  2. Test the endpoint:"
Write-Host "     .\test-parsemarkdown.ps1"
Write-Host ""

