import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const SwaggerParser = require('swagger-parser');
import { AIService } from '../services/aiService';
import { SpringBootGenerator, SpringBootProjectConfig, OpenAPIEndpoint } from '../services/springBootGenerator';
import { TemplateProvider } from '../services/templateProvider';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export async function generateSpringBootProjectCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const startTime = Date.now();

    try {
        // Step 1: Prompt for manual time estimate
        const manualTime = await promptManualTimeEstimate();
        if (!manualTime) {
            return; // User cancelled
        }

        // Step 2: Get project configuration from user
        const projectConfig = await promptProjectConfiguration();
        if (!projectConfig) {
            return; // User cancelled
        }

        // Step 3: Select OpenAPI specification file
        const openApiFile = await selectOpenAPIFile();
        if (!openApiFile) {
            vscode.window.showErrorMessage('OpenAPI specification file is required');
            return;
        }

        // Step 4: Optional LLD file
        const lldFile = await selectLLDFile();

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Spring Boot Project',
                cancellable: false
            },
            async (progress) => {
                progress.report({ increment: 0, message: 'Parsing OpenAPI specification...' });

                // Parse OpenAPI spec
                const openApiSpec = await parseOpenAPISpec(openApiFile);
                const endpoints = extractEndpoints(openApiSpec);
                const schemas = extractSchemas(openApiSpec);

                logger.info(`Extracted ${endpoints.length} endpoints and ${Object.keys(schemas).length} schemas from OpenAPI spec`);

                progress.report({ increment: 20, message: 'Analyzing LLD (if provided)...' });

                // Parse LLD if provided
                let lldSummary: string | undefined;
                if (lldFile) {
                    const aiService = new AIService();
                    const lldContent = await vscode.workspace.fs.readFile(vscode.Uri.file(lldFile));
                    lldSummary = await aiService.summarizeLLD(lldContent.toString());
                }

                progress.report({ increment: 40, message: 'Generating project structure...' });

                // Generate Spring Boot project
                const config = getConfig();
                const templateProvider = new TemplateProvider(context.extensionPath, config.customTemplatesPath);
                const generator = new SpringBootGenerator(templateProvider);

                const springBootConfig: SpringBootProjectConfig = {
                    ...projectConfig,
                    javaVersion: config.javaVersion,
                    springBootVersion: config.springBootVersion,
                    buildTool: config.buildTool
                };

                await generator.generateProject(springBootConfig, endpoints, schemas);

                progress.report({ increment: 80, message: 'Committing to git...' });

                // Git commit - stage and commit all generated files
                try {
                    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
                    if (gitExtension) {
                        const git = gitExtension.getAPI(1);
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (git.repositories.length > 0 && workspaceFolder) {
                            const repo = git.repositories[0];
                            const projectPath = path.join(projectConfig.targetDirectory, projectConfig.projectName);
                            
                            // Get all generated files
                            const generatedFiles = await getAllFiles(projectPath);
                            
                            // Stage all files
                            for (const filePath of generatedFiles) {
                                try {
                                    await repo.add([filePath]);
                                } catch (addError) {
                                    // Continue if file already staged
                                }
                            }
                            
                            // Commit
                            const commitMessage = `Generated Spring Boot project: ${projectConfig.projectName}\n\nEndpoints: ${endpoints.length}\nBuild tool: ${springBootConfig.buildTool}`;
                            await repo.commit(commitMessage);
                            
                            vscode.window.showInformationMessage(`✅ Committed project to git`);
                            progress.report({ increment: 10, message: 'Committed to git' });
                        }
                    }
                } catch (gitError: any) {
                    logger.warn(`Git commit failed: ${gitError.message}`);
                    vscode.window.showWarningMessage(`⚠️ Could not commit to git: ${gitError.message}`);
                }

                progress.report({ increment: 5, message: 'Checking Jira integration...' });

                // Jira integration - optional, only if user has Jira configured
                try {
                    const jiraConfig = vscode.workspace.getConfiguration('devex');
                    const jiraUrl = jiraConfig.get<string>('jira.url');
                    const jiraEmail = jiraConfig.get<string>('jira.email');
                    const jiraToken = jiraConfig.get<string>('jira.token');
                    
                    if (jiraUrl && jiraEmail && jiraToken) {
                        // Ask if they want to link to a Jira story
                        const linkToJira = await vscode.window.showQuickPick(
                            ['Yes', 'No'],
                            { 
                                placeHolder: 'Link this project to a Jira story?',
                                title: 'Jira Integration'
                            }
                        );
                        
                        if (linkToJira === 'Yes') {
                            const jiraService = new JiraService(jiraUrl, jiraEmail, jiraToken);
                            
                            // Get Jira issue key from user
                            const issueKey = await vscode.window.showInputBox({
                                prompt: 'Enter Jira issue key (e.g., PROJ-123)',
                                placeHolder: 'PROJ-123',
                                validateInput: (value) => {
                                    return /^[A-Z]+-\d+$/.test(value) ? null : 'Invalid Jira issue key format';
                                }
                            });
                            
                            if (issueKey) {
                                progress.report({ message: 'Updating Jira...' });
                                
                                // Add comment to Jira
                                const comment = `**Spring Boot Project Generated**\n\n` +
                                    `- Project: ${projectConfig.projectName}\n` +
                                    `- Endpoints: ${endpoints.length}\n` +
                                    `- Build Tool: ${springBootConfig.buildTool}\n` +
                                    `- Java Version: ${springBootConfig.javaVersion}\n\n` +
                                    `_Generated by DevEx AI Assistant_`;
                                
                                await jiraService.addComment(issueKey, comment);
                                
                                // Try to transition to IN PROGRESS
                                try {
                                    await jiraService.transitionIssue(issueKey, 'IN PROGRESS');
                                    vscode.window.showInformationMessage(`✅ ${issueKey} transitioned to IN PROGRESS`);
                                } catch (transitionError: any) {
                                    logger.warn(`Could not transition issue: ${transitionError.message}`);
                                    vscode.window.showWarningMessage(
                                        `⚠️ Could not transition ${issueKey} to IN PROGRESS. Please update manually in Jira.`
                                    );
                                }
                            }
                        }
                    }
                } catch (jiraError: any) {
                    logger.warn(`Jira integration failed: ${jiraError.message}`);
                    // Don't show error to user - Jira is optional
                }

                progress.report({ increment: 5, message: 'Project generated successfully!' });

                // Calculate time taken
                const actualTimeSeconds = (Date.now() - startTime) / 1000;

                // Track metrics
                await telemetryService.trackProductivityMetric(
                    'generate-spring-boot-project',
                    manualTime,
                    actualTimeSeconds
                );

                // Show success message
                const projectPath = path.join(projectConfig.targetDirectory, projectConfig.projectName);
                const openProject = await vscode.window.showInformationMessage(
                    `Spring Boot project "${projectConfig.projectName}" generated successfully!`,
                    'Open Project',
                    'View in Explorer'
                );

                if (openProject === 'Open Project') {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), {
                        forceNewWindow: true
                    });
                } else if (openProject === 'View in Explorer') {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(projectPath));
                }

                logger.info(`Project generated at: ${projectPath}`);
            }
        );
    } catch (error: any) {
        logger.error('Failed to generate Spring Boot project', error);
        vscode.window.showErrorMessage(`Failed to generate project: ${error.message}`);
    }
}

