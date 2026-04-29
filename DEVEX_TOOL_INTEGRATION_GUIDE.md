# DevEx Language Model Tools Integration Guide

## Overview

This guide provides complete implementation instructions for exposing your existing DevEx VS Code commands as **Language Model Tools**, enabling AI assistants (like GitHub Copilot) to invoke them directly.

## Prerequisites

- VS Code Extension with existing DevEx commands implemented
- VS Code API version `^1.85.0` or higher (for `vscode.lm` API)
- TypeScript project setup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Assistant (Copilot)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ Invokes tool via vscode.lm API
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Language Model Tool (Wrapper)                   │
│  - devex_analyzeERD                                         │
│  - devex_generateDomainDrivenAPIs                           │
│  - devex_generateSpringBootProject                          │
│  - etc.                                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ Executes command
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           Existing DevEx Commands                           │
│  - devex.analyzeERD                                         │
│  - devex.generateDomainDrivenAPIs                           │
│  - devex.generateSpringBootProject                          │
│  - etc.                                                     │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Update package.json

Add the minimum VS Code engine version:

```json
{
  "engines": {
    "vscode": "^1.85.0"
  },
  "capabilities": {
    "languageModelTools": {
      "provides": [
        "devex_analyzeERD",
        "devex_generateDomainDrivenAPIs",
        "devex_generateOpenAPISpec",
        "devex_generateSpringBootProject",
        "devex_generateUnitTests",
        "devex_reviewCode",
        "devex_insertDeploymentTemplate",
        "devex_analyzeJiraTicket",
        "devex_generateLLDFromRequirements",
        "devex_reviewLLD"
      ]
    }
  }
}
```

## Step 2: Create Tool Registration Module

Create a new file: `src/tools/devexToolsRegistration.ts`

