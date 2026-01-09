# Publishing VS Code Extension to Private NPM Registry

## Prerequisites

1. **Build the extension package:**
   ```bash
   npm run compile
   vsce package
   ```
   This creates `devex-ai-assistant-1.1.0.vsix`

2. **Choose your private registry:**
   - Azure Artifacts
   - GitHub Packages
   - JFrog Artifactory
   - npm Enterprise
   - Verdaccio (self-hosted)

## Option 1: Azure Artifacts

### Setup:
1. Create a feed in Azure DevOps:
   - Go to Azure DevOps → Artifacts → Create Feed
   - Name: `devex-extensions`
   - Visibility: Private

2. Configure `.npmrc`:
   ```
   registry=https://pkgs.dev.azure.com/{organization}/_packaging/{feed}/npm/registry/
   always-auth=true
   ```

3. Get credentials:
   ```bash
   npx vsts-npm-auth -config .npmrc
   ```

4. Publish:
   ```bash
   npm publish devex-ai-assistant-1.1.0.vsix
   ```

### Install from Azure Artifacts:
```bash
code --install-extension devex-ai-assistant-1.1.0.vsix
# Or use VS Code Extensions view: Install from VSIX
```

## Option 2: GitHub Packages

### Setup:
1. Add scope to package.json:
   ```json
   {
     "name": "@your-org/devex-ai-assistant",
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```

2. Configure `.npmrc`:
   ```
   @your-org:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

3. Create GitHub Personal Access Token:
   - Settings → Developer settings → Personal access tokens
   - Select scopes: `write:packages`, `read:packages`

4. Set environment variable:
   ```bash
   # Windows PowerShell:
   $env:GITHUB_TOKEN="your-token"
   
   # Linux/Mac:
   export GITHUB_TOKEN=your-token
   ```

5. Publish:
   ```bash
   npm publish
   ```

## Option 3: Internal File Share Distribution

For the simplest private distribution without npm registry:

### Setup:
1. **Create a shared location:**
   ```bash
   # Network share or cloud storage
   \\\\fileserver\\extensions\\
   # or
   s3://your-bucket/extensions/
   ```

2. **Copy VSIX file:**
   ```bash
   copy devex-ai-assistant-1.1.0.vsix \\\\fileserver\\extensions\\
   ```

3. **Install from share:**
   ```bash
   code --install-extension \\\\fileserver\\extensions\\devex-ai-assistant-1.1.0.vsix
   ```

### Automated Distribution Script:
Create `scripts/distribute.ps1`:
```powershell
# Build and package
npm run compile
vsce package

# Copy to distribution location
$version = "1.1.0"
$vsixFile = "devex-ai-assistant-$version.vsix"
$sharePath = "\\\\fileserver\\extensions\\"

Copy-Item $vsixFile $sharePath -Force
Write-Host "Extension published to $sharePath"

# Optional: Send notification to team
# Send-MailMessage or Post to Teams webhook
```

## Option 4: Private Extension Marketplace

### Using VS Code Extension Marketplace (Private):

1. **Register as a publisher:**
   - Go to https://marketplace.visualstudio.com/manage
   - Create publisher account

2. **Publish with visibility flag:**
   ```bash
   vsce publish --pat YOUR_PERSONAL_ACCESS_TOKEN
   ```

3. **Set extension to private** in marketplace portal

### Using Open VSX Registry (Self-hosted):
1. Deploy OpenVSX registry
2. Publish with:
   ```bash
   npx ovsx publish devex-ai-assistant-1.1.0.vsix -p YOUR_TOKEN
   ```

## Recommended Approach for Teams

### Hybrid Approach (Recommended):

1. **Store VSIX in Azure DevOps Artifacts or GitHub Releases:**
   ```bash
   # GitHub Release
   gh release create v1.1.0 devex-ai-assistant-1.1.0.vsix
   
   # Azure DevOps Universal Packages
   az artifacts universal publish \\
     --organization https://dev.azure.com/your-org \\
     --feed devex-extensions \\
     --name devex-ai-assistant \\
     --version 1.1.0 \\
     --path ./devex-ai-assistant-1.1.0.vsix
   ```

2. **Create installation script for team:**

   `install-extension.ps1`:
   ```powershell
   param(
       [string]$Version = "1.1.0"
   )
   
   # Download from Azure Artifacts or GitHub
   $vsixUrl = "https://github.com/your-org/devex-ai-assistant/releases/download/v$Version/devex-ai-assistant-$Version.vsix"
   $vsixFile = "devex-ai-assistant-$Version.vsix"
   
   Write-Host "Downloading extension..."
   Invoke-WebRequest -Uri $vsixUrl -OutFile $vsixFile
   
   Write-Host "Installing extension..."
   code --install-extension $vsixFile
   
   Write-Host "Extension installed successfully!"
   Remove-Item $vsixFile
   ```

3. **Team installs with:**
   ```bash
   ./install-extension.ps1
   ```

## Auto-Update Setup

Create `update-check.ps1`:
```powershell
$currentVersion = "1.1.0"
$latestUrl = "https://api.github.com/repos/your-org/devex-ai-assistant/releases/latest"

$latest = Invoke-RestMethod -Uri $latestUrl
if ($latest.tag_name -ne "v$currentVersion") {
    Write-Host "New version available: $($latest.tag_name)"
    Write-Host "Run: ./install-extension.ps1 -Version $($latest.tag_name.TrimStart('v'))"
}
```

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/publish.yml`):
```yaml
name: Publish Extension

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run compile
      - run: npx vsce package
      
      - name: Upload to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ./devex-ai-assistant-${{ github.event.release.tag_name }}.vsix
          asset_name: devex-ai-assistant-${{ github.event.release.tag_name }}.vsix
          asset_content_type: application/octet-stream
```

## Security Considerations

1. **Never commit tokens** - Use environment variables or CI/CD secrets
2. **Use scoped tokens** - Minimum required permissions
3. **Audit access** - Track who downloads/installs
4. **Version control** - Tag releases and maintain changelog
5. **Code signing** - Consider signing VSIX for verification

## Distribution Methods Comparison

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Azure Artifacts** | Integrated with Azure, versioning | Requires Azure subscription | Enterprise teams on Azure |
| **GitHub Packages** | Free for private repos, CI/CD | Requires GitHub | Teams using GitHub |
| **File Share** | Simple, no setup | No version management | Small teams, quick setup |
| **GitHub Releases** | Free, easy, version tracking | Manual download | Open teams, controlled distribution |
| **Private Marketplace** | Professional, auto-updates | Complex setup, costs | Large organizations |

## Next Steps

1. Choose your distribution method
2. Configure `.npmrc` if using npm registry
3. Update repository URL in package.json
4. Create CI/CD pipeline (optional)
5. Document installation process for team
6. Set up auto-update mechanism (optional)
