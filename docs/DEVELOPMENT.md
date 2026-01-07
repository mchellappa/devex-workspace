# DevEx AI Assistant - Development Setup

## For Extension Developers

### Prerequisites

- Node.js 18+ and npm
- VS Code 1.85.0+
- Git
- GitHub Copilot extension (for testing)

### Clone and Setup

```bash
# Clone repository
git clone https://github.com/yourorg/devex-ai-assistant.git
cd devex-ai-assistant

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

### Development Workflow

#### 1. Open in VS Code

```bash
code .
```

#### 2. Run Extension in Debug Mode

- Press `F5` or go to Run & Debug view
- Select "Run Extension" configuration
- Extension Development Host window opens
- Test commands in the new window

#### 3. Make Changes

Edit TypeScript files in `src/`:
- Auto-compilation enabled (watch mode)
- Reload Extension Development Host: `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)

#### 4. Run Tests

```bash
npm test
```

#### 5. Package Extension

```bash
# Create .vsix file
npm run package

# Output: devex-ai-assistant-1.0.0.vsix
```

### Project Structure

```
devex-ai-assistant/
├── src/
│   ├── extension.ts              # Entry point
│   ├── commands/                 # Command implementations
│   │   ├── generateSpringBootProject.ts
│   │   ├── summarizeLLD.ts
│   │   ├── parseOpenAPI.ts
│   │   ├── insertDeploymentTemplate.ts
│   │   ├── addEndpoint.ts
│   │   ├── viewDashboard.ts
│   │   └── checkForUpdates.ts
│   ├── services/                 # Business logic
│   │   ├── aiService.ts          # Copilot integration
│   │   ├── springBootGenerator.ts # Code generation
│   │   ├── telemetryService.ts   # Metrics tracking
│   │   └── templateProvider.ts   # Template management
│   └── utils/                    # Utilities
│       ├── config.ts
│       ├── logger.ts
│       └── metricsCalculator.ts
├── templates/                    # Project templates
│   ├── springboot/               # Spring Boot templates
│   ├── kubernetes/               # K8s templates
│   ├── docker/                   # Docker templates
│   └── ci-cd/                    # Pipeline templates
├── examples/                     # Example inputs
│   ├── sample-lld.md
│   └── order-management-api.yaml
├── docs/                         # Documentation
│   ├── QUICK_START.md
│   ├── FAQ.md
│   └── DEVELOPMENT.md (this file)
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── README.md                     # Main documentation
```

### Key Development Tasks

#### Adding a New Command

1. **Register in package.json**:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "devex-ai-assistant.myNewCommand",
        "title": "DevEx: My New Command"
      }
    ]
  }
}
```

2. **Create command file**: `src/commands/myNewCommand.ts`

```typescript
import * as vscode from 'vscode';

export async function myNewCommand() {
    // Implementation
    vscode.window.showInformationMessage('Hello from new command!');
}
```

3. **Register in extension.ts**:

```typescript
import { myNewCommand } from './commands/myNewCommand';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'devex-ai-assistant.myNewCommand',
            myNewCommand
        )
    );
}
```

4. **Test**: Press F5, open Command Palette, run "DevEx: My New Command"

#### Adding a New Template

1. Create template file in `templates/springboot/`:

```handlebars
// templates/springboot/MyTemplate.java.template
package {{packageName}};

public class {{className}} {
    // Your template content
}
```

2. Update generator to use template:

```typescript
// In springBootGenerator.ts
const template = fs.readFileSync(
    path.join(templatesDir, 'MyTemplate.java.template'),
    'utf-8'
);
const compiled = Handlebars.compile(template);
const content = compiled({ packageName, className });
```

#### Modifying AI Service

Edit `src/services/aiService.ts`:

```typescript
export class AIService {
    async myNewAIFeature(input: string): Promise<string> {
        const messages = [
            vscode.LanguageModelChatMessage.User(
                `Your prompt here: ${input}`
            )
        ];
        
        const response = await this.callLanguageModel(messages);
        return response;
    }
}
```

#### Adding Configuration Options

1. **Add to package.json**:

```json
{
  "configuration": {
    "properties": {
      "devex-ai-assistant.myNewSetting": {
        "type": "string",
        "default": "defaultValue",
        "description": "Description of setting"
      }
    }
  }
}
```

2. **Access in code**:

```typescript
import { ConfigurationManager } from './utils/config';

