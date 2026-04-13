# Platform Deployment Setup Script
# 
# This script deploys Platform resources using Bicep.
# 
# Parameters:
#   -Prefix: Optional prefix for resource naming. If not provided, uses the first 4 characters of the 
#            current user's ID (alias portion of UPN).
#   -ResourceGroupName: Optional resource group name. If not provided (and Prefix was also not provided),
#                       derives from user ID as "rg-{userPrefix}-{envFlag}".
#   -IPAddresses: Optional comma-delimited string of IPv4 addresses (e.g., "192.168.1.100,10.0.0.50,203.0.113.1")
#                 If provided, all addresses will be validated and added to firewall rules.
#                 The current machine's IP address will be automatically detected and added if not in the list.
#                 If not provided, only the current machine's IP address will be used.
#   -UserGroupId: Optional Entra ID group object ID to use for RBAC assignments instead of the current user.
#                 If provided, the group will be validated in Entra ID and the current user must be a member.
#
param (    
    [Parameter(Mandatory = $false)]
    [string]$Prefix,

    [Parameter(Mandatory = $false)]
    [string]$EnvFlag = "d",    
    
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroupName,    
    
    [Parameter(Mandatory = $false)]
    [string]$AIFoundryProjectName = "isedevblog",  
    
    [Parameter(Mandatory = $false)]
    [string]$IPAddresses,
    
    [Parameter(Mandatory = $false)]
    [string]$UserGroupId,
    
    [Parameter(Mandatory = $false)]
    [string]$Location = "eastus2",

    [Parameter(Mandatory = $false)]
    [string]$ExperimentEnvPath = "../experiment/.test.env",

    [Parameter(Mandatory = $false)]
    [string]$EvaluationEnvPath = "../evaluation/generic/.env",

    [Parameter(Mandatory = $false)]
    [string]$EvaluationModuleDir = "../evaluation/generic",
    
    [switch]$EnableAML = $false,
    [switch]$EnableCosmosDB = $false,
    [switch]$EnableAISearch = $false,
    [switch]$EnableAIFoundry = $false,
    [switch]$EnableContainerAppEnvironment = $false,
    [switch]$EnableCatalog = $false,
    [switch]$EnableAppConfiguration = $false,
    [switch]$EnableAll = $false
)

$ErrorActionPreference = "Stop"

# If none of the Enable* switches are set, default to EnableAll
if (-not $EnableAML.IsPresent -and 
    -not $EnableCosmosDB.IsPresent -and 
    -not $EnableAISearch.IsPresent -and 
    -not $EnableAIFoundry.IsPresent -and 
    -not $EnableContainerAppEnvironment.IsPresent -and 
    -not $EnableCatalog.IsPresent -and 
    -not $EnableAppConfiguration.IsPresent -and 
    -not $EnableAll.IsPresent) {
    $EnableAll = [switch]::new($true)
    Write-Host "No feature switches specified - defaulting to EnableAll"
}

# If EnableAll is set, enable all feature switches
if ($EnableAll.IsPresent) {
    $EnableAML = $true
    $EnableCosmosDB = $true
    $EnableAISearch = $true
    $EnableAIFoundry = $true
    $EnableContainerAppEnvironment = $true
    $EnableCatalog = $true
    $EnableAppConfiguration = $false # App Configuration is optional, so we won't enable it by default even with EnableAll
}

# Validate inputs and derive defaults from user ID if needed
if (!$Prefix -or !$ResourceGroupName) {
    Write-Host "Fetching current user ID to derive default values..."
    $currentUserInfo = az ad signed-in-user show --query "{upn:userPrincipalName, id:id}" -o json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or !$currentUserInfo -or !$currentUserInfo.upn -or !$currentUserInfo.id) {
        throw "Failed to get current user information. Prefix and ResourceGroupName are required if user ID cannot be determined."
    }
    
    $currentUserUpn = $currentUserInfo.upn
    $currentUserId = $currentUserInfo.id
    
    # Extract the alias (part before @) and take characters
    $userAlias = ($currentUserUpn -split '@')[0]
    $upnPrefix = $userAlias.Substring(0, [Math]::Min(4, $userAlias.Length)).ToLower()
    
    # Get first 4 characters of the user ID GUID (removing dashes)
    $idPrefix = ($currentUserId -replace '-', '').Substring(0, 4).ToLower()
    
    # Combine UPN prefix with ID prefix
    $userPrefix = "$upnPrefix$idPrefix" + "a" 
    # the reason for this extra 'a' char is because during development, I had to run multiple times and remove RGs
    # so adding an extra char to avoid collisions in quick succession runs. you can remove it in your prod script.
    
    # Remove any non-alphanumeric characters from the prefix
    $userPrefix = $userPrefix -replace '[^a-zA-Z0-9]', ''
    
    if ($userPrefix.Length -lt 2) {
        throw "Could not derive a valid prefix from user ID. Please provide Prefix explicitly."
    }
    
    Write-Host "Derived user prefix from UPN ($upnPrefix) + ID ($idPrefix): $userPrefix"
}