async function promptManualTimeEstimate(): Promise<number | undefined> {
    const options: vscode.QuickPickItem[] = [
        { label: '2 hours', description: 'Typical for a simple microservice', detail: '120 minutes' },
        { label: '4 hours', description: 'Standard microservice with multiple endpoints', detail: '240 minutes' },
        { label: '8 hours', description: 'Complex service with many integrations', detail: '480 minutes' },
        { label: 'Custom', description: 'Enter custom time estimate' }
    ];

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'How long would this typically take to set up manually?',
        title: 'Manual Time Estimate'
    });

    if (!selected) {
        return undefined;
    }

    if (selected.label === 'Custom') {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter time estimate in minutes',
            placeHolder: 'e.g., 180',
            validateInput: (value) => {
                const num = parseInt(value);
                return isNaN(num) || num <= 0 ? 'Please enter a valid positive number' : null;
            }
        });
        return input ? parseInt(input) : undefined;
    }

    return parseInt(selected.detail!.split(' ')[0]);
}

async function promptProjectConfiguration(): Promise<{
    projectName: string;
    packageName: string;
    groupId: string;
    artifactId: string;
    targetDirectory: string;
} | undefined> {
    const config = getConfig();

    // Project name
    const projectName = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        placeHolder: 'e.g., payment-service',
        validateInput: (value) => {
            return /^[a-z][a-z0-9-]*$/.test(value) ? null : 'Use lowercase letters, numbers, and hyphens only';
        }
    });

    if (!projectName) {return undefined;
    }

    // Package name
    const packageName = await vscode.window.showInputBox({
        prompt: 'Enter base package name',
        value: `${config.defaultPackageName}.${projectName.replace(/-/g, '')}`,
        placeHolder: 'e.g., com.company.payment'
    });

    if (!packageName) {
        return undefined;
    }

    // Group ID and Artifact ID
    const groupId = packageName.substring(0, packageName.lastIndexOf('.'));
    const artifactId = projectName;

    // Target directory
    const targetDirectory = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select target directory for the project'
    });

    if (!targetDirectory || targetDirectory.length === 0) {
        return undefined;
    }

    return {
        projectName,
        packageName,
        groupId,
        artifactId,
        targetDirectory: targetDirectory[0].fsPath
    };
}

