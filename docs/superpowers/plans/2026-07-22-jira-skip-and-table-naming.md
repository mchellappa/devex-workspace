# Jira Story Skip & Mermaid Table Name Preservation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Allow users to provide an existing Jira story key per domain instead of always creating a new one, and (2) preserve the original Mermaid entity name as the JPA `@Table(name=...)` value.

**Architecture:** Fix 1 adds a per-domain input prompt before story creation that lets users enter an existing key, skip Jira entirely, or create a new story. Fix 2 builds a reverse lookup from OpenAPI resource names back to original Mermaid entity names and passes that to `generateModelClasses` for use as `tableName`.

**Tech Stack:** TypeScript, VS Code Extension API, Handlebars templates

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/commands/generateDomainDrivenAPIs.ts` | Modify (lines ~746-785) | Add per-domain Jira story prompt |
| `src/services/springBootGenerator.ts` | Modify (lines ~109-115, ~304-390, ~770-825) | Add `mermaidEntityMap` field, build it from relationships, pass Mermaid name to `generateModelClasses`, use as `tableName` |

---

### Task 1: Per-Domain Jira Story Prompt

**Files:**
- Modify: `src/commands/generateDomainDrivenAPIs.ts:746-785`

**Context:** Currently, every domain unconditionally creates a Jira story at line 777. We need to prompt the user before each domain with three options: enter an existing story key, create a new story, or skip Jira for this domain.

- [ ] **Step 1: Add per-domain prompt before Jira story creation**

Replace the block at lines 746-785 (from `progress.report` for "Creating Jira story" through `createdStories.push(newStory)`) with a prompt that asks the user for an existing story key:

```typescript
                progress.report({ 
                    increment: progressIncrement / 3, 
                    message: `Creating Jira story for ${domain.name}...` 
                });

                // Prompt user for existing story key or create new
                const storyKeyInput = await vscode.window.showInputBox({
                    prompt: `Jira story for "${domain.name}" domain — enter existing key or leave blank to create new`,
                    placeHolder: 'SWIFT-12345 (or blank to create new)',
                    validateInput: (value) => {
                        if (value && !/^[A-Z]+-\d+$/.test(value)) {
                            return 'Enter a valid Jira issue key (e.g., SWIFT-12345) or leave empty';
                        }
                        return null;
                    }
                });

                // If user presses Escape, skip this domain
                if (storyKeyInput === undefined) {
                    logger.info(`User skipped domain: ${domain.name}`);
                    continue;
                }

                // Create Jira story with complete LLD
                const storyTitle = `${domain.name} Domain - API Implementation`;
                const storyDescription = await generateStoryDescription(fullContext, domain);

                let storyKey: string;

                if (storyKeyInput && storyKeyInput.trim() !== '') {
                    // Use existing story key
                    storyKey = storyKeyInput.trim();
                    logger.info(`Using existing Jira story: ${storyKey} for ${domain.name}`);
                } else {
                    // Create new story
                    const issueData: any = {
                        fields: {
                            project: {
                                key: projectKey!
                            },
                            summary: storyTitle,
                            description: storyDescription,
                            issuetype: {
                                name: 'Story'
                            },
                            labels: ['swift-ods', domain.name.toLowerCase(), 'auto-generated']
                        }
                    };

                    // Add parent link only if provided
                    if (parentIssueKey && parentIssueKey.trim() !== '') {
                        issueData.fields.parent = {
                            key: parentIssueKey
                        };
                    }

                    const createdIssue = await jiraService.createIssue(issueData);
                    storyKey = createdIssue.key;
                    logger.info(`Created Jira story: ${storyKey} for ${domain.name}`);
                }

                const newStory: CreatedStory = { 
                    domain: domain.name, 
                    issueKey: storyKey,
                    timestamp: Date.now()
                };
                createdStories.push(newStory);