if (!$Prefix) {
    $Prefix = $userPrefix
    Write-Host "Using derived Prefix: $Prefix"
}

$Prefix = $Prefix.ToLower()

if ($Prefix -notmatch '^[a-zA-Z0-9]+$') {
    throw "Prefix must contain only alphanumeric characters (letters and numbers). No dashes, spaces, or special characters allowed."
}

if (!$ResourceGroupName) {
    $ResourceGroupName = "$userPrefix$EnvFlag"
    Write-Host "Using derived ResourceGroupName: $ResourceGroupName"
}

if ($EnvFlag.ToUpper() -notin @("P", "T", "S", "D")) {
    throw "EnvFlag must be one of: P/p (Production), T/t (Test), S/s (Staging), or D/d (Development). Case insensitive."
}

$EnvFlag = $EnvFlag.ToLower()

if (($EnableAIFoundry.IsPresent -or $EnableAIFoundry -eq $true) -and !$AIFoundryProjectName) {
    throw "AIFoundryProjectName is required when EnableAIFoundry or EnableAll switch is added."
}

# Validate UserGroupId if provided
if ($UserGroupId) {
    Write-Host "Validating UserGroupId: $UserGroupId"
    
    # Check if the group exists in Entra ID
    $groupInfo = az ad group show --group $UserGroupId --query "{id:id, displayName:displayName, groupTypes:groupTypes}" -o json 2>$null
    if ($LASTEXITCODE -ne 0 -or !$groupInfo) {
        throw "UserGroupId '$UserGroupId' is not a valid group in Entra ID or you don't have permission to access it."
    }
    
    $groupDetails = $groupInfo | ConvertFrom-Json
    Write-Host "Found group: $($groupDetails.displayName) (ID: $($groupDetails.id))"
    
    # Check if the current user is a member of the group
    Write-Host "Checking if current user is a member of the group..."
    $currentUserId = az ad signed-in-user show --query id -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get current user information."
    }
    
    $membershipCheck = az ad group member check --group $UserGroupId --member-id $currentUserId --query "value" -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or $membershipCheck -ne "true") {
        throw "Current user is not a member of the specified group '$UserGroupId'. You must be a member of the group to use it for RBAC assignments."
    }
    
    Write-Host "UserGroupId validation successful - group exists and current user is a member"
}

# Create resource group if it doesn't exist
If (-Not [bool]((az group exists -n $ResourceGroupName) -eq 'true')) { 

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to verify resource group."
    }    
    Write-Host "Creating resource group: $ResourceGroupName"
    az group create --name $ResourceGroupName --location $Location

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create resource group."
    }
}

Write-Host "Processing IP addresses"

# Function to validate IPv4 address format
function Test-IPv4Address {
    param([string]$IPAddress)
    
    if ([string]::IsNullOrWhiteSpace($IPAddress)) {
        return $false
    }
    
    # Check if it matches IPv4 pattern (4 octets separated by dots)
    if ($IPAddress -notmatch '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$') {
        return $false
    }
    
    return $true
}

# Get current IP address and validate it
$currentIpAddress = $null
try {
    $currentIpAddress = (Invoke-WebRequest ifconfig.me/ip).Content.Trim()
    Write-Host "Detected current IP address: $currentIpAddress"
    
    if (-not (Test-IPv4Address -IPAddress $currentIpAddress)) {
        Write-Warning "The detected IP address '$currentIpAddress' is not in valid IPv4 format."
        $currentIpAddress = $null
    }
}
catch {
    Write-Warning "Failed to automatically detect IP address: $($_.Exception.Message)"
    $currentIpAddress = $null
}

# If current IP address is invalid or couldn't be detected, prompt user for input
while (-not $currentIpAddress -or -not (Test-IPv4Address -IPAddress $currentIpAddress)) {
    $currentIpAddress = Read-Host "Please enter a valid IPv4 address for your current location (e.g., 192.168.1.100)"
    
    if (-not (Test-IPv4Address -IPAddress $currentIpAddress)) {
        Write-Host "Invalid IPv4 address format. Please enter a valid IPv4 address with 4 octets (0-255) separated by dots." -ForegroundColor Red
        $currentIpAddress = $null
    }
}