async function selectOpenAPIFile(): Promise<string | undefined> {
    const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        title: 'Select OpenAPI Specification',
        filters: {
            'OpenAPI': ['yaml', 'yml', 'json']
        }
    });

    return files && files.length > 0 ? files[0].fsPath : undefined;
}

async function selectLLDFile(): Promise<string | undefined> {
    const response = await vscode.window.showQuickPick(
        ['Yes', 'No'],
        { placeHolder: 'Do you have a Low-Level Design (LLD) document?' }
    );

    if (response === 'Yes') {
        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: 'Select LLD Document',
            filters: {
                'Markdown': ['md'],
                'All Files': ['*']
            }
        });

        return files && files.length > 0 ? files[0].fsPath : undefined;
    }

    return undefined;
}

async function parseOpenAPISpec(filePath: string): Promise<any> {
    try {
        // Use parse() instead of validate() to preserve $ref without dereferencing
        // validate() automatically dereferences all $ref which loses type information
        const api = await SwaggerParser.parse(filePath);
        return api;
    } catch (error: any) {
        throw new Error(`Failed to parse OpenAPI specification: ${error.message}`);
    }
}

function extractEndpoints(openApiSpec: any): OpenAPIEndpoint[] {
    const endpoints: OpenAPIEndpoint[] = [];

    if (openApiSpec.paths) {
        for (const [path, pathItem] of Object.entries<any>(openApiSpec.paths)) {
            const methods = ['get', 'post', 'put', 'delete', 'patch'];
            
            for (const method of methods) {
                if (pathItem[method]) {
                    const operation = pathItem[method];
                    endpoints.push({
                        path,
                        method,
                        operationId: operation.operationId || `${method}_${path.replace(/\//g, '_')}`,
                        summary: operation.summary || operation.description || '',
                        requestBody: operation.requestBody,
                        responses: operation.responses
                    });
                }
            }
        }
    }

    return endpoints;
}

/**
 * Extract schemas from OpenAPI spec with field filtering
 * Filters out system-managed fields that conflict with templates:
 * - id, *Id: Auto-generated primary keys
 * - createdAt, updatedAt, createdDate, lastUpdateTime: Timestamp fields
 * - createdBy, lastUpdateBy: Audit fields
 * - rowVersion: Optimistic locking field
 */
function extractSchemas(openApiSpec: any): Record<string, any> {
    const schemas: Record<string, any> = {};
    
    if (!openApiSpec.components?.schemas) {
        return schemas;
    }

    for (const [schemaName, schemaDefinition] of Object.entries<any>(openApiSpec.components.schemas)) {
        const properties = schemaDefinition.properties || {};
        const required = schemaDefinition.required || [];
        const fields: any[] = [];

        for (const [fieldName, fieldSchema] of Object.entries<any>(properties)) {
            // Skip system-managed fields that templates auto-generate
            if (shouldSkipField(fieldName, schemaName)) {
                logger.info(`Skipping system field: ${fieldName} in ${schemaName}`);
                continue;
            }

            const javaType = mapOpenAPITypeToJava(fieldSchema, fieldName);
            const sanitizedFieldName = toJavaFieldName(fieldName);
            
            // Log the sanitization for debugging
            if (sanitizedFieldName !== fieldName) {
                logger.info(`Sanitized field name: "${fieldName}" -> "${sanitizedFieldName}" in ${schemaName}`);
            }
            
            fields.push({
                name: sanitizedFieldName,
                originalName: fieldName,
                type: javaType,
                required: required.includes(fieldName),
                isString: javaType === 'String',
                isInteger: javaType === 'Integer' || javaType === 'Long',
                isBoolean: javaType === 'Boolean',
                isDate: javaType === 'LocalDateTime' || javaType === 'LocalDate',
                isMap: javaType.startsWith('Map<'),
                isJsonField: fieldSchema.type === 'object' && !fieldSchema.$ref,
                description: fieldSchema.description || ''
            });
        }

        schemas[schemaName] = {
            name: schemaName,
            fields,
            description: schemaDefinition.description || ''
        };
    }

    return schemas;
}

/**
 * Determine if a field should be skipped (system-managed field)
 */
function shouldSkipField(fieldName: string, entityName: string): boolean {
    const fieldLower = fieldName.toLowerCase();
    const entityLower = entityName.toLowerCase();

    // Skip exact matches for common system fields
    const systemFields = [
        'id',
        'createdat',
        'updatedat',
        'createddate',
        'lastupdatetime',
        'createdby',
        'lastupdateby',
        'rowversion',
        'version'
    ];

    if (systemFields.includes(fieldLower)) {
        return true;
    }

    // Skip entity-specific ID fields (e.g., proposalId for Proposal entity)
    if (fieldLower === entityLower + 'id') {
        return true;
    }

    return false;
}

