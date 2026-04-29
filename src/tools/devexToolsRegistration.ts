import * as vscode from 'vscode';

/**
 * Extended Language Model Tool interface with description and inputSchema
 * Note: These properties are supported at runtime but may not be in all type definitions
 */
interface ExtendedLanguageModelTool {
    description: string;
    inputSchema: {
        type: 'object';
        properties?: Record<string, any>;
        required?: string[];
    };
    invoke: (options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.LanguageModelToolResult>;
}

/**
 * Helper function to create a success result
 */
function createSuccessResult(message: string, data?: any): vscode.LanguageModelToolResult {
    const content = data ? `${message}\n\nResult: ${JSON.stringify(data, null, 2)}` : message;
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(content)
    ]);
}

/**
 * Helper function to create an error result
 */
function createErrorResult(message: string, error: any): vscode.LanguageModelToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`${message}: ${errorMessage}`)
    ]);
}

/**
 * Register all DevEx commands as Language Model Tools
 * This enables AI assistants like GitHub Copilot to invoke DevEx commands directly
 */
export function registerDevExTools(context: vscode.ExtensionContext): void {
    const toolLogger = vscode.window.createOutputChannel('DevEx Tools');
    toolLogger.appendLine('🔧 Registering DevEx Language Model Tools...');
    
    // =================================================================
    // PHASE 1: Requirements & Planning Tools
    // =================================================================
    
    const analyzeJiraTicketTool = vscode.lm.registerTool('devex_analyzeJiraTicket', {
        description: 'Analyze a Jira ticket to extract requirements, acceptance criteria, and generate implementation tasks',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: {
                    type: 'string',
                    description: 'The Jira ticket ID (e.g., PROJ-123)'
                }
            },
            required: ['ticketId']
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking analyzeJiraTicket with: ${JSON.stringify(options.input)}`);
            try {
                const { ticketId } = options.input as { ticketId: string };
                const result = await vscode.commands.executeCommand('devex.analyzeJiraTicket', ticketId);
                toolLogger.appendLine('✅ analyzeJiraTicket completed successfully');
                return createSuccessResult(`Analyzed Jira ticket ${ticketId}`, result);
            } catch (error) {
                toolLogger.appendLine(`❌ analyzeJiraTicket error: ${error}`);
                return createErrorResult('Failed to analyze Jira ticket', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const fetchMyJiraTicketsTool = vscode.lm.registerTool('devex_fetchMyJiraTickets', {
        description: 'Fetch all Jira tickets assigned to the current user',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine('Invoking fetchMyJiraTickets');
            try {
                const result = await vscode.commands.executeCommand('devex.fetchMyJiraTickets');
                toolLogger.appendLine('✅ fetchMyJiraTickets completed successfully');
                return createSuccessResult('Fetched Jira tickets successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ fetchMyJiraTickets error: ${error}`);
                return createErrorResult('Failed to fetch Jira tickets', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const validateLLDAgainstJiraTool = vscode.lm.registerTool('devex_validateLLDAgainstJira', {
        description: 'Validate a Low-Level Design (LLD) document against Jira ticket requirements to ensure completeness',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'File path to the LLD document'
                },
                ticketId: {
                    type: 'string',
                    description: 'The Jira ticket ID to validate against'
                }
            },
            required: ['lldFile', 'ticketId']
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking validateLLDAgainstJira with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile, ticketId } = options.input as { lldFile: string; ticketId: string };
                const result = await vscode.commands.executeCommand('devex.validateLLDAgainstJira', lldFile, ticketId);
                toolLogger.appendLine('✅ validateLLDAgainstJira completed successfully');
                return createSuccessResult('LLD validation completed', result);
            } catch (error) {
                toolLogger.appendLine(`❌ validateLLDAgainstJira error: ${error}`);
                return createErrorResult('Failed to validate LLD against Jira', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const addJiraCommentTool = vscode.lm.registerTool('devex_addJiraComment', {
        description: 'Add a comment to a Jira ticket with updates or notes',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: {
                    type: 'string',
                    description: 'The Jira ticket ID'
                },
                comment: {
                    type: 'string',
                    description: 'The comment text to add'
                }
            },
            required: ['ticketId', 'comment']
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking addJiraComment with: ${JSON.stringify(options.input)}`);
            try {
                const { ticketId, comment } = options.input as { ticketId: string; comment: string };
                const result = await vscode.commands.executeCommand('devex.addJiraComment', ticketId, comment);
                toolLogger.appendLine('✅ addJiraComment completed successfully');
                return createSuccessResult('Comment added to Jira ticket', result);
            } catch (error) {
                toolLogger.appendLine(`❌ addJiraComment error: ${error}`);
                return createErrorResult('Failed to add Jira comment', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // PHASE 2: Design & Architecture Tools
    // =================================================================
    
    const analyzeERDTool = vscode.lm.registerTool('devex_analyzeERD', {
        description: 'Analyze an Entity Relationship Diagram (ERD) to extract entities, relationships, and data model structure',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the ERD file (CSV, Markdown, or diagram). If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking analyzeERD with: ${JSON.stringify(options.input)}`);
            try {
                const { filePath } = options.input as { filePath?: string };
                const targetFile = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
                if (!targetFile) {
                    return createErrorResult('No ERD file specified or active', 'Please provide a file path or open an ERD file');
                }
                const result = await vscode.commands.executeCommand('devex.analyzeERD', targetFile);
                toolLogger.appendLine('✅ analyzeERD completed successfully');
                return createSuccessResult(`ERD analysis completed for ${targetFile}`, result);
            } catch (error) {
                toolLogger.appendLine(`❌ analyzeERD error: ${error}`);
                return createErrorResult('Failed to analyze ERD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateLLDTool = vscode.lm.registerTool('devex_generateLLDFromRequirements', {
        description: 'Generate a comprehensive Low-Level Design (LLD) document from requirements or user stories',
        inputSchema: {
            type: 'object',
            properties: {
                requirementsFile: {
                    type: 'string',
                    description: 'Path to the requirements or user story file'
                },
                outputPath: {
                    type: 'string',
                    description: 'Optional output path for the generated LLD document'
                }
            },
            required: ['requirementsFile']
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateLLDFromRequirements with: ${JSON.stringify(options.input)}`);
            try {
                const { requirementsFile, outputPath } = options.input as { requirementsFile: string; outputPath?: string };
                const result = await vscode.commands.executeCommand('devex.generateLLDFromRequirements', requirementsFile, outputPath);
                toolLogger.appendLine('✅ generateLLDFromRequirements completed successfully');
                return createSuccessResult('LLD generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateLLDFromRequirements error: ${error}`);
                return createErrorResult('Failed to generate LLD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const reviewLLDTool = vscode.lm.registerTool('devex_reviewLLD', {
        description: 'Review a Low-Level Design (LLD) document for completeness, clarity, and technical accuracy against best practices',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document to review. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking reviewLLD with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.reviewLLD', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ reviewLLD completed successfully');
                return createSuccessResult('LLD review completed', result);
            } catch (error) {
                toolLogger.appendLine(`❌ reviewLLD error: ${error}`);
                return createErrorResult('Failed to review LLD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const summarizeLLDTool = vscode.lm.registerTool('devex_summarizeLLD', {
        description: 'Generate a concise summary of a Low-Level Design (LLD) document highlighting key components and architecture',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document to summarize. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking summarizeLLD with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.summarizeLLD', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ summarizeLLD completed successfully');
                return createSuccessResult('LLD summarized successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ summarizeLLD error: ${error}`);
                return createErrorResult('Failed to summarize LLD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateKDDTool = vscode.lm.registerTool('devex_generateKDD', {
        description: 'Generate a Knowledge Description Document (KDD) from an LLD with detailed technical specifications and runbooks',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateKDD with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.generateKDD', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ generateKDD completed successfully');
                return createSuccessResult('KDD generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateKDD error: ${error}`);
                return createErrorResult('Failed to generate KDD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateRCATool = vscode.lm.registerTool('devex_generateRCA', {
        description: 'Generate an AI-enhanced Root Cause Analysis (RCA) document for incident investigation and postmortem',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateRCA with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.generateRCA');
                toolLogger.appendLine('✅ generateRCA completed successfully');
                return createSuccessResult('RCA generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateRCA error: ${error}`);
                return createErrorResult('Failed to generate RCA', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateCALMArchitectureTool = vscode.lm.registerTool('devex_generateCALMArchitecture', {
        description: 'Generate CALM (Common Architecture Language Model) architecture diagrams and specifications from an LLD',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateCALMArchitecture with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.generateCALMArchitecture', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ generateCALMArchitecture completed successfully');
                return createSuccessResult('CALM architecture generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateCALMArchitecture error: ${error}`);
                return createErrorResult('Failed to generate CALM architecture', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // PHASE 3: API Design Tools
    // =================================================================
    
    const generateDomainDrivenAPIsTool = vscode.lm.registerTool('devex_generateDomainDrivenAPIs', {
        description: 'Generate domain-driven OpenAPI specifications from ERD analysis using DDD principles',
        inputSchema: {
            type: 'object',
            properties: {
                erdAnalysis: {
                    type: 'object',
                    description: 'The ERD analysis result containing entities and relationships'
                },
                outputDir: {
                    type: 'string',
                    description: 'Output directory for the generated API specifications'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateDomainDrivenAPIs with: ${JSON.stringify(options.input)}`);
            try {
                const { erdAnalysis, outputDir } = options.input as { erdAnalysis?: any; outputDir?: string };
                const result = await vscode.commands.executeCommand('devex.generateDomainDrivenAPIs', erdAnalysis, outputDir);
                toolLogger.appendLine('✅ generateDomainDrivenAPIs completed successfully');
                return createSuccessResult('Domain-driven APIs generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateDomainDrivenAPIs error: ${error}`);
                return createErrorResult('Failed to generate domain-driven APIs', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateOpenAPISpecTool = vscode.lm.registerTool('devex_generateOpenAPISpec', {
        description: 'Generate an OpenAPI 3.0 specification from a Low-Level Design (LLD) document',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateOpenAPISpec with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.generateOpenAPISpec', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ generateOpenAPISpec completed successfully');
                return createSuccessResult('OpenAPI specification generated', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateOpenAPISpec error: ${error}`);
                return createErrorResult('Failed to generate OpenAPI spec', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const parseOpenAPITool = vscode.lm.registerTool('devex_parseOpenAPI', {
        description: 'Parse and validate an OpenAPI specification file, extracting endpoints and schema information',
        inputSchema: {
            type: 'object',
            properties: {
                openApiFile: {
                    type: 'string',
                    description: 'Path to the OpenAPI specification file (YAML or JSON). If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking parseOpenAPI with: ${JSON.stringify(options.input)}`);
            try {
                const { openApiFile } = options.input as { openApiFile?: string };
                const result = await vscode.commands.executeCommand('devex.parseOpenAPI', openApiFile ? vscode.Uri.file(openApiFile) : undefined);
                toolLogger.appendLine('✅ parseOpenAPI completed successfully');
                return createSuccessResult('OpenAPI specification parsed successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ parseOpenAPI error: ${error}`);
                return createErrorResult('Failed to parse OpenAPI spec', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // PHASE 4: Code Generation Tools
    // =================================================================
    
    const generateSpringBootProjectTool = vscode.lm.registerTool('devex_generateSpringBootProject', {
        description: 'Generate a complete Spring Boot project with controllers, services, repositories, and entities from OpenAPI spec',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateSpringBootProject with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.generateSpringBootProject');
                toolLogger.appendLine('✅ generateSpringBootProject completed successfully');
                return createSuccessResult('Spring Boot project generated successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateSpringBootProject error: ${error}`);
                return createErrorResult('Failed to generate Spring Boot project', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const implementJiraStoryTool = vscode.lm.registerTool('devex_implementJiraStory', {
        description: 'Implement a complete Jira story by generating code based on the ticket requirements and acceptance criteria',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: {
                    type: 'string',
                    description: 'The Jira ticket ID to implement'
                }
            },
            required: ['ticketId']
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking implementJiraStory with: ${JSON.stringify(options.input)}`);
            try {
                const { ticketId } = options.input as { ticketId: string };
                const result = await vscode.commands.executeCommand('devex.implementJiraStory', ticketId);
                toolLogger.appendLine('✅ implementJiraStory completed successfully');
                return createSuccessResult(`Jira story ${ticketId} implemented successfully`, result);
            } catch (error) {
                toolLogger.appendLine(`❌ implementJiraStory error: ${error}`);
                return createErrorResult('Failed to implement Jira story', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const createJiraStoryFromLLDTool = vscode.lm.registerTool('devex_createJiraStoryFromLLD', {
        description: 'Create a new Jira story with tasks and subtasks extracted from a Low-Level Design document',
        inputSchema: {
            type: 'object',
            properties: {
                lldFile: {
                    type: 'string',
                    description: 'Path to the LLD document. If not provided, uses the currently active file'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking createJiraStoryFromLLD with: ${JSON.stringify(options.input)}`);
            try {
                const { lldFile } = options.input as { lldFile?: string };
                const result = await vscode.commands.executeCommand('devex.createJiraStoryFromLLD', lldFile ? vscode.Uri.file(lldFile) : undefined);
                toolLogger.appendLine('✅ createJiraStoryFromLLD completed successfully');
                return createSuccessResult('Jira story created from LLD', result);
            } catch (error) {
                toolLogger.appendLine(`❌ createJiraStoryFromLLD error: ${error}`);
                return createErrorResult('Failed to create Jira story from LLD', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const completeJiraStoryTool = vscode.lm.registerTool('devex_completeJiraStory', {
        description: 'Complete the full SDLC workflow for a Jira story: design, implementation, testing, and PR creation',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking completeJiraStory with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.completeJiraStory');
                toolLogger.appendLine('✅ completeJiraStory completed successfully');
                return createSuccessResult('Jira story completed', result);
            } catch (error) {
                toolLogger.appendLine(`❌ completeJiraStory error: ${error}`);
                return createErrorResult('Failed to complete Jira story', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const addEndpointTool = vscode.lm.registerTool('devex_addEndpoint', {
        description: 'Add a new REST API endpoint to an existing Spring Boot project with controller, service, and repository layers',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking addEndpoint with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.addEndpoint');
                toolLogger.appendLine('✅ addEndpoint completed successfully');
                return createSuccessResult('Endpoint added successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ addEndpoint error: ${error}`);
                return createErrorResult('Failed to add endpoint', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const generateUnitTestsTool = vscode.lm.registerTool('devex_generateUnitTests', {
        description: 'Generate comprehensive unit tests for Java source files with configurable coverage targets using JUnit and Mockito',
        inputSchema: {
            type: 'object',
            properties: {
                sourceFiles: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of source file paths to generate tests for'
                },
                coverageTarget: {
                    type: 'number',
                    description: 'Target code coverage percentage (default: 80)',
                    minimum: 0,
                    maximum: 100
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking generateUnitTests with: ${JSON.stringify(options.input)}`);
            try {
                const { sourceFiles, coverageTarget } = options.input as { sourceFiles?: string[]; coverageTarget?: number };
                const result = await vscode.commands.executeCommand('devex.generateUnitTests', sourceFiles, coverageTarget || 80);
                toolLogger.appendLine('✅ generateUnitTests completed successfully');
                return createSuccessResult(`Unit tests generated with ${coverageTarget || 80}% coverage target`, result);
            } catch (error) {
                toolLogger.appendLine(`❌ generateUnitTests error: ${error}`);
                return createErrorResult('Failed to generate unit tests', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // PHASE 5: Quality & Review Tools
    // =================================================================
    
    const reviewCodeTool = vscode.lm.registerTool('devex_reviewCode', {
        description: 'Perform automated code review analyzing quality, security, performance, and best practices',
        inputSchema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of file paths to review'
                },
                reviewType: {
                    type: 'string',
                    enum: ['quality', 'security', 'performance', 'all'],
                    description: 'Type of review to perform (default: all)'
                }
            }
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking reviewCode with: ${JSON.stringify(options.input)}`);
            try {
                const { files, reviewType } = options.input as { files?: string[]; reviewType?: 'quality' | 'security' | 'performance' | 'all' };
                const result = await vscode.commands.executeCommand('devex.reviewCode', files, reviewType || 'all');
                toolLogger.appendLine('✅ reviewCode completed successfully');
                return createSuccessResult('Code review completed', result);
            } catch (error) {
                toolLogger.appendLine(`❌ reviewCode error: ${error}`);
                return createErrorResult('Failed to review code', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    const validateGeneratedCodeTool = vscode.lm.registerTool('devex_validateGeneratedCode', {
        description: 'Validate generated code for compilation errors, style issues, and verify it builds successfully',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking validateGeneratedCode with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.validateGeneratedCode');
                toolLogger.appendLine('✅ validateGeneratedCode completed successfully');
                return createSuccessResult('Code validation completed', result);
            } catch (error) {
                toolLogger.appendLine(`❌ validateGeneratedCode error: ${error}`);
                return createErrorResult('Failed to validate generated code', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // PHASE 6: Deployment Tools
    // =================================================================
    
    const insertDeploymentTemplateTool = vscode.lm.registerTool('devex_insertDeploymentTemplate', {
        description: 'Insert CI/CD, Docker, and Kubernetes deployment templates into the project for automated deployment',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        invoke: async (options, token) => {
            toolLogger.appendLine(`Invoking insertDeploymentTemplate with: ${JSON.stringify(options.input)}`);
            try {
                const result = await vscode.commands.executeCommand('devex.insertDeploymentTemplate');
                toolLogger.appendLine('✅ insertDeploymentTemplate completed successfully');
                return createSuccessResult('Deployment templates added successfully', result);
            } catch (error) {
                toolLogger.appendLine(`❌ insertDeploymentTemplate error: ${error}`);
                return createErrorResult('Failed to insert deployment templates', error);
            }
        }
    } as ExtendedLanguageModelTool);
    
    // =================================================================
    // Register all tools with context
    // =================================================================
    
    context.subscriptions.push(
        // Phase 1: Requirements & Planning
        analyzeJiraTicketTool,
        fetchMyJiraTicketsTool,
        validateLLDAgainstJiraTool,
        addJiraCommentTool,
        
        // Phase 2: Design & Architecture
        analyzeERDTool,
        generateLLDTool,
        reviewLLDTool,
        summarizeLLDTool,
        generateKDDTool,
        generateRCATool,
        generateCALMArchitectureTool,
        
        // Phase 3: API Design
        generateDomainDrivenAPIsTool,
        generateOpenAPISpecTool,
        parseOpenAPITool,
        
        // Phase 4: Code Generation
        generateSpringBootProjectTool,
        implementJiraStoryTool,
        createJiraStoryFromLLDTool,
        completeJiraStoryTool,
        addEndpointTool,
        generateUnitTestsTool,
        
        // Phase 5: Quality & Review
        reviewCodeTool,
        validateGeneratedCodeTool,
        
        // Phase 6: Deployment
        insertDeploymentTemplateTool
    );
    
    toolLogger.appendLine('✅ DevEx Language Model Tools registered successfully');
    console.log('✅ DevEx Language Model Tools registered successfully');
}