# Process IP addresses list
$finalIpList = @()

if ($IPAddresses) {
    Write-Host "Processing provided IP addresses: $IPAddresses"
    
    # Split the comma-delimited string and trim whitespace
    $providedIps = $IPAddresses -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    
    # Validate each provided IP address
    foreach ($ip in $providedIps) {
        if (Test-IPv4Address -IPAddress $ip) {
            if ($ip -notin $finalIpList) {
                $finalIpList += $ip
                Write-Host "Added valid IP address: $ip"
            }
            else {
                Write-Host "Skipping duplicate IP address: $ip"
            }
        }
        else {
            Write-Warning "Invalid IP address format '$ip' will be skipped. Please ensure all IP addresses are in valid IPv4 format."
        }
    }
    
    # Check if current IP is in the provided list
    if ($currentIpAddress -notin $finalIpList) {
        Write-Host "Current IP address '$currentIpAddress' not found in provided list. Adding it automatically."
        $finalIpList += $currentIpAddress
    }
    else {
        Write-Host "Current IP address '$currentIpAddress' is already in the provided list."
    }
}
else {
    # If no IP addresses provided, use only the current IP
    Write-Host "No IP addresses provided. Using only current IP address: $currentIpAddress"
    $finalIpList += $currentIpAddress
}

# Convert to comma-separated string for Azure deployment
$ipAddress = $finalIpList -join ','

Write-Host "Final IP addresses list: $ipAddress"
Write-Host "Total IP addresses: $($finalIpList.Count)"

Write-Host "Getting user/group object ID for RBAC assignments"
if ($UserGroupId) {
    $userObjectId = $UserGroupId
    Write-Host "Using provided UserGroupId: $userObjectId"
}
else {
    $userObjectId = az ad signed-in-user show --query id -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get current user object ID."
    }
    Write-Host "Using current signed-in user ID: $userObjectId"
}

$deploymentName = Get-Date -Format "yyyyMMddHHmmss"

Write-Host "deploymentName=$deploymentName"
Write-Host "ResourceGroupName=$ResourceGroupName"
Write-Host "Prefix=$Prefix"
Write-Host "Location=$Location"
Write-Host "IP Addresses=$ipAddress"
Write-Host "Total IP Addresses=$($finalIpList.Count)"
if ($UserGroupId) {
    Write-Host "UserGroupId=$UserGroupId"
    Write-Host "User/Group Object ID=$userObjectId (Group)"
}
else {
    Write-Host "User/Group Object ID=$userObjectId (Current User)"
}
Write-Host "EnableAll=$($EnableAll.IsPresent)"
Write-Host "EnableAML=$EnableAML"
Write-Host "EnableCosmosDB=$EnableCosmosDB"
Write-Host "EnableAISearch=$EnableAISearch"
Write-Host "EnableAIFoundry=$EnableAIFoundry"
Write-Host "EnableContainerAppEnvironment=$EnableContainerAppEnvironment"
Write-Host "EnableCatalog=$EnableCatalog"
Write-Host "EnableAppConfiguration=$EnableAppConfiguration"
if ($EnableAIFoundry.IsPresent) {
    Write-Host "AIFoundryProjectName=$AIFoundryProjectName"
}

# Helper function to backup existing env file with timestamp
function Backup-EnvFileIfExists {
    param([string]$FilePath)
    
    if (Test-Path $FilePath) {
        $timestamp = Get-Date -Format "MMddHHmmss"
        $directory = [System.IO.Path]::GetDirectoryName($FilePath)
        $fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
        $backupPath = Join-Path $directory "$fileName.$timestamp.env"
        
        Write-Host "Backing up existing file to $backupPath"
        Rename-Item -Path $FilePath -NewName ([System.IO.Path]::GetFileName($backupPath))
    }
}

function Write-EnvFileIfParentExists {
    param(
        [string]$FilePath,
        [string]$Content,
        [string]$Description,
        [switch]$BackupExisting
    )

    $directory = Split-Path -Parent $FilePath
    if (-not (Test-Path $directory)) {
        Write-Warning "Skipping $Description because directory '$directory' does not exist. Provide an explicit path for the downstream component if you want this file generated."
        return $false
    }

    if ($BackupExisting) {
        Backup-EnvFileIfExists -FilePath $FilePath
    }

    Set-Content -Path $FilePath -Value $Content -Force
    Write-Host "$Description created at $FilePath"
    return $true
}
    