```

- [ ] **Step 2: Update all downstream references from `createdIssue.key` to `storyKey`**

After line 785, there are several references to `createdIssue.key` that need to become `storyKey`:

At line 847 (addComment after OpenAPI generation):
```typescript
                    await jiraService.addComment(
                        storyKey,  // was: createdIssue.key
```

At line 946 (addComment after test generation):
```typescript
                    await jiraService.addComment(
                        storyKey,  // was: createdIssue.key
```

At line 954 (addComment after test failure):
```typescript
                    await jiraService.addComment(
                        storyKey,  // was: createdIssue.key
```

At line 961 (addComment without test info):
```typescript
                    await jiraService.addComment(
                        storyKey,  // was: createdIssue.key
```

There are 4 occurrences of `createdIssue.key` after the story creation block. All must be changed to `storyKey`.

- [ ] **Step 3: Verify compile succeeds**

Run: `npm run compile` in `C:\Workspace\github\mfc_gwam\devex-workspace`
Expected: Clean compilation, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/generateDomainDrivenAPIs.ts
git commit -m "feat: add per-domain Jira story prompt — reuse existing or create new (v1.14.9)"
```

---

### Task 2: Preserve Mermaid Entity Name as JPA Table Name

**Files:**
- Modify: `src/services/springBootGenerator.ts:109-115` (add instance field)
- Modify: `src/services/springBootGenerator.ts:304-390` (build mermaid-to-resource map)
- Modify: `src/services/springBootGenerator.ts:770-825` (use Mermaid name as tableName)

**Context:** Currently `tableName` is set to `resource.toLowerCase()` at line 816 (e.g., `"t-cr-ods-plans"`). The user wants the original Mermaid entity name (e.g., `T_CR_ODS_Plan`) preserved as the `@Table(name=...)` value so it matches their database exactly.

The `RelationshipInfo` objects already carry the original Mermaid entity names in `sourceEntity`/`targetEntity`. We can build a mapping from resolved class name → original Mermaid entity name during relationship processing.

- [ ] **Step 1: Add `mermaidEntityMap` instance field**

At line ~115 in `springBootGenerator.ts`, after the existing `entityRelationships` field, add:

```typescript
    /** Maps resolved class names (PascalCase) to original Mermaid entity names for table naming */
    private mermaidEntityMap: Map<string, string> = new Map();
```

- [ ] **Step 2: Populate `mermaidEntityMap` from relationships in `generateControllersFromOpenAPI`**

Inside `generateControllersFromOpenAPI`, after the relationship processing loop (after line 359, before `this.entityRelationships = entityRelationships`), add code to build the reverse map:

```typescript
        // Build Mermaid entity name map: resolved class name -> original Mermaid name
        // e.g., "TCrOdsPlan" -> "T_CR_ODS_Plan"
        this.mermaidEntityMap.clear();
        for (const rel of relationships) {
            const sourceResolved = this.resolveEntityToClassName(rel.sourceEntity);
            if (!this.mermaidEntityMap.has(sourceResolved)) {
                this.mermaidEntityMap.set(sourceResolved, rel.sourceEntity);
            }
            const targetResolved = this.resolveEntityToClassName(rel.targetEntity);
            if (!this.mermaidEntityMap.has(targetResolved)) {
                this.mermaidEntityMap.set(targetResolved, rel.targetEntity);
            }
        }
        logger.info(`Mermaid entity map: ${JSON.stringify(Object.fromEntries(this.mermaidEntityMap))}`);
```

- [ ] **Step 3: Use `mermaidEntityMap` for `tableName` in `generateModelClasses`**

At line 816, change:
```typescript
            tableName: resource.toLowerCase(),
```
to:
```typescript
            tableName: this.mermaidEntityMap.get(entityName) || resource.toLowerCase(),
```

This looks up the original Mermaid entity name by the resolved PascalCase class name. If found (e.g., `"TCrOdsPlan"` → `"T_CR_ODS_Plan"`), it uses the original name. If not found (entity has no relationships), it falls back to the current behavior.

- [ ] **Step 4: Verify compile and validations pass**

Run these commands in `C:\Workspace\github\mfc_gwam\devex-workspace`:
```bash
npm run compile
npm run validate-templates
npm run validate-tools
```
Expected: All pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/springBootGenerator.ts
git commit -m "feat: preserve Mermaid entity name as JPA @Table name (v1.14.9)"
```

---

### Task 3: Version Bump, Push, and VSIX Build

**Files:**
- Modify: `package.json:5` (version bump)

- [ ] **Step 1: Bump version to 1.14.9**

In `package.json`, change:
```json
"version": "1.14.8",
```
to:
```json
"version": "1.14.9",
```

- [ ] **Step 2: Stage, commit, push, build VSIX**

```bash
git add package.json
git commit -m "chore: bump version to 1.14.9"
git push
npx vsce package
```

Expected: VSIX file `devex-ai-assistant-1.14.9.vsix` created successfully.

**IMPORTANT:** Do NOT stage `.adaloom/` files. Only stage `package.json`, `src/commands/generateDomainDrivenAPIs.ts`, and `src/services/springBootGenerator.ts`.
