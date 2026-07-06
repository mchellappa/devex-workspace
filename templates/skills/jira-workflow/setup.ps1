# Interactive setup wizard for the jira-workflow Copilot CLI skill.
#
# Saves non-sensitive settings (baseUrl, email) to ~/.devex/jira-config.json.
# The API token is NEVER written to disk — the wizard prints instructions for
# adding it to your PowerShell profile as an environment variable.
#
# Usage:  setup.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DevexDir   = Join-Path $HOME ".devex"
$ConfigFile = Join-Path $DevexDir "jira-config.json"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Jira Workflow Skill — Setup Wizard          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ---------- base URL ----------

$BaseUrl = Read-Host "Jira Cloud base URL (e.g. https://yourcompany.atlassian.net)"
$BaseUrl = $BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https?://') {
    Write-Error "URL must start with https://"
    exit 1
}

# ---------- email ----------

$Email = Read-Host "Jira email address"
if ($Email -notmatch '@') {
    Write-Error "Must be a valid email address"
    exit 1
}

# ---------- save non-sensitive config ----------

if (-not (Test-Path $DevexDir)) {
    New-Item -ItemType Directory -Path $DevexDir | Out-Null
}

$config = if (Test-Path $ConfigFile) {
    $existing = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    $h = @{}
    $existing.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
    $h
} else {
    @{}
}

$config["baseUrl"] = $BaseUrl
$config["email"]   = $Email
$config | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8

Write-Host ""
Write-Host "✓ Saved non-sensitive config to $ConfigFile" -ForegroundColor Green

# ---------- API token ----------

Write-Host ""
Write-Host "Next: your Jira API token."
Write-Host "  Create one at: https://id.atlassian.com/manage/api-tokens"
Write-Host ""

$SecureToken = Read-Host "Paste your API token" -AsSecureString
$PlainToken  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
)

if (-not $PlainToken) {
    Write-Warning "No token entered — skipping token setup."
    exit 0
}

# ---------- PowerShell profile instructions ----------

$ProfilePath = $PROFILE.CurrentUserAllHosts

Write-Host ""
Write-Host "────────────────────────────────────────────────────────" -ForegroundColor Yellow
Write-Host "Add the following line to your PowerShell profile:" -ForegroundColor Yellow
Write-Host "  $ProfilePath"
Write-Host ""
Write-Host "  `$env:JIRA_API_TOKEN = '$PlainToken'" -ForegroundColor White
Write-Host ""
Write-Host "Or set it for the current session only:" -ForegroundColor Yellow
Write-Host "  `$env:JIRA_API_TOKEN = '$PlainToken'" -ForegroundColor White
Write-Host "────────────────────────────────────────────────────────" -ForegroundColor Yellow

# Offer to open the profile for editing
Write-Host ""
$openProfile = Read-Host "Open your PowerShell profile in Notepad now? [y/N]"
if ($openProfile -match '^[Yy]') {
    if (-not (Test-Path $ProfilePath)) {
        New-Item -ItemType File -Path $ProfilePath -Force | Out-Null
    }
    Start-Process notepad $ProfilePath
}

Write-Host ""
Write-Host "Setup complete. Test it with:" -ForegroundColor Green
Write-Host "  ~/.copilot/skills/jira-workflow/fetch.ps1 PROJ-1"
Write-Host ""