# Build parameters object for Bicep deployment
$parameters = @{
    "location"                      = @{ "value" = $Location }
    "prefix"                        = @{ "value" = $Prefix }
    "ip_list"                       = @{ "value" = $ipAddress }
    "user_object_id"                = @{ "value" = $userObjectId }
    "enableAML"                     = @{ "value" = $EnableAML.IsPresent }
    "enableCosmosDB"                = @{ "value" = $EnableCosmosDB.IsPresent }
    "enableAISearch"                = @{ "value" = $EnableAISearch.IsPresent }
    "enableAIFoundry"               = @{ "value" = $EnableAIFoundry.IsPresent }
    "enableContainerAppEnvironment" = @{ "value" = $EnableContainerAppEnvironment.IsPresent }
    "enableCatalog"                 = @{ "value" = $EnableCatalog.IsPresent }
    "enableAppConfiguration"        = @{ "value" = $EnableAppConfiguration.IsPresent }
    "env_flag"                      = @{ "value" = $EnvFlag }
}

if ($EnableAIFoundry.IsPresent) {
    $parameters["foundry_project_name"] = @{ "value" = $AIFoundryProjectName }
}

$parametersFile = @{
    "`$schema"       = "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#"
    "contentVersion" = "1.0.0.0"
    "parameters"     = $parameters
}

$parametersFile | ConvertTo-Json -Depth 5 | Set-Content -Path parameters.json -Force

# Deploy with Bicep
$rawOutput = az deployment group create --name $deploymentName `
    --resource-group $ResourceGroupName `
    --template-file main.bicep `
    --parameters parameters.json
if ($LASTEXITCODE -ne 0) {

    az deployment group validate --name $deploymentName --template-file main.bicep `
        --parameters parameters.json `
        -g $ResourceGroupName `
        --debug
    throw "Failed to deploy the resources with Bicep. Please check the error log for more details."
}

$output = $rawOutput | ConvertFrom-Json
$amlWorkspaceName = $output.properties.outputs.aml_workspace_name.value
$amlComputeName = $output.properties.outputs.aml_compute_name.value
$appJobInputDatastore = $output.properties.outputs.app_job_input_datastore.value
$appJobOutputDatastore = $output.properties.outputs.app_job_output_datastore.value
$amlManagedIdentityId = $output.properties.outputs.aml_managed_identity_id.value
$catalogStorageAccountName = $output.properties.outputs.catalog_storage_account_name.value
$amlStorageName = $output.properties.outputs.aml_storage_name.value
$amlId = $output.properties.outputs.aml_id.value
$amlTenantId = $output.properties.outputs.aml_tenant_id.value
$keyVaultName = $output.properties.outputs.key_vault_name.value
$appInsightsConnectionString = $output.properties.outputs.app_insights_connection_string.value
$appsStorageAccountName = $output.properties.outputs.apps_storage_account_name.value
$containerRegistryName = $output.properties.outputs.container_registry_name.value
$aiSearchName = $output.properties.outputs.ai_search_name.value
$aiFoundryProjectEndpoint = $output.properties.outputs.ai_foundry_project_endpoint.value
$aiFoundryModelDeployment = $output.properties.outputs.ai_foundry_model_deployment.value
$azureOpenAiEndpoint = $output.properties.outputs.azure_openai_endpoint.value
$azureOpenAiEmbeddingDeployment = $output.properties.outputs.azure_openai_embedding_deployment.value
$azureOpenAiEmbeddingModel = $output.properties.outputs.azure_openai_embedding_model.value
$azureOpenAiApiVersion = $output.properties.outputs.azure_openai_api_version.value
$containerAppEnvironmentName = $output.properties.outputs.container_app_environment_name.value
$groundTruthsContainerName = $output.properties.outputs.ground_truths_container_name.value
$appConfigurationName = $output.properties.outputs.app_configuration_name.value
$appConfigurationEndpoint = $output.properties.outputs.app_configuration_endpoint.value

# Store App Insights connection string in Key Vault
Write-Host "Storing App Insights connection string in Key Vault..."
az keyvault secret set --vault-name $keyVaultName --name "app-insights-connection-string" --value $appInsightsConnectionString
if ($LASTEXITCODE -ne 0) {
    throw "Failed to store App Insights connection string in Key Vault."
}

# Get the Key Vault secret URL for App Insights connection string
$amlAppInsightsConnectionString = "https://$keyVaultName.vault.azure.net/secrets/app-insights-connection-string"
Write-Host "App Insights connection string stored in Key Vault. Secret URL: $amlAppInsightsConnectionString"

