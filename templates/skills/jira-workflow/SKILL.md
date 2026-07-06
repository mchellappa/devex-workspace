---
name: jira-workflow
description: "Patterns for working with Jira: querying tickets, analyzing story requirements, writing structured comments, and managing story state. Use this skill when asked to fetch Jira tickets, analyze story content, write Jira comments, or work through a Jira-driven development workflow."
---

## Jira Workflow Patterns

### Story Analysis Framework

When analyzing a Jira story, extract and structure these elements:

**1. Core Requirements**
- What is the user/system trying to accomplish?
- What are the acceptance criteria? (look in Description, custom AC field, or comments)
- What is the definition of done?

**2. Technical Scope**
- Which services/repos are affected?
- What APIs are being added, changed, or deprecated?
- Are there database schema changes?
- Are there downstream dependencies that need coordination?

**3. Risk Assessment**
- Is this a breaking change?
- Does it touch shared infrastructure (auth, API gateway, DB)?
- Are there data migration concerns?
- Is there a rollback plan?

### TODO List Format for Stories

When generating a TODO list from a Jira story, use this structure:

```markdown
## Implementation Plan: [TICKET-KEY] [Title]

### Pre-Implementation
- [ ] Review and understand acceptance criteria
- [ ] Identify affected services/repositories
- [ ] Check for existing similar implementations

### Design
- [ ] Generate/update LLD document
- [ ] Review API contract changes
- [ ] Get design sign-off if architectural changes

### Implementation
- [ ] [Specific task 1 from AC]
- [ ] [Specific task 2 from AC]
- [ ] Write unit tests (80%+ coverage)
- [ ] Write integration tests for API changes

### Validation
- [ ] Validate against acceptance criteria
- [ ] Run full test suite
- [ ] Test in dev/staging environment

### Completion
- [ ] Create PR with linked ticket
- [ ] Update Jira story with PR link
- [ ] Move story to "In Review"
```

### Jira Comment Templates

**Progress update comment:**
```
## Progress Update — [Date]

**Status:** In Progress (X% complete)

**Completed:**
- [What was done]

**In Progress:**
- [What is being worked on]

**Blockers:**
- [None / describe blocker and owner]

**ETA:** [date or sprint]
```

**Technical decision comment:**
```
## Technical Decision: [Topic]

**Context:** [Why this decision was needed]

**Decision:** [What was decided]

**Rationale:** [Why this approach was chosen over alternatives]

**Impact:** [What this means for the implementation]
```

**PR link comment:**
```
## Pull Request Created

**PR:** [#number — title](URL)
**Branch:** feature/[TICKET-KEY]-brief-description
**Target:** main / develop

**Summary of changes:**
- [Change 1]
- [Change 2]

**Testing:** [How to verify the fix/feature]
```

### Multi-Repo Story Coordination

When a story spans multiple repositories:

1. **Identify the order of changes** (which service exposes the contract, which consumes it)
2. **Start with the provider** (API changes must be deployed before consumer changes)
3. **Use feature flags** to deploy code before enabling behavior
4. **Create sub-tasks** in Jira — one per repo — linked to the parent story
5. **Document the deployment sequence** in the story description

### Story State Transitions

| From | To | When |
|---|---|---|
| To Do | In Progress | Development started |
| In Progress | In Review | PR created |
| In Review | Done | PR merged + deployed |
| Any | Blocked | Waiting on external dependency |

Always add a comment when transitioning state with context for the team.

### Ticket Key Pattern

Jira ticket keys match `[A-Z]+-\d+` (e.g., `SWIFT-12345`, `PROJ-42`). When referencing tickets in code commits or PRs, use the full key at the start of the commit message:

```
SWIFT-12345: Add order cancellation endpoint

- Implemented POST /orders/{id}/cancel
- Added OrderCancellationService with status validation
- Unit tests cover happy path and invalid state transition
```

---

## Live Ticket Fetching

The skill ships companion scripts that fetch a Jira Cloud ticket via REST API.  
**One-time setup required** before fetching works.

### First-time setup

**macOS / Linux:**
```bash
~/.copilot/skills/jira-workflow/setup.sh
```

**Windows (PowerShell):**
```powershell
~/.copilot/skills/jira-workflow/setup.ps1
```

The setup wizard saves `baseUrl` and `email` to `~/.devex/jira-config.json` (chmod 600).  
The API token is **never stored in a file** — it is set as an environment variable (`JIRA_API_TOKEN`) in your shell profile, or (macOS only) in the system Keychain.

### Fetching a ticket

**macOS / Linux:**
```bash
~/.copilot/skills/jira-workflow/fetch.sh PROJ-123
```

**Windows (PowerShell):**
```powershell
~/.copilot/skills/jira-workflow/fetch.ps1 -TicketKey PROJ-123
```

The scripts output **raw Jira Cloud API JSON** (REST API v3, Jira Cloud only).

### Parsing the JSON response

When a fetch script returns JSON, extract these fields:

| Field path | Meaning |
|---|---|
| `.fields.summary` | Story title |
| `.fields.description` | Story description (Atlassian Document Format — ADF) |
| `.fields.status.name` | Current workflow state |
| `.fields.issuetype.name` | Issue type (Story, Bug, Task…) |
| `.fields.priority.name` | Priority |
| `.fields.assignee.displayName` | Assignee (may be `null`) |
| `.fields.reporter.displayName` | Reporter |
| `.fields.labels[]` | Labels array |
| `.fields.comment.comments[]` | Comments array (each has `.body` in ADF and `.author.displayName`) |

**ADF description extraction:** The `.fields.description` field is an Atlassian Document Format object, not plain text. To get readable text, recursively collect all nodes where `"type": "text"` and join their `"text"` values.

### Credential resolution (no config needed if env vars are set)

Scripts resolve credentials in this order — no setup wizard needed if env vars are already set:

```bash
# macOS/Linux — add to ~/.zshrc or ~/.bashrc
export JIRA_BASE_URL='https://yourcompany.atlassian.net'
export JIRA_EMAIL='you@company.com'
export JIRA_API_TOKEN='<token>'
```

```powershell
# Windows — add to $PROFILE
$env:JIRA_BASE_URL  = 'https://yourcompany.atlassian.net'
$env:JIRA_EMAIL     = 'you@company.com'
$env:JIRA_API_TOKEN = '<token>'
```
