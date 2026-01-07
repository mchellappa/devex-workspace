import * as vscode from 'vscode';
import * as path from 'path';
const SwaggerParser = require('swagger-parser');
import { AIService } from '../services/aiService';
import { SpringBootGenerator, SpringBootProjectConfig, OpenAPIEndpoint } from '../services/springBootGenerator';
import { TemplateProvider } from '../services/templateProvider';
import { TelemetryService } from '../services/telemetryService';
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

                await generator.generateProject(springBootConfig, endpoints);

                progress.report({ increment: 100, message: 'Project generated successfully!' });

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
        const api = await SwaggerParser.validate(filePath);
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