# AML-specific configuration (only if EnableAML is true)
if ($EnableAML.IsPresent) {
    # Allow AzureML to access the storage account
    Write-Host "Configuring AzureML storage access..."
    
    # Temporarily change error action to continue to handle Azure CLI warnings
    $originalErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    
    az storage account network-rule add --account-name $amlStorageName `
        --resource-group $ResourceGroupName `
        --tenant-id $amlTenantId `
        --action 'Allow' `
        --resource-id $amlId
    
    # Restore original error action preference
    $ErrorActionPreference = $originalErrorActionPreference
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure AzureML to access the storage account."
    }

    # Configure AzureML workspace to use compute for image builds
    Write-Host "Configuring AzureML workspace compute settings..."
    az ml workspace update --name $amlWorkspaceName --resource-group $ResourceGroupName --image-build-compute $amlComputeName
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure AzureML to use compute $amlComputeName."
    }
}

# Create environment file for AML eval framework (only if EnableAML is true)
if ($EnableAML.IsPresent) {
    Write-Host "Creating AML environment configuration file..."
    $stringBuilder = New-Object System.Text.StringBuilder
    $hasLocalEvaluationAssets = (
        -not [string]::IsNullOrWhiteSpace($EvaluationEnvPath) -and
        -not [string]::IsNullOrWhiteSpace($EvaluationModuleDir) -and
        (Test-Path (Split-Path -Parent $EvaluationEnvPath)) -and
        (Test-Path $EvaluationModuleDir)
    )

    $subscriptionId = az account show --query id -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get subscription id."
    }

    [void]$stringBuilder.AppendLine("# === AML Job Configuration (usually does not change) ===")
    [void]$stringBuilder.AppendLine("AML_SUBSCRIPTION_ID=$subscriptionId")
    [void]$stringBuilder.AppendLine("AML_RESOURCE_GROUP_NAME=$ResourceGroupName")
    [void]$stringBuilder.AppendLine("AML_WORKSPACE_NAME=$amlWorkspaceName")
    [void]$stringBuilder.AppendLine("AML_COMPUTE_NAME=$amlComputeName")
    [void]$stringBuilder.AppendLine("AML_LOG_LEVEL=DEBUG")
    [void]$stringBuilder.AppendLine("AML_JOB_INSTANCE_COUNT=1")
    [void]$stringBuilder.AppendLine("AML_JOB_INPUT_DATASTORE=$appJobInputDatastore")
    [void]$stringBuilder.AppendLine("AML_JOB_OUTPUT_DATASTORE=$appJobOutputDatastore")
    [void]$stringBuilder.AppendLine("JOB_MANAGED_IDENTITY_ID=$amlManagedIdentityId")
    [void]$stringBuilder.AppendLine("AML_INFERENCE_CONCURRENCY=1")
    [void]$stringBuilder.AppendLine("AML_EVAL_CONCURRENCY=1")
    [void]$stringBuilder.AppendLine("AML_CONFIG_TAG_NAME=smoke")
    [void]$stringBuilder.AppendLine("AML_INF_ENV_PATH=../inference/foundryv2agent/.env")
    [void]$stringBuilder.AppendLine("AML_GROUND_TRUTHS_PATH=smoke")
    [void]$stringBuilder.AppendLine("AML_INF_MODULE_DIR=../inference/foundryv2agent")
    [void]$stringBuilder.AppendLine("AML_APP_INSIGHTS_CONNECTION_STRING=$amlAppInsightsConnectionString")
    if ($hasLocalEvaluationAssets) {
        [void]$stringBuilder.AppendLine("AML_EVAL_ENV_PATH=$EvaluationEnvPath")
        [void]$stringBuilder.AppendLine("AML_EVAL_MODULE_DIR=$EvaluationModuleDir")
    }
    else {
        [void]$stringBuilder.AppendLine("# AML_EVAL_ENV_PATH=")
        [void]$stringBuilder.AppendLine("# AML_EVAL_MODULE_DIR=")
    }
    [void]$stringBuilder.AppendLine("")
    [void]$stringBuilder.AppendLine("# === Experiment Configuration that might change ===")
    [void]$stringBuilder.AppendLine("# GROUND_TRUTH_INCLUDE_TAGS= # comma delimited list of tags to include in ground truths, e.g., foo,bar,test")
    [void]$stringBuilder.AppendLine("")
    [void]$stringBuilder.AppendLine("# === Experiment Configuration you should review for each run ===")
    [void]$stringBuilder.AppendLine("AML_EXPERIMENT_NAME=test_aml_run")
    [void]$stringBuilder.AppendLine("AML_IMAGE_NAME=mcr.microsoft.com/azureml/openmpi4.1.0-ubuntu22.04")
    [void]$stringBuilder.AppendLine("#INF_INFERENCE_SERVICE_URL=")
    [void]$stringBuilder.AppendLine("#INF_INFERENCE_SERVICE_TUNNEL_TOKEN=")

    $experimentEnvContent = $stringBuilder.ToString()
    if (-not $EnableAppConfiguration) {
        Write-EnvFileIfParentExists -FilePath $ExperimentEnvPath -Content $experimentEnvContent -Description "AML environment test configuration file" | Out-Null
    } else {
        Write-Host "Skipping local experiment .env file creation (EnableAppConfiguration is set)"
    }

    # Create evaluation environment file
    Write-Host "Creating evaluation environment configuration file..."
    $evalStringBuilder = New-Object System.Text.StringBuilder

    [void]$evalStringBuilder.AppendLine("# === Evaluation Configuration ===")
    [void]$evalStringBuilder.AppendLine("AZURE_OPENAI_ENDPOINT=$azureOpenAiEndpoint")
    [void]$evalStringBuilder.AppendLine("AZURE_OPENAI_DEPLOYMENT=$aiFoundryModelDeployment")
    [void]$evalStringBuilder.AppendLine("AZURE_OPENAI_VERSION=$azureOpenAiApiVersion")
    [void]$evalStringBuilder.AppendLine("EVAL_PORT=8080 # start port for eval service")
    [void]$evalStringBuilder.AppendLine("DISABLE_TASK_ADHERENCE=true")
    [void]$evalStringBuilder.AppendLine("# You can choose which metrics to disable")
    [void]$evalStringBuilder.AppendLine("DISABLED_METRICS=generation_citation_compliance,generation_correctness,generation_coherence,generation_fluency,generation_groundedness,generation_relevance,generation_similarity,task_adherence")
    [void]$evalStringBuilder.AppendLine("LOGGING_LEVEL=DEBUG")

    $evalEnvContent = $evalStringBuilder.ToString()
    if (-not $EnableAppConfiguration) {
        if ($hasLocalEvaluationAssets) {
            Write-EnvFileIfParentExists -FilePath $EvaluationEnvPath -Content $evalEnvContent -Description "Evaluation environment configuration file" -BackupExisting | Out-Null
        }
        else {
            Write-Warning "Skipping local evaluation .env file creation because the evaluation directory is not available. Provide -EvaluationEnvPath and -EvaluationModuleDir if you want this file generated."
        }
    } else {
        Write-Host "Skipping local evaluation .env file creation (EnableAppConfiguration is set)"
    }
}

