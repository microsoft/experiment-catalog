<#
.SYNOPSIS
    Tests the ParseMarkdown HTTP service endpoint with Entra ID authentication.

.DESCRIPTION
    This script:
    1. Loads the container app URI from .env file
    2. Obtains a bearer token using Azure CLI
    3. Invokes the ParseMarkdown endpoint with sample markdown content

.EXAMPLE
    .\test-parsemarkdown.ps1
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

# Load environment variables from .env file
Write-Host "Loading configuration from .env file..." -ForegroundColor Cyan
$envValues = Get-EnvFileValues -Path $envFilePath

$containerAppUri = $envValues["AZURE_CONTAINER_APP_URI"]
$containerAppRegName = $envValues["AZURE_CONTAINER_APP_REG_NAME"]

if (-not $containerAppUri) {
    Write-Host "Error: AZURE_CONTAINER_APP_URI not found in .env file." -ForegroundColor Red
    Write-Host "Please run deploy-container-app.ps1 first to deploy the container app." -ForegroundColor Yellow
    exit 1
}

if (-not $containerAppRegName) {
    Write-Host "Error: AZURE_CONTAINER_APP_REG_NAME not found in .env file." -ForegroundColor Red
    Write-Host "Please run deploy-container-app.ps1 first to deploy the container app." -ForegroundColor Yellow
    exit 1
}

Write-Host "  Endpoint: $containerAppUri" -ForegroundColor Green
Write-Host "  App Registration: $containerAppRegName" -ForegroundColor Green

# Get tenant ID
Write-Host "`nRetrieving Azure tenant ID..." -ForegroundColor Cyan
$tenantId = az account show --query "tenantId" -o tsv

if ($LASTEXITCODE -ne 0 -or -not $tenantId) {
    Write-Host "Error: Failed to get tenant ID. Please ensure you are logged in to Azure CLI." -ForegroundColor Red
    exit 1
}

Write-Host "  Tenant ID: $tenantId" -ForegroundColor Green

# Look up the client ID (appId) from the app registration name
Write-Host "`nLooking up client ID for app registration '$containerAppRegName'..." -ForegroundColor Cyan
$clientId = az ad app list --display-name $containerAppRegName --query "[0].appId" -o tsv

if ($LASTEXITCODE -ne 0 -or -not $clientId) {
    Write-Host "Error: Failed to find app registration with name '$containerAppRegName'." -ForegroundColor Red
    Write-Host "Please ensure the app registration exists and you have permission to view it." -ForegroundColor Yellow
    exit 1
}

Write-Host "  Client ID: $clientId" -ForegroundColor Green

# Get access token
Write-Host "`nObtaining access token..." -ForegroundColor Cyan
$accessToken = az account get-access-token --scope "api://$clientId/.default" --tenant $tenantId --query "accessToken" -o tsv

if ($LASTEXITCODE -ne 0 -or -not $accessToken) {
    Write-Host "Error: Failed to obtain access token." -ForegroundColor Red
    Write-Host "This may indicate that:" -ForegroundColor Yellow
    Write-Host "  1. The App Registration is not configured correctly" -ForegroundColor Yellow
    Write-Host "  2. Azure CLI is not pre-authorized for the app" -ForegroundColor Yellow
    Write-Host "  3. You need to run deploy-container-app.ps1 with AZURE_CONTAINER_APP_REG_NAME set" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Access token obtained successfully." -ForegroundColor Green

# Prepare the request body
$requestBody = @{
    values = @(
        @{
            recordId = "1"
            data = @{
                content = @"
---
author1: John Doe
author2: Jane Smith
post_slug: test-parsing-markdown
post_title: "Testing the Markdown Parser"
post_date: 2025-01-27 00:00:00
tags: azure, search, testing
summary: "This is a test summary for the markdown parser custom skill."
---

# Hello World

This is the body content of the markdown file.
"@
            }
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "`nRequest Body:" -ForegroundColor Cyan
Write-Host $requestBody -ForegroundColor Gray

# Make the request
Write-Host "`nInvoking ParseMarkdown endpoint..." -ForegroundColor Cyan

try {
    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri $containerAppUri -Method Post -Headers $headers -Body $requestBody
    
    Write-Host "`nResponse received successfully!" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor White
    
} catch {
    Write-Host "`nError invoking endpoint:" -ForegroundColor Red
    Write-Host "  Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "`nResponse Body:" -ForegroundColor Red
        Write-Host $responseBody -ForegroundColor Red
    }
    
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Test completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
