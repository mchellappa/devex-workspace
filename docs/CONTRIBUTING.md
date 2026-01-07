# Contributing to DevEx AI Assistant

Thank you for your interest in improving DevEx AI Assistant! This document provides guidelines for contributing.

## Getting Started

1. **Read the documentation**:
   - [README.md](../README.md) - Overview and features
   - [DEVELOPMENT.md](./DEVELOPMENT.md) - Development setup
   - [FAQ.md](./FAQ.md) - Common questions

2. **Set up your environment**:
   - Clone the repository
   - Install dependencies: `npm install`
   - Run in debug mode: Press `F5` in VS Code

3. **Explore the codebase**:
   - `src/extension.ts` - Entry point
   - `src/commands/` - Command implementations
   - `src/services/` - Business logic
   - `templates/` - Project templates

## How to Contribute

### Reporting Bugs

**Before submitting a bug report**:
- Search existing issues to avoid duplicates
- Test with latest version
- Check FAQ for known issues

**Bug Report Template**:

```markdown
**Description**
Clear description of the bug

**Steps to Reproduce**
1. Open command palette
2. Run 'DevEx: Generate Spring Boot Project'
3. See error

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Screenshots**
If applicable

**Environment**
- OS: Windows 11
- VS Code: 1.85.0
- Extension version: 1.0.0
- GitHub Copilot: Enabled
```

**Label**: `bug`

### Requesting Features

**Feature Request Template**:

```markdown
**Problem/Need**
Describe the problem this feature solves

**Proposed Solution**
How should it work?

**Use Case**
Who benefits and how?

**Alternatives Considered**
What other solutions did you think about?
```

**Label**: `enhancement`

### Submitting Code Changes

#### 1. Branch Naming

Use descriptive branch names:
- `feature/add-graphql-support`
- `bugfix/fix-openapi-parsing`
- `docs/update-quick-start`
- `refactor/improve-error-handling`

#### 2. Commit Messages

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactor
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(generator): add gradle support

fix(openapi): handle missing operationId gracefully

docs(readme): update installation instructions

refactor(ai-service): simplify prompt construction
```

#### 3. Pull Request Process

**Before submitting**:
- [ ] Code compiles without errors
- [ ] All tests pass: `npm test`
- [ ] Code follows style guidelines
- [ ] Documentation updated (if needed)
- [ ] Self-review completed

**PR Template**:

```markdown
## Description
What does this PR do?

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How did you test this?

## Checklist
- [ ] Code compiles
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Self-reviewed

## Screenshots (if applicable)

## Related Issues
Fixes #123
```

**Review Process**:
1. Submit PR with descriptive title
2. DevEx team reviews (usually within 2 business days)
3. Address feedback
4. Approved PRs are merged to `main`
5. Included in next release

## Code Guidelines

### TypeScript Style

```typescript
// ✅ Good
export async function generateProject(
    config: ProjectConfig,
    outputDir: string
): Promise<string> {
    const logger = Logger.getInstance();
    
    try {
        logger.info('Generating project', { config });
        // Implementation
        return projectPath;
    } catch (error) {
        logger.error('Generation failed', { error });
        throw new Error(`Failed to generate project: ${error}`);
    }
}

// ❌ Bad
export function generateProject(config: any, outputDir: any) {
    // Implementation with callback
    callback(projectPath);
}
```

### Naming Conventions

- **Classes**: PascalCase (`AIService`, `SpringBootGenerator`)
- **Functions**: camelCase (`generateProject`, `parseOpenAPI`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_JAVA_VERSION`)
- **Interfaces**: PascalCase with 'I' prefix (`IProjectConfig`)
- **Files**: camelCase (`springBootGenerator.ts`)

### Documentation

Add JSDoc for public APIs:

```typescript
/**
 * Generates a Spring Boot project from configuration
 * 
 * @param config - Project configuration including name, package, versions
 * @param outputDir - Absolute path to output directory
 * @param openApiSpec - Optional parsed OpenAPI specification
 * @returns Promise resolving to generated project path
 * @throws Error if generation fails
 * 
 * @example
 * const projectPath = await generateProject(
 *     { name: 'my-service', packageName: 'com.example' },
 *     '/path/to/output'
 * );
 */
export async function generateProject(
    config: ProjectConfig,
    outputDir: string,
    openApiSpec?: OpenAPISpec
): Promise<string> {
    // Implementation
}
```

### Error Handling

```typescript
// ✅ Proper error handling
try {
    const result = await riskyOperation();
    return result;
} catch (error) {
    logger.error('Operation failed', { 
        error,
        context: { /* relevant context */ }
    });
    
    const message = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
    
    vscode.window.showErrorMessage(`Operation failed: ${message}`);
    throw error; // Re-throw if caller needs to handle
}

// ❌ Poor error handling
try {
    const result = await riskyOperation();
} catch (e) {
    console.log(e); // Don't use console.log
    // Silent failure - no user notification
}
```

### Testing

Write tests for new features:

```typescript
import * as assert from 'assert';
import { parseOpenAPISpec } from '../../services/aiService';

suite('OpenAPI Parser Test Suite', () => {
    test('Should parse valid OpenAPI 3.0 spec', async () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0.0' },
            paths: { '/test': { get: { operationId: 'getTest' } } }
        };
        
        const result = await parseOpenAPISpec(spec);
        
        assert.strictEqual(result.endpoints.length, 1);
        assert.strictEqual(result.endpoints[0].operationId, 'getTest');
    });
    
    test('Should throw error for invalid spec', async () => {
        const invalidSpec = { invalid: 'spec' };
        
        await assert.rejects(
            () => parseOpenAPISpec(invalidSpec),
            /Invalid OpenAPI specification/
        );
    });
});
```

## Project Areas

### Areas We'd Love Help With

1. **Templates**:
   - Additional Spring Boot patterns
   - Other frameworks (Quarkus, Micronaut)
   - Database migration templates
   - Security configurations

2. **Features**:
   - GraphQL support
   - gRPC service generation
   - Multi-module projects
   - Integration test generation

3. **AI Improvements**:
   - Better LLD parsing
   - Smarter code generation
   - Enhanced error recovery
   - Context-aware suggestions

4. **Documentation**:
   - Video tutorials
   - More examples
   - Best practices guides
   - Troubleshooting tips

5. **Testing**:
   - More unit tests
   - Integration test suite
   - E2E testing framework
   - Performance benchmarks

### Good First Issues

Look for issues labeled `good-first-issue` - these are perfect for new contributors!

## Community

### Slack Channels

- **#devex-ai-assistant**: General discussion
- **#devex-ai-assistant-dev**: Development topics
- **#devex-ai-assistant-help**: User support

### Meetings

- **Weekly sync**: Thursdays 3 PM
- **Monthly roadmap review**: First Tuesday of month

### Recognition

Contributors will be:
- Listed in release notes
- Mentioned in README contributors section
- Invited to contributor meetings
- Given early access to new features

## Release Process

1. Version bump in `package.json`
2. Update `CHANGELOG.md`
3. Create release branch: `release/v1.1.0`
4. Build and test: `npm run package`
5. Create GitHub release
6. Upload `.vsix` asset
7. Announce in Slack

## Questions?

- **Slack**: Ask in #devex-ai-assistant-dev
- **Email**: devex-team@yourcompany.com
- **Office Hours**: Tuesdays 2-3 PM

## Code of Conduct

### Our Standards

- **Be respectful**: Treat everyone with respect
- **Be collaborative**: Work together effectively
- **Be professional**: Maintain professionalism
- **Be inclusive**: Welcome diverse perspectives

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Personal attacks
- Publishing private information

### Enforcement

Violations should be reported to devex-team@yourcompany.com. All reports will be reviewed and investigated.

---

## Thank You! 🎉

Your contributions make DevEx AI Assistant better for everyone. We appreciate your time and effort!

**Happy contributing!** 🚀

---

*Questions about this guide? Open an issue or ask in Slack.*