```typescript
import * as vscode from 'vscode';

/**
 * Interface for tool invocation results
 */
interface ToolResult {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

/**
 * Register all DevEx commands as Language Model Tools
 */
export function registerDevExTools(context: vscode.ExtensionContext): void {
    
    // =================================================================
    // PHASE 1: Requirements & Planning Tools
    // =================================================================
    
    const analyzeJiraTicketTool = vscode.lm.registerTool('devex_analyzeJiraTicket', {
        invoke: async (options, token) => {
            try {
                const { ticketId } = options.input as { ticketId: string };
                
                const result = await vscode.commands.executeCommand(
                    'devex.analyzeJiraTicket',
                    ticketId
                );
                
                return {
                    success: true,
                    message: `Analyzed Jira ticket ${ticketId}`,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to analyze Jira ticket',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: {
                    type: 'string',
                    description: 'Jira ticket ID (e.g., SWIFT-12345)'
                }
            },
            required: ['ticketId']
        }
    });
    
    // =================================================================
    // PHASE 2: Design & Architecture Tools
    // =================================================================
    
    const analyzeERDTool = vscode.lm.registerTool('devex_analyzeERD', {
        invoke: async (options, token) => {
            try {
                const { filePath } = options.input as { filePath?: string };
                
                // Use active editor if no file path provided
                const targetFile = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
                
                if (!targetFile) {
                    return {
                        success: false,
                        message: 'No ERD file specified or active',
                        error: 'Please provide a file path or open an ERD file'
                    };
                }
                
                const result = await vscode.commands.executeCommand(
                    'devex.analyzeERD',
                    targetFile
                );
                
                return {
                    success: true,
                    message: `ERD analysis completed for ${targetFile}`,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to analyze ERD',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to ERD file (CSV, SQL, or diagram format). If not provided, uses active editor.'
                }
            }
        }
    });
    
    const generateLLDTool = vscode.lm.registerTool('devex_generateLLDFromRequirements', {
        invoke: async (options, token) => {
            try {
                const { requirementsFile, outputPath } = options.input as { 
                    requirementsFile: string;
                    outputPath?: string;
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.generateLLDFromRequirements',
                    requirementsFile,
                    outputPath
                );
                
                return {
                    success: true,
                    message: 'LLD generated successfully',
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to generate LLD',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                requirementsFile: {
                    type: 'string',
                    description: 'Path to requirements document (PDF, TXT, MD)'
                },
                outputPath: {
                    type: 'string',
                    description: 'Output path for generated LLD (optional)'
                }
            },
            required: ['requirementsFile']
        }
    });
    
    const reviewLLDTool = vscode.lm.registerTool('devex_reviewLLD', {
        invoke: async (options, token) => {
            try {
                const { lldFile } = options.input as { lldFile: string };
                
                const result = await vscode.commands.executeCommand(
                    'devex.reviewLLD',
                    lldFile
                );
                
                return {
                    success: true,
                    message: 'LLD review completed',
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to review LLD',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to Low-Level Design document'
                }
            },
            required: ['lldFile']
        }
    });
    
    // =================================================================
    // PHASE 3: API Design Tools
    // =================================================================
    
    const generateDomainDrivenAPIsTool = vscode.lm.registerTool('devex_generateDomainDrivenAPIs', {
        invoke: async (options, token) => {
            try {
                const { erdAnalysis, outputDir } = options.input as { 
                    erdAnalysis?: any;
                    outputDir?: string;
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.generateDomainDrivenAPIs',
                    erdAnalysis,
                    outputDir
                );
                
                return {
                    success: true,
                    message: 'Domain-driven APIs generated successfully',
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to generate domain-driven APIs',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                erdAnalysis: {
                    type: 'object',
                    description: 'ERD analysis result from devex_analyzeERD tool'
                },
                outputDir: {
                    type: 'string',
                    description: 'Output directory for generated API specifications'
                }
            }
        }
    });
    
    const generateOpenAPISpecTool = vscode.lm.registerTool('devex_generateOpenAPISpec', {
        invoke: async (options, token) => {
            try {
                const { lldFile, outputPath } = options.input as { 
                    lldFile: string;
                    outputPath?: string;
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.generateOpenAPISpec',
                    lldFile,
                    outputPath
                );
                
                return {
                    success: true,
                    message: 'OpenAPI specification generated',
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to generate OpenAPI spec',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to Low-Level Design document'
                },
                outputPath: {
                    type: 'string',
                    description: 'Output path for OpenAPI specification (optional)'
                }
            },
            required: ['lldFile']
        }
    });
    
    // =================================================================
    // PHASE 4: Code Generation Tools
    // =================================================================
    
    const generateSpringBootProjectTool = vscode.lm.registerTool('devex_generateSpringBootProject', {
        invoke: async (options, token) => {
            try {
                const { openApiSpec, projectName, outputDir, options: projectOptions } = options.input as { 
                    openApiSpec: string;
                    projectName: string;
                    outputDir?: string;
                    options?: any;
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.generateSpringBootProject',
                    openApiSpec,
                    projectName,
                    outputDir,
                    projectOptions
                );
                
                return {
                    success: true,
                    message: `Spring Boot project '${projectName}' generated successfully`,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to generate Spring Boot project',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                openApiSpec: {
                    type: 'string',
                    description: 'Path to OpenAPI specification file'
                },
                projectName: {
                    type: 'string',
                    description: 'Name of the Spring Boot project'
                },
                outputDir: {
                    type: 'string',
                    description: 'Output directory for generated project (optional)'
                },
                options: {
                    type: 'object',
                    description: 'Additional project generation options (Java version, Spring Boot version, etc.)',
                    properties: {
                        javaVersion: { type: 'string', default: '17' },
                        springBootVersion: { type: 'string', default: '3.2.0' },
                        groupId: { type: 'string' },
                        artifactId: { type: 'string' },
                        packageName: { type: 'string' }
                    }
                }
            },
            required: ['openApiSpec', 'projectName']
        }
    });
    
    const generateUnitTestsTool = vscode.lm.registerTool('devex_generateUnitTests', {
        invoke: async (options, token) => {
            try {
                const { sourceFiles, coverageTarget } = options.input as { 
                    sourceFiles: string[];
                    coverageTarget?: number;
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.generateUnitTests',
                    sourceFiles,
                    coverageTarget || 80
                );
                
                return {
                    success: true,
                    message: `Unit tests generated with ${coverageTarget || 80}% coverage target`,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to generate unit tests',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                sourceFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of source file paths to generate tests for'
                },
                coverageTarget: {
                    type: 'number',
                    description: 'Target code coverage percentage (default: 80)',
                    minimum: 0,
                    maximum: 100
                }
            },
            required: ['sourceFiles']
        }
    });
    
    // =================================================================
    // PHASE 5: Quality & Review Tools
    // =================================================================
    
    const reviewCodeTool = vscode.lm.registerTool('devex_reviewCode', {
        invoke: async (options, token) => {
            try {
                const { files, reviewType } = options.input as { 
                    files: string[];
                    reviewType?: 'quality' | 'security' | 'performance' | 'all';
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.reviewCode',
                    files,
                    reviewType || 'all'
                );
                
                return {
                    success: true,
                    message: 'Code review completed',
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to review code',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of file paths to review'
                },
                reviewType: {
                    type: 'string',
                    enum: ['quality', 'security', 'performance', 'all'],
                    description: 'Type of code review to perform (default: all)'
                }
            },
            required: ['files']
        }
    });
    
    // =================================================================
    // PHASE 6: Deployment Tools
    // =================================================================
    
    const insertDeploymentTemplateTool = vscode.lm.registerTool('devex_insertDeploymentTemplate', {
        invoke: async (options, token) => {
            try {
                const { projectPath, templates } = options.input as { 
                    projectPath: string;
                    templates: ('docker' | 'kubernetes' | 'cicd' | 'helm')[];
                };
                
                const result = await vscode.commands.executeCommand(
                    'devex.insertDeploymentTemplate',
                    projectPath,
                    templates
                );
                
                return {
                    success: true,
                    message: `Deployment templates added: ${templates.join(', ')}`,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to insert deployment templates',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: {
                    type: 'string',
                    description: 'Path to the project root directory'
                },
                templates: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['docker', 'kubernetes', 'cicd', 'helm']
                    },
                    description: 'List of deployment templates to add'
                }
            },
            required: ['projectPath', 'templates']
        }
    });
    
    // =================================================================
    // Register all tools with context
    // =================================================================
    
    context.subscriptions.push(
        analyzeJiraTicketTool,
        analyzeERDTool,
        generateLLDTool,
        reviewLLDTool,
        generateDomainDrivenAPIsTool,
        generateOpenAPISpecTool,
        generateSpringBootProjectTool,
        generateUnitTestsTool,
        reviewCodeTool,
        insertDeploymentTemplateTool
    );
    
    console.log('✅ DevEx Language Model Tools registered successfully');
}
```

