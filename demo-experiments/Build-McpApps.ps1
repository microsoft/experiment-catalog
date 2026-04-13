<#
.SYNOPSIS
    Builds all MCP apps in the demo-experiments directory.

.DESCRIPTION
    Iterates through each *-mcp-apps folder under demo-experiments, runs npm install
    and npm run build for each one, and creates the .vscode/mcp.json configuration file
    with server references for all MCP apps.

.EXAMPLE
    ./Build-McpApps.ps1

    Installs dependencies and builds all MCP apps, then generates .vscode/mcp.json.

.NOTES
    Requires Node.js v22.11.0+ and npm to be installed.
#>

[CmdletBinding()]
param()

begin {
    $ErrorActionPreference = 'Stop'
    $ScriptRoot = $PSScriptRoot
    Write-Verbose "Script root: $ScriptRoot"
}

process {
    # Discover all MCP app folders matching the *-mcp-apps naming convention
    $McpAppFolders = Get-ChildItem -Path $ScriptRoot -Directory -Filter '*-mcp-apps' |
        Sort-Object -Property Name

    if ($McpAppFolders.Count -eq 0) {
        Write-Warning 'No MCP app folders found matching pattern *-mcp-apps.'
        return
    }

    Write-Host "Found $($McpAppFolders.Count) MCP app(s) to build:" -ForegroundColor Cyan
    $McpAppFolders | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Cyan }
    Write-Host ''

    # Build each MCP app
    $FailedApps = @()
    foreach ($Folder in $McpAppFolders) {
        Write-Host "Building $($Folder.Name)..." -ForegroundColor Yellow
        try {
            Push-Location -Path $Folder.FullName

            Write-Verbose "Running npm install in $($Folder.Name)"
            npm install
            if ($LASTEXITCODE -ne 0) {
                $PSCmdlet.ThrowTerminatingError(
                    [System.Management.Automation.ErrorRecord]::new(
                        [System.Exception]::new("npm install failed for $($Folder.Name)"),
                        'NpmInstallFailed',
                        [System.Management.Automation.ErrorCategory]::InvalidOperation,
                        $Folder.Name
                    )
                )
            }

            Write-Verbose "Running npm run build in $($Folder.Name)"
            npm run build
            if ($LASTEXITCODE -ne 0) {
                $PSCmdlet.ThrowTerminatingError(
                    [System.Management.Automation.ErrorRecord]::new(
                        [System.Exception]::new("npm run build failed for $($Folder.Name)"),
                        'NpmBuildFailed',
                        [System.Management.Automation.ErrorCategory]::InvalidOperation,
                        $Folder.Name
                    )
                )
            }

            Write-Host "  $($Folder.Name) built successfully." -ForegroundColor Green
        }
        catch {
            Write-Error "Failed to build $($Folder.Name): $_"
            $FailedApps += $Folder.Name
        }
        finally {
            Pop-Location
        }
    }

    # Create .vscode/mcp.json with server references
    $VsCodeFolder = Join-Path -Path $ScriptRoot -ChildPath '.vscode'
    if (-not (Test-Path -Path $VsCodeFolder)) {
        Write-Verbose "Creating .vscode folder at $VsCodeFolder"
        New-Item -Path $VsCodeFolder -ItemType Directory | Out-Null
    }

    $Servers = [ordered]@{}
    foreach ($Folder in $McpAppFolders) {
        # Derive server name by removing the '-mcp-apps' suffix
        $ServerName = $Folder.Name -replace '-mcp-apps$', ''
        $Servers[$ServerName] = [ordered]@{
            type    = 'stdio'
            command = 'npx'
            args    = @('tsx', 'server.ts')
            cwd     = "`${workspaceFolder}/$($Folder.Name)"
        }
    }

    $McpConfig = [ordered]@{
        servers = $Servers
    }

    $McpJsonPath = Join-Path -Path $VsCodeFolder -ChildPath 'mcp.json'
    $JsonContent = $McpConfig | ConvertTo-Json -Depth 4
    Set-Content -Path $McpJsonPath -Value $JsonContent -Encoding utf8
    Write-Host ''
    Write-Host ".vscode/mcp.json created at $McpJsonPath" -ForegroundColor Green

    # Summary
    Write-Host ''
    if ($FailedApps.Count -gt 0) {
        Write-Warning "The following apps failed to build: $($FailedApps -join ', ')"
    }
    else {
        Write-Host 'All MCP apps built successfully.' -ForegroundColor Green
    }
}

end {
    Write-Verbose 'Build-McpApps completed.'
}