$DataSourceName = $AIFoundryProjectName.ToLower().Replace("_", "").Replace("-", "")
$IndexVersion = "1"

if ($EnableAISearch -and $EnableContainerAppEnvironment -and $EnableAIFoundry) {
    Write-Host "Creating Azure environment configuration file..."
    $azureStringBuilder = New-Object System.Text.StringBuilder

    [void]$azureStringBuilder.AppendLine("# === Search Configuration ===")
    [void]$azureStringBuilder.AppendLine("AZURE_RESOURCE_GROUP=$ResourceGroupName")
    [void]$azureStringBuilder.AppendLine("AZURE_CONTAINER_APP_ENV=$containerAppEnvironmentName")
    [void]$azureStringBuilder.AppendLine("AZURE_CONTAINER_APP_NAME=parsemarkdown")
    [void]$azureStringBuilder.AppendLine("AZURE_CONTAINER_REGISTRY_NAME=$containerRegistryName")
    [void]$azureStringBuilder.AppendLine("AZURE_CONTAINER_REGISTRY_RESOURCE_GROUP=$ResourceGroupName")
    [void]$azureStringBuilder.AppendLine("AZURE_AI_SEARCH=$aiSearchName")
    [void]$azureStringBuilder.AppendLine("AZURE_CONTAINER_APP_REG_NAME=parsemarkdown$Prefix")
    [void]$azureStringBuilder.AppendLine("INDEX_NAME=$DataSourceName")    
    [void]$azureStringBuilder.AppendLine("INDEX_VERSION=$IndexVersion")
    [void]$azureStringBuilder.AppendLine("AZURE_OPENAI_EMBEDDING_DEPLOYMENT=$azureOpenAiEmbeddingDeployment")
    [void]$azureStringBuilder.AppendLine("AZURE_OPENAI_EMBEDDING_MODEL=$azureOpenAiEmbeddingModel")
    [void]$azureStringBuilder.AppendLine("AZURE_OPENAI_ENDPOINT=$azureOpenAiEndpoint")
    [void]$azureStringBuilder.AppendLine("AZURE_STORAGE_ACCOUNT_NAME=$appsStorageAccountName")
    # the container name is the data source
    [void]$azureStringBuilder.AppendLine("AZURE_STORAGE_CONTAINER_NAME=$DataSourceName")  

    $searchEnvContent = $azureStringBuilder.ToString()
    if (-not $EnableAppConfiguration) {
        $searchEnvPath = "../search/.env"
        Backup-EnvFileIfExists -FilePath $searchEnvPath
        Set-Content -Path $searchEnvPath -Value $searchEnvContent -Force
        Write-Host "Azure environment configuration file created at $searchEnvPath"
    } else {
        Write-Host "Skipping local search .env file creation (EnableAppConfiguration is set)"
    }

    $azureStringBuilder = New-Object System.Text.StringBuilder
    [void]$azureStringBuilder.AppendLine("# === Ingestion Configuration ===")
    [void]$azureStringBuilder.AppendLine("BLOGS_PATH=")
    [void]$azureStringBuilder.AppendLine("AZURE_STORAGE_ACCOUNT_NAME=$appsStorageAccountName")
    # the container name is the data source
    [void]$azureStringBuilder.AppendLine("AZURE_STORAGE_CONTAINER_NAME=$DataSourceName")  
    
    $ingestionEnvContent = $azureStringBuilder.ToString()
    if (-not $EnableAppConfiguration) {
        $ingestionEnvPath = "../ingestion/.env"
        Backup-EnvFileIfExists -FilePath $ingestionEnvPath
        Set-Content -Path $ingestionEnvPath -Value $ingestionEnvContent -Force
        Write-Host "Azure environment configuration file created at $ingestionEnvPath"
    } else {
        Write-Host "Skipping local ingestion .env file creation (EnableAppConfiguration is set)"
    }    
}