## Step 3: Update Extension Activation

In your `src/extension.ts`, import and call the registration function:

```typescript
import * as vscode from 'vscode';
import { registerDevExTools } from './tools/devexToolsRegistration';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevEx Extension activating...');
    
    // Register your existing commands (you already have this)
    // registerCommands(context);
    
    // NEW: Register Language Model Tools
    registerDevExTools(context);
    
    console.log('DevEx Extension activated!');
}

export function deactivate() {
    console.log('DevEx Extension deactivated');
}
```

## Step 4: Update Agent Configuration

Update `.github/agents/code-samurai.agent.md`:

```yaml
---
description: "Code Samurai - Your intelligent SDLC guide for end-to-end software delivery"
name: "Code Samurai"
tools: [
  read, 
  search, 
  execute, 
  edit, 
  todo,
  devex_analyzeJiraTicket,
  devex_analyzeERD,
  devex_generateLLDFromRequirements,
  devex_reviewLLD,
  devex_generateDomainDrivenAPIs,
  devex_generateOpenAPISpec,
  devex_generateSpringBootProject,
  devex_generateUnitTests,
  devex_reviewCode,
  devex_insertDeploymentTemplate
]
argument-hint: "Describe your development task or Jira story to get guided through the complete workflow"
user-invocable: true
---
```

## Step 5: Error Handling Best Practices

Implement robust error handling in your command implementations:

