<#
.SYNOPSIS
    Uploads markdown files from year-level folders to Azure Storage using azcopy with Azure AD authentication.

.DESCRIPTION
    This script navigates through year-level folders (2022, 2023, 2024, 2025, etc.)
    and recursively uploads all .md files to Azure Blob Storage using Azure AD authentication.
    Files that already exist in the destination are not overwritten.
    
    Required values are loaded from a .env file in the same directory as the script.

.NOTES
    Required .env file format:
        AZURE_STORAGE_ACCOUNT_NAME=yourstorageaccount
        AZURE_STORAGE_CONTAINER_NAME=yourcontainer

.EXAMPLE
    .\upload-blogs-to-azure.ps1
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
            # Skip empty lines and comments
            if ($line -and -not $line.StartsWith('#')) {
                $parts = $line -split '=', 2
                if ($parts.Count -eq 2) {
                    $key = $parts[0].Trim()
                    $value = $parts[1].Trim()
                    # Remove surrounding quotes if present
                    $value = $value -replace '^["'']|["'']$', ''
                    $envValues[$key] = $value
                }
            }
        }
    }
    
    return $envValues
}

# Load environment variables from .env file
$envValues = Get-EnvFileValues -Path $envFilePath

# Get values from .env file
$StorageAccountName = $envValues["AZURE_STORAGE_ACCOUNT_NAME"]
$ContainerName = $envValues["AZURE_STORAGE_CONTAINER_NAME"]
$BlogsPath = $envValues["BLOGS_PATH"]

# Validate required values
$missingValues = @()

if (-not $StorageAccountName) {
    $missingValues += "AZURE_STORAGE_ACCOUNT_NAME"
}

if (-not $ContainerName) {
    $missingValues += "AZURE_STORAGE_CONTAINER_NAME"
}

if (-not $BlogsPath) {
    $missingValues += "BLOGS_PATH"
}

if ($missingValues.Count -gt 0) {
    Write-Host "`nMissing required values in .env file!" -ForegroundColor Red
    Write-Host "Please create a .env file at: $envFilePath" -ForegroundColor Yellow
    Write-Host "`nRequired fields:" -ForegroundColor Cyan
    Write-Host "  BLOGS_PATH=<path-to-blogs-repository>"
    Write-Host "  AZURE_STORAGE_ACCOUNT_NAME=<your-storage-account-name>"
    Write-Host "  AZURE_STORAGE_CONTAINER_NAME=<your-container-name>"
    Write-Host "`nExample .env file:" -ForegroundColor Cyan
    Write-Host "  BLOGS_PATH=C:\dev\cse-devblogs"
    Write-Host "  AZURE_STORAGE_ACCOUNT_NAME=mystorageaccount"
    Write-Host "  AZURE_STORAGE_CONTAINER_NAME=blogs"
    Write-Host "`nMissing values: $($missingValues -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "Configuration loaded from .env file:" -ForegroundColor Green
Write-Host "  Blogs Path: $BlogsPath"
Write-Host "  Storage Account: $StorageAccountName"
Write-Host "  Container: $ContainerName"
Write-Host "  Authentication: Azure AD" -ForegroundColor Cyan

# Set environment variable for azcopy to use Azure CLI credentials
$env:AZCOPY_AUTO_LOGIN_TYPE = "AZCLI"

# Validate azcopy is installed
$azcopyPath = Get-Command azcopy -ErrorAction SilentlyContinue
if (-not $azcopyPath) {
    Write-Error "azcopy is not installed or not in PATH. Please install azcopy first."
    Write-Host "Download from: https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-v10"
    exit 1
}

# Use BLOGS_PATH from .env as the repository root
$repoRoot = $BlogsPath
Write-Host "Repository root: $repoRoot" -ForegroundColor Cyan

# Validate that the blogs path exists
if (-not (Test-Path $repoRoot)) {
    Write-Error "BLOGS_PATH does not exist: $repoRoot"
    exit 1
}

# Define year-level folders pattern (4-digit years)
$yearFolders = Get-ChildItem -Path $repoRoot -Directory | Where-Object { $_.Name -match '^\d{4}$' }

if ($yearFolders.Count -eq 0) {
    Write-Warning "No year-level folders found in $repoRoot"
    exit 0
}

Write-Host "Found year folders: $($yearFolders.Name -join ', ')" -ForegroundColor Green

# Check if the storage container exists, create it if it doesn't
Write-Host "`nChecking if storage container exists..." -ForegroundColor Cyan

# Use az CLI to check if container exists
$containerExists = $false
$checkOutput = az storage container exists `
    --account-name $StorageAccountName `
    --name $ContainerName `
    --auth-mode login `
    --only-show-errors `
    2>&1

$checkExitCode = $LASTEXITCODE

if ($checkExitCode -ne 0) {
    Write-Host "  Error checking container existence" -ForegroundColor Red
    Write-Host "  Output: $checkOutput" -ForegroundColor Gray
    Write-Host "`n  Please ensure:" -ForegroundColor Yellow
    Write-Host "    1. You are logged in with 'az login'" -ForegroundColor Yellow
    Write-Host "    2. Azure CLI is installed and in PATH" -ForegroundColor Yellow
    Write-Host "    3. Your account has appropriate permissions on the storage account" -ForegroundColor Yellow
    exit 1
}