if ($EnableAIFoundry) {
    # Create AIFoundry environment file
    Write-Host "Creating agent environment configuration file..."
    $foundryStringBuilder = New-Object System.Text.StringBuilder

    [void]$foundryStringBuilder.AppendLine("# === Agent Configuration ===")
    [void]$foundryStringBuilder.AppendLine("LOGGING_LEVEL=INFO")
    [void]$foundryStringBuilder.AppendLine("AZURE_FOUNDRY_PROJECT_ENDPOINT=$aiFoundryProjectEndpoint")
    [void]$foundryStringBuilder.AppendLine("AZURE_FOUNDRY_MODEL_DEPLOYMENT=$aiFoundryModelDeployment")
    [void]$foundryStringBuilder.AppendLine("AZURE_AI_SEARCH=$aiSearchName")
    [void]$foundryStringBuilder.AppendLine("INDEX_NAME=$DataSourceName")
    [void]$foundryStringBuilder.AppendLine("INDEX_VERSION=$IndexVersion")
    [void]$foundryStringBuilder.AppendLine("INDEX_QUERY_TOP=5")
    [void]$foundryStringBuilder.AppendLine("INDEX_QUERY_TYPE=simple")
    [void]$foundryStringBuilder.AppendLine("AZURE_AGENT_NAME=$DataSourceName-$IndexVersion")
    [void]$foundryStringBuilder.AppendLine("AZURE_STORAGE_ACCOUNT_NAME=$appsStorageAccountName")
    [void]$foundryStringBuilder.AppendLine("AZURE_STORAGE_CONTAINER_NAME=$groundTruthsContainerName")
    [void]$foundryStringBuilder.AppendLine("AZURE_STORAGE_CONTAINER_PATH=smoke")
    [void]$foundryStringBuilder.AppendLine("AZURE_RESOURCE_GROUP=$ResourceGroupName")

    $agentEnvContent = $foundryStringBuilder.ToString()
    if (-not $EnableAppConfiguration) {
        $agentEnvPath = "../inference/foundryv2agent/.env"
        Backup-EnvFileIfExists -FilePath $agentEnvPath
        Set-Content -Path $agentEnvPath -Value $agentEnvContent -Force
        Write-Host "Agent environment configuration file created at $agentEnvPath"
    } else {
        Write-Host "Skipping local agent .env file creation (EnableAppConfiguration is set)"
    }
}