```typescript
// Example command implementation with proper error handling
async function executeAnalyzeERD(filePath: string): Promise<any> {
    try {
        // Validate input
        if (!filePath) {
            throw new Error('File path is required');
        }
        
        // Check file exists
        const uri = vscode.Uri.file(filePath);
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            throw new Error(`File not found: ${filePath}`);
        }
        
        // Your ERD analysis logic here
        const analysis = await performERDAnalysis(filePath);
        
        // Return structured result
        return {
            domains: analysis.domains,
            entities: analysis.entities,
            relationships: analysis.relationships,
            recommendations: analysis.recommendations
        };
        
    } catch (error) {
        // Log error for debugging
        console.error('ERD Analysis Error:', error);
        
        // Show user-friendly message
        vscode.window.showErrorMessage(
            `Failed to analyze ERD: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        
        // Re-throw for tool wrapper to handle
        throw error;
    }
}
```

## Step 6: Testing Your Tools

### Manual Testing

1. **Reload Extension**: Press `F5` or run "Developer: Reload Window"
2. **Open Chat**: Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac)
3. **Test Tool Invocation**:
   ```
   @code-samurai Analyze the ERD file Datamodel.csv and generate domain-driven APIs
   ```

### Automated Testing

Create test file: `src/test/tools.test.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('DevEx Tools Test Suite', () => {
    
    test('Tool Registration', async () => {
        // Verify tools are registered
        const tools = await vscode.lm.getTools();
        const devexTools = tools.filter(t => t.name.startsWith('devex_'));
        
        assert.ok(devexTools.length > 0, 'DevEx tools should be registered');
    });
    
    test('Analyze ERD Tool', async () => {
        const tool = await vscode.lm.getTool('devex_analyzeERD');
        assert.ok(tool, 'devex_analyzeERD tool should be available');
        
        // Test with sample input
        const result = await tool.invoke({
            input: {
                filePath: 'test/fixtures/sample-erd.csv'
            }
        });
        
        assert.ok(result.success, 'Tool invocation should succeed');
    });
});
```

## Step 7: Debugging Tools

### Enable Verbose Logging

```typescript
const toolLogger = vscode.window.createOutputChannel('DevEx Tools');