const config = ConfigurationManager.getInstance();
const mySetting = config.get<string>('myNewSetting');
```

### Testing

#### Manual Testing

1. Open Extension Development Host (F5)
2. Create test files (LLD, OpenAPI spec)
3. Run commands via Command Palette
4. Verify generated output
5. Check logs in Debug Console

#### Automated Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

#### Test Structure

```typescript
// src/test/suite/myFeature.test.ts
import * as assert from 'assert';
import { myFunction } from '../../services/myService';

suite('My Feature Test Suite', () => {
    test('Should do something', () => {
        const result = myFunction('input');
        assert.strictEqual(result, 'expected');
    });
});
```

### Debugging

#### Extension Code

1. Set breakpoints in TypeScript files
2. Press F5 to start debugging
3. Execute command that hits breakpoint
4. Inspect variables in Debug view

#### AI Service Calls

Add logging:

```typescript
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();
logger.info('AI request', { prompt: myPrompt });

const response = await aiService.callLanguageModel(messages);

logger.info('AI response', { response });
```

View logs: Debug Console in Extension Development Host

### Common Issues

#### "Module not found" errors

```bash
npm install
npm run compile
```

#### Extension doesn't activate

Check `package.json` activation events:

```json
{
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

#### Copilot not available in tests

Ensure GitHub Copilot extension is installed and active in Extension Development Host.

#### Template changes not reflected

```bash
npm run compile
# Reload Extension Development Host: Ctrl+R
```

### Building for Release

#### Version Bump

```bash
# Update version in package.json
npm version patch  # or minor, major
```

#### Package

```bash
npm run package

# Creates: devex-ai-assistant-X.Y.Z.vsix
```

#### Test .vsix Installation

```bash
code --install-extension devex-ai-assistant-X.Y.Z.vsix
```

#### Create GitHub Release

1. Tag version: `git tag v1.0.0`
2. Push: `git push --tags`
3. Create release on GitHub
4. Upload `.vsix` file as asset

### Code Style

#### TypeScript Guidelines

- Use async/await, not callbacks
- Prefer `const` over `let`
- Use descriptive variable names
- Add JSDoc comments for public APIs

```typescript
/**
 * Generates a Spring Boot project from OpenAPI specification
 * @param config Project configuration
 * @param outputDir Output directory path
 * @returns Generated project path
 */
export async function generateProject(
    config: ProjectConfig,
    outputDir: string
): Promise<string> {
    // Implementation
}
```

#### Error Handling

```typescript
try {
    await riskyOperation();
} catch (error) {
    logger.error('Operation failed', { error });
    vscode.window.showErrorMessage(
        `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
}
```

#### Progress Indicators

```typescript
await vscode.window.withProgress(
    {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating project...',
        cancellable: false
    },
    async (progress) => {
        progress.report({ increment: 0, message: 'Setting up...' });
        // Do work
        progress.report({ increment: 50, message: 'Generating code...' });
        // More work
        progress.report({ increment: 100 });
    }
);
```

### Performance Considerations

- Cache template compilations
- Minimize file system operations
- Use streams for large files
- Batch AI requests when possible
- Debounce user input

### Security

- Never log sensitive data (API keys, tokens)
- Validate all user inputs
- Sanitize file paths (prevent directory traversal)
- Use VS Code's secret storage for credentials

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Pull request process
- Code review guidelines
- Branch naming conventions
- Commit message format

### Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Handlebars Documentation](https://handlebarsjs.com/)
- [Spring Boot Documentation](https://spring.io/projects/spring-boot)

### Support

- Slack: #devex-ai-assistant-dev
- Email: devex-team@yourcompany.com
- Internal Wiki: [DevEx AI Assistant Wiki]

---

**Happy coding!** 🚀
