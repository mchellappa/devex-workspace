# Copilot Instructions — DevEx AI Assistant (Spec2PR)

## What this project is

A VS Code extension (`devex-ai-assistant`) that acts as a full-SDLC acceleration platform. It exposes GitHub Copilot Language Model Tools, a chat participant (`@askcodesamurai`), and editor/explorer commands that guide engineers from Jira story → LLD → OpenAPI spec → Spring Boot code → deployment templates.

---

## Build, lint, compile, package

```bash
npm install               # install deps
npm run compile           # tsc -p ./ → out/
npm run watch             # tsc in watch mode
npm run lint              # eslint src --ext ts
npm run package           # vsce package → .vsix
npm run validate-templates  # validate templates/
npm run validate-tools      # validate tool registrations
npm run pre-package         # pre-package validation
```

There are **no runnable unit tests** at this time — `npm test` is skipped in CI (`if: false`). To validate functionality, compile and load the `.vsix` in a VS Code extension host.

---

## Architecture

### Entry point

`src/extension.ts` → `activate()`:
1. Initializes `TelemetryService`
2. Registers the `@askcodesamurai` chat participant via `src/chatParticipant.ts`
3. Registers all Language Model Tools via `src/tools/devexToolsRegistration.ts`
4. Registers every `devex.*` VS Code command (one per file in `src/commands/`)
5. Auto-creates `.github/agents/code-samurai.agent.md` and sets `github.copilot.chat.useProjectTemplates: true` in workspace settings on first activation

### Three integration surfaces

| Surface | Registration | Entry file |
|---|---|---|
| VS Code commands | `vscode.commands.registerCommand('devex.*')` | `src/commands/<name>.ts` |
| LM Tools (Copilot agents) | `vscode.lm.registerTool('devex_*')` | `src/tools/devexToolsRegistration.ts` |
| Chat participant | `vscode.chat.createChatParticipant('askcodesamurai')` | `src/chatParticipant.ts` |

Each command file exports a single function named `<commandName>Command` (or similar) that accepts `(context, telemetryService, optionalFileUri?)`.

### Services layer (`src/services/`)

| Service | Responsibility |
|---|---|
| `AIService` | Wraps `vscode.lm.selectChatModels`; prefers Claude Sonnet, falls back to first available Copilot model |
| `JiraService` | REST calls to Jira Cloud API; reads credentials from `devex.jira.*` settings |
| `SpringBootGenerator` | Handlebars template rendering → generates Java project files |
| `TemplateProvider` | Resolves templates from `templates/` (or custom path via `devex.customTemplatesPath`) |
| `TelemetryService` | Writes events/metrics to `~/.devex/` (activity.log, metrics.json) |
| `DevExStateManager` | Cross-workspace persistent state in `~/.devex/` |
| `LLDClarificationService` | Conversational LLD clarification loop |
| `TestGenerationService` | Unit test generation for Java/Spring Boot |

### Templates (`templates/`)

Templates are organized into `springboot/`, `kubernetes/`, `docker/`, `ci-cd/`, `kdd/`, `rca/`, `agents/`. Spring Boot code generation uses **Handlebars** with custom helpers (`camelCase`, `pascalCase`, `eq`, `ne`, `and`, `or`, etc.) registered in `springBootGenerator.ts`.

---

## Key conventions

### Adding a new command

1. Create `src/commands/myNewCommand.ts` exporting a function `myNewCommandCommand(context, telemetryService, ...)`.
2. Import and register it in `src/extension.ts` inside `activate()`.
3. Add the command entry to `package.json` under `contributes.commands` (and optionally `menus`).
4. Call `telemetryService.trackEvent('myNewCommand.executed', {...})` at the end.

### Adding a new LM Tool

1. Add the tool name to `capabilities.languageModelTools.provides` in `package.json`.
2. Implement and register the tool in `src/tools/devexToolsRegistration.ts`.
3. Add the tool name to `.github/agents/code-samurai.agent.md` tools list so Code Samurai can invoke it.

### Agent & Skill deployment (`devex.generateAgent` / `devex.generateSkill`)

The extension ships a catalog of role-based templates that engineers deploy to their user-level Copilot home (`~/.copilot/`, or `$COPILOT_HOME` if set):

| Command | Deploys to | Picked up by |
|---|---|---|
| `devex.generateAgent` | `~/.copilot/agents/<name>.agent.md` | Copilot CLI `/agent` |
| `devex.generateSkill` | `~/.copilot/skills/<name>/SKILL.md` | Copilot CLI `/skills list` |
| `devex.manageDeployedAgents` | lists/removes from both | — |

**Agent templates** live in `templates/agents/*.agent.md` (YAML frontmatter + Markdown body).  
**Skill templates** live in `templates/skills/<name>/SKILL.md` — each skill is its own subdirectory (may include scripts alongside `SKILL.md`).

The deployment logic is in `src/services/agentDeploymentService.ts` (`AgentDeploymentService`). To add a new template:
1. Drop the `.agent.md` file (or `<name>/SKILL.md` dir) in `templates/agents/` or `templates/skills/`.
2. Add an entry to `AGENT_TEMPLATES` or `SKILL_TEMPLATES` in `agentDeploymentService.ts`.
3. No changes needed to the commands — they read the catalog at runtime.

### AI calls

All AI interactions go through `AIService.callLanguageModel()`, which uses `vscode.lm.selectChatModels`. Do **not** call `vscode.lm` directly in command files—use `AIService` or the pattern in `chatParticipant.ts` for streaming responses.

### TypeScript config

- `strict: true`, `target: ES2020`, `module: commonjs`
- Output goes to `out/` (gitignored); source is always `src/`
- ESLint enforces `@typescript-eslint/naming-convention` and `eqeqeq`

### `.devex/` folder

The extension writes cross-workspace state to `~/.devex/` (user home, not workspace). Workspace-specific repo mappings and learning data may also appear in a `.devex/` folder at the workspace root (committed to git for team sharing).

### Packaging

`.vsix` files are built with `vsce package`. Published `.vsix` files are committed to the repo root as release artifacts (e.g., `devex-ai-assistant-1.10.4.vsix`). The `publisher` field in `package.json` is `CodeSamurai`.