export function registerDevExTools(context: vscode.ExtensionContext): void {
    toolLogger.appendLine('Registering DevEx tools...');
    
    const analyzeERDTool = vscode.lm.registerTool('devex_analyzeERD', {
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking analyzeERD with: ${JSON.stringify(options.input)}`);
            
            try {
                const result = await vscode.commands.executeCommand(/*...*/);
                toolLogger.appendLine(`Success: ${JSON.stringify(result)}`);
                return result;
            } catch (error) {
                toolLogger.appendLine(`Error: ${error}`);
                throw error;
            }
        },
        // ...
    });
}
```

### View Logs
- Open Command Palette: `Ctrl+Shift+P`
- Type: `Output: Show Output Channels`
- Select: `DevEx Tools`

## Step 8: Validate Tool Registration

### Automated Validation Script

A validation script is provided to verify all tools are properly registered with complete metadata:

```bash
npm run validate-tools
```

The script checks:
- ✅ All tools have `description` property
- ✅ All tools have `inputSchema` property
- ✅ All tools have `invoke` function
- ✅ All tools declared in `package.json` are registered
- ✅ All registered tools are added to `context.subscriptions`
- ✅ VS Code engine version meets minimum requirement

### Sample Output

```
╔════════════════════════════════════════════════════════════╗
║     DevEx Language Model Tools Registration Validator     ║
╚════════════════════════════════════════════════════════════╝

============================================================
  Step 1: Validating package.json
============================================================
✅ VS Code engine version: ^1.85.0
✅ Found 23 tools declared in package.json

============================================================
  Step 2: Analyzing Tool Registration Code
============================================================
ℹ️  Found 23 tool registrations in code
ℹ️  Found 23 unique tools in context.subscriptions

============================================================
  Step 3: Validating Tool Metadata
============================================================

[1/23] devex_analyzeJiraTicket
✅   Has description
✅   Has inputSchema
✅   Has invoke function

...

============================================================
  Validation Summary
============================================================

✅ Successes: 25
⚠️  Warnings:  0
❌ Errors:    0

🎉 All validation checks passed!
✨ Your DevEx tools are properly registered and ready to use
```

### Manual Verification Checklist

If you encounter issues, verify these items manually:

#### 1. Extension Activation
- [ ] Press `F1` and check if DevEx commands appear in command palette
- [ ] Check Output panel (View → Output) and select your extension
- [ ] Look for "DevEx Language Model Tools registered successfully" message

#### 2. Tool Registration Code
- [ ] Ensure `registerDevExTools(context)` is called in `activate()` function
- [ ] Verify no errors in console during extension activation
- [ ] Check each tool has all three required properties:
  ```typescript
  vscode.lm.registerTool('tool_name', {
      description: 'Tool description',  // ✅ Required
      inputSchema: { /* ... */ },       // ✅ Required
      invoke: async (options, token) => { /* ... */ }  // ✅ Required
  });
  ```

#### 3. package.json Configuration
- [ ] Confirm `capabilities.languageModelTools.provides` array exists
- [ ] Verify all tool names in the array match registration code
- [ ] Ensure VS Code engine version is `^1.85.0` or higher
  ```json
  {
    "engines": {
      "vscode": "^1.85.0"
    },
    "capabilities": {
      "languageModelTools": {
        "provides": [
          "devex_analyzeERD",
          "devex_generateSpringBootProject",
          ...
        ]
      }
    }
  }
  ```

#### 4. VS Code Environment
- [ ] Run `code --version` to verify VS Code 1.85.0+
- [ ] Reload window: `Developer: Reload Window` (Ctrl+R)
- [ ] Check if GitHub Copilot is installed and active

#### 5. Context Subscriptions
- [ ] All tool variables are added to `context.subscriptions.push()`
- [ ] No duplicate registrations
- [ ] All tools are included in the push statement

### Common Issues and Solutions

#### Issue: "Missing description property"
**Solution**: Add description to tool registration:
```typescript
const myTool = vscode.lm.registerTool('devex_myTool', {
    description: 'Clear description of what the tool does',  // Add this
    inputSchema: { /* ... */ },
    invoke: async (options, token) => { /* ... */ }
});
```

#### Issue: "Missing inputSchema property"
**Solution**: Add input schema with proper JSON Schema format:
```typescript
const myTool = vscode.lm.registerTool('devex_myTool', {
    description: 'My tool',
    inputSchema: {  // Add this
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file'
            }
        },
        required: ['filePath']
    },
    invoke: async (options, token) => { /* ... */ }
});
```

#### Issue: "Not in subscriptions array"
**Solution**: Add tool to context.subscriptions:
```typescript
context.subscriptions.push(
    myTool,
    anotherTool,
    yetAnotherTool  // Ensure all tools are listed
);
```

## Step 9: Publishing

### Update README.md

```markdown
# DevEx - AI-Powered Development Assistant

## Features

- 🤖 **AI Tool Integration**: All commands available to AI assistants via Language Model Tools
- 📋 **ERD Analysis**: Analyze entity-relationship diagrams
- 🎨 **Domain-Driven APIs**: Generate APIs from ERD
- 🚀 **Code Generation**: Spring Boot, tests, deployment configs
- ✅ **Quality Gates**: Automated code review and validation

## Usage

### With AI Assistant

Chat with GitHub Copilot or your AI assistant:
```
@code-samurai Analyze my ERD and generate domain-driven APIs
```

### Via Command Palette

Press `Ctrl+Shift+P` and type:
- `DevEx: Analyze ERD`
- `DevEx: Generate Domain-Driven APIs`
- etc.
```

### Publish to Marketplace

```bash
# Install vsce
npm install -g @vscode/vsce

# Package extension
vsce package

# Publish (requires publisher account)
vsce publish
```

## Troubleshooting

> 💡 **Quick Check**: Run `npm run validate-tools` to automatically diagnose tool registration issues.

### Tools Not Appearing

**Symptom**: AI assistant doesn't see your tools

**Solutions**:
1. **Run validation script**: `npm run validate-tools`
2. Check VS Code version >= 1.85.0: `code --version`
3. Verify `package.json` has correct capabilities with `description` and `inputSchema`
4. Reload window: `Developer: Reload Window` (Ctrl+R)
5. Check output: `DevEx Tools` channel in Output panel

**Common Root Cause**: Missing `description` or `inputSchema` in tool registration. The Language Model Tools API requires these properties for tool discovery.

### Tool Invocation Fails

**Symptom**: Tool returns error when invoked

**Solutions**:
1. Check tool input schema matches parameters
2. Verify underlying command is registered in `extension.ts`
3. Add try-catch with detailed error messages
4. Check output channel for logs: View → Output → `DevEx Tools`
5. Verify tool is added to `context.subscriptions`

**Debug Tips**:
```typescript
const myTool = vscode.lm.registerTool('devex_myTool', {
    invoke: async (options, token) => {
        toolLogger.appendLine(`Invoking myTool with: ${JSON.stringify(options.input)}`);
        try {
            const result = await vscode.commands.executeCommand('devex.myCommand');
            toolLogger.appendLine('✅ myTool completed successfully');
            return result;
        } catch (error) {
            toolLogger.appendLine(`❌ myTool error: ${error}`);
            throw error;
        }
    }
});
```

### Tools Work in Palette but Not in Chat

**Symptom**: Commands work via Command Palette but not when AI invokes them

**Solutions**:
1. Ensure tool names use underscores: `devex_toolName` (not `devex-toolName`)
2. Verify `description` property exists and is descriptive
3. Check `inputSchema` is valid JSON Schema format
4. Test with simplified input first
5. Confirm tool is listed in `package.json` capabilities array

**Example of correct format**:
```typescript
const myTool = vscode.lm.registerTool('devex_myTool', {
    description: 'Generate Spring Boot project from OpenAPI spec',
    inputSchema: {
        type: 'object',
        properties: {
            specFile: {
                type: 'string',
                description: 'Path to OpenAPI specification file'
            }
        },
        required: ['specFile']
    },
    invoke: async (options, token) => { /* ... */ }
});
```

## Performance Optimization

### Lazy Loading

```typescript
// Only register tools when needed
let toolsRegistered = false;

export function registerDevExTools(context: vscode.ExtensionContext): void {
    if (toolsRegistered) return;
    
    // Registration code...
    
    toolsRegistered = true;
}
```

### Caching Results

```typescript
const erdCache = new Map<string, any>();

const analyzeERDTool = vscode.lm.registerTool('devex_analyzeERD', {
    invoke: async (options, token) => {
        const { filePath } = options.input;
        
        // Check cache
        if (erdCache.has(filePath)) {
            return erdCache.get(filePath);
        }
        
        // Analyze
        const result = await vscode.commands.executeCommand(/*...*/);
        
        // Cache result
        erdCache.set(filePath, result);
        
        return result;
    }
});
```

## Security Considerations

### Input Validation

```typescript
function validateFilePath(filePath: string): void {
    // Prevent path traversal
    if (filePath.includes('..')) {
        throw new Error('Invalid file path: path traversal detected');
    }
    
    // Ensure within workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder open');
    }
    
    const isInWorkspace = workspaceFolders.some(folder => 
        filePath.startsWith(folder.uri.fsPath)
    );
    
    if (!isInWorkspace) {
        throw new Error('File must be within workspace');
    }
}
```

### Rate Limiting

```typescript
const rateLimiter = new Map<string, number>();
const MAX_CALLS_PER_MINUTE = 10;

function checkRateLimit(toolName: string): void {
    const now = Date.now();
    const key = `${toolName}_${Math.floor(now / 60000)}`;
    const count = rateLimiter.get(key) || 0;
    
    if (count >= MAX_CALLS_PER_MINUTE) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
    }
    
    rateLimiter.set(key, count + 1);
}
```

## Next Steps

1. ✅ Copy the tool registration code to your extension project
2. ✅ Update `package.json` with capabilities
3. ✅ Import and call `registerDevExTools()` in `activate()`
4. ✅ Update agent configuration with tool names
5. ✅ Test each tool with AI assistant
6. ✅ Add error handling and logging
7. ✅ Write automated tests
8. ✅ Update documentation
9. ✅ Publish to marketplace

## Support

For issues or questions:
- Check output channel: `DevEx Tools`
- Review VS Code LM API docs: https://code.visualstudio.com/api/extension-guides/language-model
- Open issue on GitHub

---

**Happy Tool Building!** ⚔️