if ($EnableAppConfiguration) {

    if (-not $appConfigurationName -or -not $appConfigurationEndpoint) {
        Write-Warning "App Configuration was not deployed (name or endpoint is empty). Skipping App Configuration push."
    }
    else {
        Write-Host "`n========================================" -ForegroundColor Cyan
        Write-Host "Pushing Environment Variables to Azure App Configuration" -ForegroundColor Cyan
        Write-Host "  App Configuration: $appConfigurationName" -ForegroundColor Cyan
        Write-Host "  Endpoint: $appConfigurationEndpoint" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan

        # Helper function to batch-import environment variables into App Configuration with a label.
        # Uses 'az appconfig kv import' to push all key-value pairs in a single operation.
        # Accepts in-memory string content (from StringBuilder) instead of reading from a file.
        function Push-EnvToAppConfig {
            param(
                [string]$AppConfigName,
                [string]$Label,
                [string]$Content
            )

            if (-not $Content) {
                Write-Warning "    No content provided for label '$Label'"
                return
            }

            # Create a clean temp file stripping inline comments and empty-value lines
            # so that 'az appconfig kv import' only gets clean KEY=VALUE pairs.
            $tempFile = [System.IO.Path]::GetTempFileName()
            try {
                $cleanLines = @()
                foreach ($line in ($Content -split "`n")) {
                    $trimmed = $line.Trim()
                    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }

                    $parts = $trimmed -split '=', 2
                    if ($parts.Count -ne 2) { continue }

                    $key = $parts[0].Trim()
                    $value = $parts[1].Trim()

                    # Strip inline comments (e.g., "8080 # start port")
                    if ($value -match '^([^#]*?)\s+#\s') {
                        $value = $matches[1].Trim()
                    }

                    # Skip keys with empty values
                    if (-not $value) {
                        Write-Host "    Skipping $key (empty value)" -ForegroundColor DarkGray
                        continue
                    }

                    $cleanLines += "$key=$value"
                }

                if ($cleanLines.Count -eq 0) {
                    Write-Host "    No variables to push for label '$Label'" -ForegroundColor DarkGray
                    return
                }

                $cleanLines | Set-Content -Path $tempFile -Encoding UTF8

                az appconfig kv import `
                    --name $AppConfigName `
                    --source file `
                    --path $tempFile `
                    --format properties `
                    --label $Label `
                    --auth-mode login `
                    --yes `
                    -o none 2>&1

                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "    Failed to import variables with label '$Label'"
                }
                else {
                    Write-Host "  Label '$Label': $($cleanLines.Count) keys imported" -ForegroundColor Green
                }
            }
            finally {
                Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
            }
        }

        # --- Push experiment variables (from in-memory content) ---
        if ($EnableAML.IsPresent) {
            Write-Host "`n  Pushing 'experiment' label..." -ForegroundColor Yellow
            Push-EnvToAppConfig -AppConfigName $appConfigurationName -Label "experiment" -Content $experimentEnvContent
        }

        # --- Push search variables (from in-memory content) ---
        if ($EnableAISearch -and $EnableContainerAppEnvironment -and $EnableAIFoundry) {
            Write-Host "`n  Pushing 'search' label..." -ForegroundColor Yellow
            Push-EnvToAppConfig -AppConfigName $appConfigurationName -Label "search" -Content $searchEnvContent

            Write-Host "`n  Pushing 'ingestion' label..." -ForegroundColor Yellow
            Push-EnvToAppConfig -AppConfigName $appConfigurationName -Label "ingestion" -Content $ingestionEnvContent
        }

        # --- Push agent variables (from in-memory content) ---
        if ($EnableAIFoundry) {
            Write-Host "`n  Pushing 'agent' label..." -ForegroundColor Yellow
            Push-EnvToAppConfig -AppConfigName $appConfigurationName -Label "agent" -Content $agentEnvContent
        }

        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "App Configuration push complete!" -ForegroundColor Green
        Write-Host "  View in portal: https://portal.azure.com/#resource/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$ResourceGroupName/providers/Microsoft.AppConfiguration/configurationStores/$appConfigurationName/kvs" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Green
    }
}

# Generate root-level .env file with CONFIG_SOURCE
$rootEnvPath = "../.env"
Backup-EnvFileIfExists -FilePath $rootEnvPath
if ($EnableAppConfiguration -and $appConfigurationName) {
    Set-Content -Path $rootEnvPath -Value "CONFIG_SOURCE=$appConfigurationName" -Force
    Write-Host "Root .env file created at $rootEnvPath with CONFIG_SOURCE=$appConfigurationName"
} else {
    Set-Content -Path $rootEnvPath -Value "CONFIG_SOURCE=" -Force
    Write-Host "Root .env file created at $rootEnvPath with CONFIG_SOURCE= (empty)"
}