# Extract JSON from the output (handle warnings and other non-JSON text)
$outputString = $checkOutput -join " "
if ($outputString -match '\{.*\}') {
    $jsonOutput = $Matches[0]
}
else {
    Write-Host "  Could not find JSON in output" -ForegroundColor Red
    Write-Host "  Raw output: $outputString" -ForegroundColor Gray
    exit 1
}

try {
    $containerCheck = $jsonOutput | ConvertFrom-Json
    $containerExists = $containerCheck.exists
}
catch {
    Write-Host "  Error parsing container check response: $_" -ForegroundColor Red
    Write-Host "  Extracted JSON: $jsonOutput" -ForegroundColor Gray
    exit 1
}

if ($containerExists) {
    Write-Host "  Container '$ContainerName' already exists" -ForegroundColor Green
}
else {
    Write-Host "  Container '$ContainerName' does not exist. Creating..." -ForegroundColor Yellow
    
    $createOutput = az storage container create `
        --account-name $StorageAccountName `
        --name $ContainerName `
        --auth-mode login `
        --only-show-errors `
        2>&1
    
    $createExitCode = $LASTEXITCODE
    
    if ($createExitCode -eq 0) {
        Write-Host "  Container '$ContainerName' created successfully" -ForegroundColor Green
    }
    else {
        Write-Host "  Failed to create container" -ForegroundColor Red
        Write-Host "  Error: $createOutput" -ForegroundColor Gray
        Write-Host "`n  Please ensure:" -ForegroundColor Yellow
        Write-Host "    1. You are logged in with 'az login'" -ForegroundColor Yellow
        Write-Host "    2. Your account has appropriate permissions (e.g., 'Storage Blob Data Contributor' or 'Contributor') on the storage account" -ForegroundColor Yellow
        exit 1
    }
}

# Build the destination URL
$destinationBase = "https://$StorageAccountName.blob.core.windows.net/$ContainerName"

# Sync each year folder to Azure Blob Storage
foreach ($yearFolder in $yearFolders) {
    Write-Host "`nSyncing year folder: $($yearFolder.Name)" -ForegroundColor Yellow
    
    $sourcePath = $yearFolder.FullName
    $destinationPath = "$destinationBase/$($yearFolder.Name)"
    
    Write-Host "  Source: $sourcePath" -ForegroundColor Gray
    Write-Host "  Destination: $destinationPath" -ForegroundColor Gray
    
    # Build azcopy sync command arguments
    # --include-pattern="*.md" ensures only .md files are synced
    # Azure AD authentication is handled via AZCOPY_AUTO_LOGIN_TYPE environment variable
    $azcopyArgs = @(
        "sync"
        $sourcePath
        $destinationPath
        "--include-pattern=*.md"
        "--recursive"
    )
    
    try {
        Write-Host "  Running azcopy sync..." -ForegroundColor Cyan
        $output = & azcopy @azcopyArgs 2>&1
        $exitCode = $LASTEXITCODE
        $outputString = $output -join "`n"
        
        # Check for permission/authentication errors and stop immediately
        if ($outputString -match "AuthorizationPermissionMismatch|AuthenticationFailed|403|401|not authorized|access denied") {
            Write-Host "`n  PERMISSION ERROR DETECTED" -ForegroundColor Red
            Write-Host "`n  === Detailed Error ===" -ForegroundColor Yellow
            Write-Host $outputString -ForegroundColor Gray
            Write-Host "  === End Error ===" -ForegroundColor Yellow
            Write-Host "`n  Please ensure:" -ForegroundColor Yellow
            Write-Host "    1. You are logged in with 'az login'" -ForegroundColor Yellow
            Write-Host "    2. Your account has 'Storage Blob Data Contributor' or 'Storage Blob Data Owner' role on the storage account" -ForegroundColor Yellow
            Write-Host "`nStopping sync process." -ForegroundColor Red
            exit 1
        }
        
        if ($exitCode -eq 0) {
            Write-Host "  Sync completed successfully" -ForegroundColor Green
            # Display summary from azcopy output
            if ($outputString -match "Files Transferred:\s*(\d+)") {
                Write-Host "    Files transferred: $($Matches[1])" -ForegroundColor Cyan
            }
            if ($outputString -match "Transfers Skipped:\s*(\d+)") {
                Write-Host "    Files skipped (unchanged): $($Matches[1])" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "  Sync failed (exit code: $exitCode)" -ForegroundColor Red
            Write-Host "`n  === Detailed Error ===" -ForegroundColor Yellow
            Write-Host $outputString -ForegroundColor Gray
            Write-Host "  === End Error ===" -ForegroundColor Yellow
            Write-Host "`nStopping sync process due to error." -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "  Error: $_" -ForegroundColor Red
        exit 1
    }
}

# Print summary
Write-Host "`n========== Sync Complete ==========" -ForegroundColor Cyan
Write-Host "All year folders have been synced to Azure Blob Storage." -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Cyan