/**
 * Convert OpenAPI field name to valid Java field name (camelCase)
 * Examples:
 *   - 'some-field' -> 'someField'
 *   - 'field_name' -> 'fieldName'
 *   - 'FieldName' -> 'fieldName'
 *   - 'field name' -> 'fieldName'
 */
function toJavaFieldName(fieldName: string): string {
    // Remove invalid characters and split by separators
    const parts = fieldName
        .replace(/[^a-zA-Z0-9_-]/g, '') // Remove invalid chars
        .split(/[-_\s]+/)               // Split by hyphens, underscores, spaces
        .filter(part => part.length > 0);
    
    if (parts.length === 0) {
        return 'field'; // Fallback for invalid names
    }
    
    // Convert to camelCase: first part lowercase, rest capitalized
    const camelCase = parts
        .map((part, index) => {
            const lower = part.toLowerCase();
            if (index === 0) {
                return lower;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
    
    // Ensure it doesn't start with a number
    if (/^[0-9]/.test(camelCase)) {
        return 'field' + camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    }
    
    // Check if it's a Java reserved keyword
    const javaKeywords = new Set([
        'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
        'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
        'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
        'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
        'package', 'private', 'protected', 'public', 'return', 'short', 'static',
        'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
        'transient', 'try', 'void', 'volatile', 'while'
    ]);
    
    if (javaKeywords.has(camelCase)) {
        return camelCase + 'Field'; // Append 'Field' to avoid keyword collision
    }
    
    return camelCase;
}

/**
 * Map OpenAPI data types to Java types
 */
function mapOpenAPITypeToJava(fieldSchema: any, fieldName?: string): string {
    // Handle $ref (schema reference) - extract the schema name
    if (fieldSchema.$ref) {
        const refPath = fieldSchema.$ref as string;
        const schemaName = refPath.split('/').pop(); // Extract name from '#/components/schemas/CategorySummary'
        logger.info(`Resolved $ref for field "${fieldName || 'unknown'}": ${refPath} -> ${schemaName}`);
        return schemaName || 'Object';
    }

    const type = fieldSchema.type;
    const format = fieldSchema.format;

    if (type === 'integer') {
        if (format === 'int64') {
            return 'Long';
        }
        return 'Integer';
    }

    if (type === 'number') {
        if (format === 'float') {
            return 'Float';
        }
        return 'Double';
    }

    if (type === 'boolean') {
        return 'Boolean';
    }

    if (type === 'string') {
        if (format === 'date-time') {
            return 'LocalDateTime';
        }
        if (format === 'date') {
            return 'LocalDate';
        }
        if (format === 'time') {
            return 'LocalTime';
        }
        return 'String';
    }

    if (type === 'array') {
        if (fieldSchema.items) {
            const itemType = mapOpenAPITypeToJava(fieldSchema.items, fieldName);
            logger.info(`Array field "${fieldName || 'unknown'}": items type = ${itemType}`);
            return `List<${itemType}>`;
        }
        logger.warn(`Array field "${fieldName || 'unknown'}" has no items definition, defaulting to List<Object>`);
        return 'List<Object>'; // Fallback if items not specified
    }

    // Handle inline object definitions (when $ref is not used)
    if (type === 'object') {
        // Check if it's a Map (object with additionalProperties)
        if (fieldSchema.additionalProperties) {
            // Map with additionalProperties - this is like metadata: { key: value }
            const valueType = fieldSchema.additionalProperties.type === 'string' ? 'String' : 'Object';
            logger.info(`Object field "${fieldName || 'unknown'}" has additionalProperties, mapping to Map<String, ${valueType}>`);
            return `Map<String, ${valueType}>`;
        }
        
        // Plain object without $ref or additionalProperties
        // Store as JSON string for JPA compatibility
        logger.warn(`Object field "${fieldName || 'unknown'}" has inline definition (no $ref), mapping to String for JSON storage`);
        return 'String';
    }

    // Log unknown types for debugging
    logger.warn(`Unknown type for field "${fieldName || 'unknown'}": ${JSON.stringify(fieldSchema)}, defaulting to String`);
    
    // Default to String for unknown types
    return 'String';
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): Promise<string[]> {
    try {
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await fs.promises.stat(filePath);
            
            if (stat.isDirectory()) {
                arrayOfFiles = await getAllFiles(filePath, arrayOfFiles);
            } else {
                arrayOfFiles.push(filePath);
            }
        }
        
        return arrayOfFiles;
    } catch (error) {
        logger.warn(`Could not read directory ${dirPath}: ${error}`);
        return arrayOfFiles;
    }
}
