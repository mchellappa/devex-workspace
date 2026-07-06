# Fetch a Jira Cloud ticket and output its raw JSON for Copilot CLI to process.
#
# Usage:  fetch.ps1 -TicketKey PROJ-123
#    or:  .\fetch.ps1 PROJ-123
#
# Credential resolution order (non-sensitive: URL, email):
#   1. Environment variables: $env:JIRA_BASE_URL, $env:JIRA_EMAIL
#   2. ~/.devex/jira-config.json
#
# Token ($env:JIRA_API_TOKEN) — env var ONLY, never stored in any file.
#
# To configure, run:
#   ~/.copilot/skills/jira-workflow/setup.ps1
#
# Requires: PowerShell 5.1+ or PowerShell Core

param(
    [Parameter(Position = 0, Mandatory = $false)]
    [string]$TicketKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ConfigFile = Join-Path $HOME ".devex" "jira-config.json"

# ---------- helpers ----------

function Read-Config([string]$Key) {
    if (Test-Path $ConfigFile) {
        try {
            $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            return $cfg.$Key
        } catch {
            return $null
        }
    }
    return $null
}

# ---------- resolve credentials ----------

$BaseUrl = if ($env:JIRA_BASE_URL) { $env:JIRA_BASE_URL } else { Read-Config "baseUrl" }
$Email   = if ($env:JIRA_EMAIL)    { $env:JIRA_EMAIL }    else { Read-Config "email"   }
$Token   = $env:JIRA_API_TOKEN

# ---------- fail fast if any credential is missing ----------

$missing = @()
if (-not $BaseUrl) { $missing += "JIRA_BASE_URL" }
if (-not $Email)   { $missing += "JIRA_EMAIL" }
if (-not $Token)   { $missing += "JIRA_API_TOKEN" }

if ($missing.Count -gt 0) {
    Write-Error "Missing Jira credentials: $($missing -join ', ')"
    Write-Host ""
    Write-Host "Quick fix — set environment variables:" -ForegroundColor Yellow
    Write-Host "  `$env:JIRA_BASE_URL   = 'https://yourcompany.atlassian.net'"
    Write-Host "  `$env:JIRA_EMAIL      = 'you@company.com'"
    Write-Host "  `$env:JIRA_API_TOKEN  = '<token>'"
    Write-Host ""
    Write-Host "Or run the setup wizard:" -ForegroundColor Yellow
    Write-Host "  ~/.copilot/skills/jira-workflow/setup.ps1"
    exit 1
}

# ---------- validate ticket key ----------

if (-not $TicketKey) {
    Write-Error "Usage: fetch.ps1 -TicketKey PROJ-123"
    exit 1
}

if ($TicketKey -notmatch '^[A-Z][A-Z0-9]*-[0-9]+$') {
    Write-Error "Invalid ticket key '$TicketKey'. Expected format: PROJ-123"
    exit 1
}

# ---------- fetch ----------

$BaseUrl = $BaseUrl.TrimEnd('/')
$Fields  = "summary,description,status,issuetype,priority,assignee,reporter,labels,comment,fixVersions"
$Credentials = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("${Email}:${Token}")
)
$Headers = @{
    "Authorization" = "Basic $Credentials"
    "Accept"        = "application/json"
}

try {
    $Response = Invoke-WebRequest `
        -Uri     "${BaseUrl}/rest/api/3/issue/${TicketKey}?fields=${Fields}" `
        -Headers $Headers `
        -UseBasicParsing
    Write-Output $Response.Content
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Error "Jira API returned HTTP ${statusCode} for ${TicketKey}: $($_.Exception.Message)"
    exit 1
}
