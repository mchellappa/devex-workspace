# Release Guide

This guide explains how to create a new release of the DevEx AI Assistant extension.

## Release Process

### 1. Prepare for Release

**Update Version Number:**
```bash
# Bump version in package.json (patch/minor/major)
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

**Update CHANGELOG.md:**
```markdown
## [1.0.1] - 2025-01-20

### Added
- New feature X

### Fixed
- Bug Y
- Issue Z

### Changed
- Improved performance of feature W
```

**Update README (if needed):**
- New features
- Changed prerequisites
- Updated screenshots

**Commit Changes:**
```bash
git add package.json CHANGELOG.md README.md
git commit -m "chore: bump version to v1.0.1"
git push origin main
```

### 2. Create Git Tag

**Create and push tag:**
```bash
# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Create annotated tag
git tag -a "v$VERSION" -m "Release v$VERSION"

# Push tag to trigger GitHub Action
git push origin "v$VERSION"
```

**Or create tag via GitHub UI:**
1. Go to Releases → Draft a new release
2. Click "Choose a tag" → Create new tag: `v1.0.1`
3. Fill in release details (auto-populated by workflow)
4. Click "Publish release"

### 3. GitHub Actions Workflow

When you push a tag, the workflow automatically:

1. ✅ Checks out code
2. ✅ Installs dependencies
3. ✅ Compiles TypeScript
4. ✅ Packages extension as `.vsix`
5. ✅ Creates GitHub release
6. ✅ Uploads `.vsix` file to release assets
7. ✅ Stores artifact for 90 days

**Monitor workflow:**
- Go to Actions tab in GitHub
- Watch "Build and Release" workflow
- Check for any errors

### 4. Verify Release

**Check GitHub Release:**
1. Go to Releases page
2. Verify new release is published
3. Download `.vsix` file
4. Test installation locally:
   ```bash
   code --install-extension devex-ai-assistant-1.0.1.vsix
   ```

**Test Extension:**
1. Install from `.vsix`
2. Test key commands
3. Verify version in extension list
4. Check for any errors

### 5. Announce Release

**Internal Announcement (Slack/Teams):**
```
🎉 DevEx AI Assistant v1.0.1 Released!

What's new:
• Feature X for better productivity
• Fixed bug Y that affected Spring Boot generation
• Improved performance by 30%

Download: https://github.com/yourorg/devex-ai-assistant/releases/tag/v1.0.1

Installation:
1. Download .vsix file from link above
2. VS Code → Extensions → ... → Install from VSIX
3. Enjoy improved features!

Questions? #devex-ai-assistant
```

**Update Internal Wiki:**
- Link to new release
- Update "Latest Version" section
- Add release notes

**Email to Active Users (Optional):**
- For major releases
- Highlight breaking changes
- Provide migration guide if needed

## Release Types

### Patch Release (1.0.X)
- Bug fixes
- Minor improvements
- No breaking changes
- Release frequency: As needed

**Example:** v1.0.1, v1.0.2

### Minor Release (1.X.0)
- New features
- Enhancements
- Backward compatible
- Release frequency: Monthly

**Example:** v1.1.0, v1.2.0

### Major Release (X.0.0)
- Breaking changes
- Major features
- Architecture changes
- Release frequency: Quarterly+

**Example:** v2.0.0, v3.0.0

## Hotfix Process

For critical bugs:

1. **Create hotfix branch:**
   ```bash
   git checkout -b hotfix/critical-bug main
   ```

2. **Fix bug and test:**
   ```bash
   # Make fix
   git add .
   git commit -m "fix: critical bug in Spring Boot generator"
   ```

3. **Bump patch version:**
   ```bash
   npm version patch
   ```

4. **Merge and release:**
   ```bash
   git checkout main
   git merge hotfix/critical-bug
   git push origin main
   git tag -a "v1.0.2" -m "Hotfix: critical bug"
   git push origin "v1.0.2"
   ```

5. **Announce urgently:**
   - Immediate Slack notification
   - Mark as critical in release notes
   - Direct message to affected users

## Pre-release (Beta)

For testing new features:

**Create pre-release tag:**
```bash
git tag -a "v1.1.0-beta.1" -m "Beta release for v1.1.0"
git push origin "v1.1.0-beta.1"
```

**Mark as pre-release in GitHub:**
- Check "This is a pre-release" checkbox
- Add beta warnings to description

**Distribute to pilot users:**
- Limited audience (5-10 engineers)
- Collect feedback
- Fix issues before stable release

## Rollback Process

If a release has critical issues:

1. **Identify last stable version**
2. **Create rollback release:**
   ```bash
   # Revert to last stable
   git revert --no-commit HEAD
   npm version patch
   git tag -a "v1.0.3" -m "Rollback: revert v1.0.2"
   git push origin "v1.0.3"
   ```

3. **Communicate rollback:**
   - Announce in Slack
   - Explain issue
   - Provide rollback instructions

## Checklist

**Pre-Release:**
- [ ] All tests passing
- [ ] No compilation errors
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] README.md updated (if needed)
- [ ] Changes committed to main branch

**Release:**
- [ ] Git tag created and pushed
- [ ] GitHub Action completed successfully
- [ ] Release published on GitHub
- [ ] `.vsix` file available for download
- [ ] Local installation tested

**Post-Release:**
- [ ] Announcement posted (Slack/Teams)
- [ ] Internal wiki updated
- [ ] Active users notified (if major release)
- [ ] Release notes reviewed
- [ ] Support channels monitored for issues

## Troubleshooting

**Workflow fails:**
- Check Actions tab for error details
- Common issues:
  - TypeScript compilation errors
  - Missing dependencies
  - Invalid package.json
- Fix issue and re-push tag (delete old tag first)

**`.vsix` file not created:**
- Check if vsce installed correctly
- Verify package.json has required fields
- Check for .vscodeignore issues

**Release not appearing:**
- Ensure tag name starts with 'v' (v1.0.0)
- Check workflow was triggered (Actions tab)
- Verify GitHub token has release permissions

## Manual Release (Fallback)

If GitHub Actions fails:

```bash
# 1. Build locally
npm install
npm run compile
npm run package

# 2. Create release manually
# Go to GitHub → Releases → Draft new release
# Upload .vsix file manually
# Fill in release notes
# Publish
```

---

**Questions?** Contact DevEx team or check workflow logs in GitHub Actions.
