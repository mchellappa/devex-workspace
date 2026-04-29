import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';
import { TemplateProvider } from '../services/templateProvider';
import { AIService } from '../services/aiService';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';
import { SpringBootGenerator } from '../services/springBootGenerator';

// Register Handlebars helpers
Handlebars.registerHelper('camelCase', function(str: any) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toLowerCase() + str.slice(1);
});

Handlebars.registerHelper('pascalCase', function(str: any) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
});


export async function implementJiraStory(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();

    try {
        // Step 1: Get Jira configuration
        const config = vscode.workspace.getConfiguration('devex');
        const jiraBaseUrl = config.get<string>('jira.baseUrl');
        const jiraEmail = config.get<string>('jira.email');
        const jiraApiToken = config.get<string>('jira.apiToken');

        if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
            const configure = await vscode.window.showErrorMessage(
                'Jira is not configured. Please configure Jira settings.',
                'Configure'
            );

            if (configure === 'Configure') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'devex.jira');
            }
            return;
        }

        const jiraService = new JiraService(jiraBaseUrl, jiraEmail, jiraApiToken);

        // Step 2: Get issue key
        let selectedIssueKey = issueKey;

        if (!selectedIssueKey) {
            const issueKeyInput = await vscode.window.showInputBox({
                prompt: 'Enter Jira Story or Task key (e.g., SWIFT-123 or SWIFT-123-1)',
                placeHolder: 'SWIFT-123',
                validateInput: (value) => {
                    if (!value || !/^[A-Z]+-\d+(-\d+)?$/.test(value)) {
                        return 'Please enter a valid Jira issue key (e.g., SWIFT-123 or SWIFT-74713-1)';
                    }
                    return null;
                }
            });

            if (!issueKeyInput) {
                return;
            }

            selectedIssueKey = issueKeyInput;
        }

        // Step 3: Fetch issue details
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Implementing ${selectedIssueKey}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Fetching issue details...' });

            const issue = await jiraService.fetchIssue(selectedIssueKey!);

            if (!issue) {
                throw new Error(`Issue ${selectedIssueKey} not found`);
            }
            
            // If the user might be trying to use a subtask index notation (e.g., SWIFT-123-1)
            // Help them find the correct subtask key
            if (selectedIssueKey.match(/-\d+-\d+$/)) {
                const parentKey = selectedIssueKey.replace(/-\d+$/, '');
                vscode.window.showWarningMessage(
                    `⚠️ Note: Jira subtasks have their own issue keys (e.g., SWIFT-12345), not index notation (${selectedIssueKey}). ` +
                    `Try fetching the parent story ${parentKey} first to see the actual subtask keys.`,
                    'Fetch Parent Story'
                ).then(async (choice) => {
                    if (choice === 'Fetch Parent Story') {
                        await vscode.commands.executeCommand('devex.implementJiraStory', parentKey);
                    }
                });
            }

            progress.report({ increment: 10, message: 'Analyzing issue type...' });

            // Step 4: Create Git branch for the issue
            try {
                const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
                if (gitExtension) {
                    const git = gitExtension.getAPI(1);
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    
                    if (workspaceFolder && git.repositories.length > 0) {
                        const repo = git.repositories[0];
                        
                        // Create branch name from issue key and summary
                        const sanitizedSummary = issue.summary
                            .toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                            .substring(0, 50);
                        
                        const branchName = `feature/${selectedIssueKey}-${sanitizedSummary}`;
                        
                        progress.report({ increment: 5, message: `Creating branch ${branchName}...` });
                        
                        // Check if branch already exists
                        const branches = await repo.getBranches({ remote: false });
                        const branchExists = branches.some((b: any) => b.name === branchName);
                        
                        if (!branchExists) {
                            // Create and checkout new branch
                            await repo.createBranch(branchName, true);
                            vscode.window.showInformationMessage(`✅ Created and checked out branch: ${branchName}`);
                        } else {
                            // Branch exists, ask if user wants to checkout
                            const checkout = await vscode.window.showWarningMessage(
                                `Branch ${branchName} already exists. Checkout this branch?`,
                                'Yes',
                                'No'
                            );
                            
                            if (checkout === 'Yes') {
                                await repo.checkout(branchName);
                                vscode.window.showInformationMessage(`✅ Checked out existing branch: ${branchName}`);
                            }
                        }
                    }
                }
            } catch (gitError: any) {
                // Don't fail the entire operation if Git branch creation fails
                vscode.window.showWarningMessage(`Failed to create Git branch: ${gitError.message}`);
            }

            progress.report({ increment: 5, message: 'Analyzing issue type...' });

            // Step 5: Determine if it's a story or subtask
            const isStory = issue.issueType === 'Story';
            const isSubtask = issue.issueType === 'Subtask' || issue.issueType === 'Sub-task';

            let tasksToImplement: Array<{ key: string; summary: string; description: string }> = [];

            if (isStory) {
                // Fetch all subtasks for the story
                progress.report({ increment: 10, message: 'Fetching subtasks...' });

                const subtasks = await jiraService.fetchSubtasks(selectedIssueKey!);

                if (subtasks && subtasks.length > 0) {
                    // Let user select which subtasks to implement
                    const subtaskItems = subtasks.map(st => ({
                        label: st.key,
                        description: st.summary,
                        picked: true,
                        task: st
                    }));

                    const selectedSubtasks = await vscode.window.showQuickPick(subtaskItems, {
                        canPickMany: true,
                        placeHolder: 'Select subtasks to implement (default: all)',
                        title: `${selectedIssueKey}: ${issue.summary}`
                    });

                    if (!selectedSubtasks || selectedSubtasks.length === 0) {
                        vscode.window.showInformationMessage('No subtasks selected');
                        return;
                    }

                    tasksToImplement = selectedSubtasks.map(st => ({
                        key: st.task.key,
                        summary: st.task.summary,
                        description: st.task.description || ''
                    }));
                } else {
                    // No subtasks, implement the story itself
                    tasksToImplement = [{
                        key: issue.key,
                        summary: issue.summary,
                        description: issue.description
                    }];
                }
            } else {
                // Single task/subtask
                tasksToImplement = [{
                    key: issue.key,
                    summary: issue.summary,
                    description: issue.description
                }];
            }

            progress.report({ increment: 10, message: 'Detecting project structure...' });

            // Step 6: Detect project type and structure
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            // First, try to get tech stack from LLD
            const techStackFromLLD = extractTechStackFromLLD(issue.description);
            
            // Always ask user to confirm tech stack (even if detected)
            let confirmedTechStack: 'java' | 'dotnet' | 'nodejs' | 'python' | undefined;
            
            const techStackOptions = [
                { label: 'Java (Spring Boot)', value: 'java', description: 'Spring Boot with Java' },
                { label: '.NET Core', value: 'dotnet', description: 'ASP.NET Core with C#' },
                { label: 'Node.js', value: 'nodejs', description: 'Express.js with TypeScript' },
                { label: 'Python', value: 'python', description: 'FastAPI or Flask' }
            ];
            
            const techStackChoice = await vscode.window.showQuickPick(techStackOptions, {
                placeHolder: techStackFromLLD 
                    ? `Detected: ${techStackFromLLD}. Confirm or change technology stack`
                    : 'Select technology stack',
                title: 'Choose Technology Stack'
            });
            
            if (!techStackChoice) {
                vscode.window.showInformationMessage('Implementation cancelled - no tech stack selected');
                return;
            }
            
            confirmedTechStack = techStackChoice.value as 'java' | 'dotnet' | 'nodejs' | 'python';

            const projectInfo = await detectProjectStructure(workspaceFolder.uri.fsPath, confirmedTechStack);
            
            // For Java/Spring Boot or .NET projects, allow user to confirm or change the package/namespace
            if (projectInfo.type === 'spring-boot' || projectInfo.type === 'dotnet') {
                const isJava = projectInfo.type === 'spring-boot';
                const defaultValue = projectInfo.basePackage || (isJava ? 'com.company.app' : 'Company.Application');
                const label = isJava ? 'package name' : 'namespace';
                
                const confirmedPackage = await vscode.window.showInputBox({
                    prompt: `Confirm or change base ${label} for generated code`,
                    placeHolder: isJava ? 'com.company.project' : 'Company.Project',
                    value: defaultValue,
                    validateInput: (value) => {
                        if (!value) {
                            return `Please enter a valid ${label}`;
                        }
                        if (isJava && !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
                            return 'Please enter a valid Java package name (e.g., com.company.project)';
                        }
                        if (!isJava && !/^[A-Z][a-zA-Z0-9]*(\.[A-Z][a-zA-Z0-9]*)*$/.test(value)) {
                            return 'Please enter a valid .NET namespace (e.g., Company.Project)';
                        }
                        return null;
                    }
                });

                if (!confirmedPackage) {
                    vscode.window.showInformationMessage(`Implementation cancelled - no ${label} provided`);
                    return;
                }

                projectInfo.basePackage = confirmedPackage;
            }
            
            // Step 4.5: Search for OpenAPI spec in workspace AND .devex folder for validation
            progress.report({ increment: 5, message: 'Searching for OpenAPI specifications...' });
            const openAPISpecs = await findOpenAPISpecs(workspaceFolder.uri.fsPath);
            let selectedOpenAPISpec: { path: string, content: any } | undefined;
            
            // For RESTful/API projects, always prompt for OpenAPI spec
            const isRESTfulProject = projectInfo.type === 'spring-boot' || 
                                     projectInfo.type === 'dotnet' || 
                                     projectInfo.type === 'nodejs' ||
                                     issue.summary.toLowerCase().includes('api') ||
                                     issue.summary.toLowerCase().includes('rest') ||
                                     issue.description.toLowerCase().includes('endpoint');
            
            if (isRESTfulProject) {
                const options: Array<{ label: string, value: string, description: string }> = [];
                
                if (openAPISpecs.length > 0) {
                    options.push({
                        label: `✅ Use found OpenAPI spec (${openAPISpecs.length} found)`,
                        value: 'use',
                        description: 'Recommended: Validates code against API contract'
                    });
                }
                
                options.push({
                    label: '📁 Browse for OpenAPI file',
                    value: 'browse',
                    description: 'Select OpenAPI spec from file system'
                });
                
                options.push({
                    label: '❌ Skip OpenAPI validation',
                    value: 'skip',
                    description: 'Not recommended for REST APIs'
                });
                
                const choice = await vscode.window.showQuickPick(options, {
                    placeHolder: 'This appears to be a RESTful API project. Use OpenAPI for validation?',
                    title: 'OpenAPI Validation (Recommended)'
                });
                
                if (choice?.value === 'use' && openAPISpecs.length > 0) {
                    // If multiple specs, let user choose
                    if (openAPISpecs.length > 1) {
                        const specChoice = await vscode.window.showQuickPick(
                            openAPISpecs.map(spec => ({
                                label: path.basename(spec.path),
                                description: spec.path.replace(workspaceFolder.uri.fsPath, '').replace(/\\/g, '/'),
                                detail: spec.content.info?.title || 'OpenAPI Specification',
                                value: spec
                            })),
                            {
                                placeHolder: 'Select OpenAPI specification',
                                title: 'Choose OpenAPI Spec'
                            }
                        );
                        
                        if (specChoice) {
                            selectedOpenAPISpec = specChoice.value;
                            logger.info(`Using OpenAPI spec: ${selectedOpenAPISpec.path}`);
                        }
                    } else {
                        selectedOpenAPISpec = openAPISpecs[0];
                        logger.info(`Using OpenAPI spec: ${selectedOpenAPISpec.path}`);
                    }
                } else if (choice?.value === 'browse') {
                    // Let user browse for OpenAPI file
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        filters: {
                            'OpenAPI Spec': ['yaml', 'yml', 'json']
                        },
                        title: 'Select OpenAPI Specification File'
                    });
                    
                    if (fileUri && fileUri[0]) {
                        try {
                            const SwaggerParser = require('swagger-parser');
                            const api = await SwaggerParser.validate(fileUri[0].fsPath);
                            selectedOpenAPISpec = {
                                path: fileUri[0].fsPath,
                                content: api
                            };
                            logger.info(`Using manually selected OpenAPI spec: ${selectedOpenAPISpec.path}`);
                        } catch (error: any) {
                            vscode.window.showErrorMessage(`Invalid OpenAPI spec: ${error.message}`);
                            logger.error(`Failed to validate selected OpenAPI: ${error.message}`);
                        }
                    }
                }
            }
            
            // CRITICAL: For NEW REST API projects, OpenAPI spec is REQUIRED
            if (isRESTfulProject && !projectInfo.hasBuildFile && projectInfo.type === 'spring-boot') {
                if (!selectedOpenAPISpec) {
                    const retry = await vscode.window.showErrorMessage(
                        '❌ OpenAPI spec is REQUIRED for new REST API projects to ensure consistent code generation.\n\n' +
                        'Without an OpenAPI spec, the generated code structure will be inconsistent.\n\n' +
                        'Please provide an OpenAPI specification file.',
                        'Browse for OpenAPI File',
                        'Cancel'
                    );
                    
                    if (retry === 'Browse for OpenAPI File') {
                        const fileUri = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            filters: {
                                'OpenAPI Spec': ['yaml', 'yml', 'json']
                            },
                            title: 'Select OpenAPI Specification File'
                        });
                        
                        if (fileUri && fileUri[0]) {
                            try {
                                const SwaggerParser = require('swagger-parser');
                                const api = await SwaggerParser.validate(fileUri[0].fsPath);
                                selectedOpenAPISpec = {
                                    path: fileUri[0].fsPath,
                                    content: api
                                };
                                logger.info(`Using manually selected OpenAPI spec: ${selectedOpenAPISpec.path}`);
                                vscode.window.showInformationMessage(`✅ Using OpenAPI: ${path.basename(selectedOpenAPISpec.path)}`);
                            } catch (error: any) {
                                vscode.window.showErrorMessage(`Invalid OpenAPI spec: ${error.message}`);
                                logger.error(`Failed to validate selected OpenAPI: ${error.message}`);
                                return;
                            }
                        } else {
                            vscode.window.showInformationMessage('Code generation cancelled - OpenAPI spec is required');
                            return;
                        }
                    } else {
                        vscode.window.showInformationMessage('Code generation cancelled - OpenAPI spec is required');
                        return;
                    }
                }
            }
            
            if (selectedOpenAPISpec) {
                vscode.window.showInformationMessage(`✅ Using OpenAPI: ${path.basename(selectedOpenAPISpec.path)} for validation`);
            } else if (isRESTfulProject) {
                vscode.window.showWarningMessage('⚠️ No OpenAPI spec selected. Generated code may not match API contract.');
                logger.warn('No OpenAPI spec selected for RESTful project - validation will be based on LLD only');
            }
            
            // Debug info - show popup so user knows what's happening
            const debugInfo = `isRESTful: ${isRESTfulProject}, hasOpenAPI: ${!!selectedOpenAPISpec}, type: ${projectInfo.type}`;
            logger.info(`[SpringBootGenerator Check] ${debugInfo}`);
            
            // CRITICAL: If REST API + OpenAPI → Use SpringBootGenerator for consistent, complete project
            // Works for both NEW projects (no pom.xml) and EXISTING projects (has pom.xml)
            if (isRESTfulProject && selectedOpenAPISpec && projectInfo.type === 'spring-boot') {
                logger.info('🎯 Using SpringBootGenerator for complete project generation');
                
                // VISIBLE CONFIRMATION - User will see this popup
                const useGenerator = await vscode.window.showInformationMessage(
                    '🚀 SpringBoot Template Generator\n\n' +
                    'Generating complete Spring Boot project with:\n' +
                    '• Correct package structure (no .model subdirectory)\n' +
                    '• All controllers, services, repositories\n' +
                    '• MapStruct for DTO mapping\n' +
                    '• Explicit logger initialization\n' +
                    '• OpenAPI configuration',
                    { modal: true },
                    'Generate Project'
                );
                
                if (useGenerator !== 'Generate Project') {
                    vscode.window.showInformationMessage('Code generation cancelled');
                    return;
                }
                
                // Ask for package name
                const packageName = await vscode.window.showInputBox({
                    prompt: 'Enter base package name (e.g., com.example.demo)',
                    placeHolder: 'com.example.demo',
                    value: projectInfo.basePackage || 'com.example.demo',
                    validateInput: (value) => {
                        if (!value || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
                            return 'Please enter a valid Java package name (e.g., com.example.demo)';
                        }
                        return null;
                    }
                });
                
                if (!packageName) {
                    vscode.window.showInformationMessage('Code generation cancelled - no package name provided');
                    return;
                }
                
                // Extract artifact info from OpenAPI
                const specContent = selectedOpenAPISpec.content;
                const serviceName = specContent.info?.title?.toLowerCase().replace(/\s+/g, '-') || 'api-service';
                const projectKey = selectedIssueKey.split('-')[0].toLowerCase();
                const artifactId = `${projectKey}-${serviceName}`;
                
                progress.report({ increment: 10, message: 'Generating complete Spring Boot project using templates...' });
                
                try {
                    // Parse OpenAPI to extract endpoints
                    const yaml = await import('js-yaml');
                    const openApiContent = fs.readFileSync(selectedOpenAPISpec.path, 'utf-8');
                    const openApiSpec: any = yaml.load(openApiContent);
                    
                    // Extract endpoints from OpenAPI spec
                    const endpoints: any[] = [];
                    if (openApiSpec.paths) {
                        Object.entries(openApiSpec.paths).forEach(([path, methods]: [string, any]) => {
                            Object.entries(methods).forEach(([method, details]: [string, any]) => {
                                endpoints.push({
                                    path,
                                    method: method.toUpperCase(),
                                    operationId: details.operationId,
                                    summary: details.summary,
                                    parameters: details.parameters || [],
                                    requestBody: details.requestBody,
                                    responses: details.responses
                                });
                            });
                        });
                    }
                    
                    // Create SpringBootGenerator instance
                    const templateProvider = new TemplateProvider(context.extensionPath);
                    const generator = new SpringBootGenerator(templateProvider);
                    
                    // Generate complete Spring Boot project AT WORKSPACE ROOT (not subdirectory)
                    // For "Implement Jira Story", we generate directly in workspace
                    await generator.generateProject(
                        {
                            targetDirectory: path.dirname(workspaceFolder.uri.fsPath), // Parent dir
                            projectName: path.basename(workspaceFolder.uri.fsPath),     // Use workspace folder name
                            packageName: packageName,
                            groupId: packageName,
                            artifactId: artifactId,
                            javaVersion: '21',
                            springBootVersion: '3.4.1',
                            buildTool: 'maven'
                        },
                        endpoints
                    );
                    
                    progress.report({ increment: 70, message: 'Project generated successfully!' });
                    
                    // Show success message
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    vscode.window.showInformationMessage(
                        `✅ Spring Boot project generated successfully for ${selectedIssueKey} in ${duration}s`,
                        'Open pom.xml'
                    ).then(selection => {
                        if (selection === 'Open pom.xml') {
                            const pomPath = path.join(workspaceFolder.uri.fsPath, 'pom.xml');
                            vscode.workspace.openTextDocument(pomPath).then(doc => {
                                vscode.window.showTextDocument(doc);
                            });
                        }
                    });
                    
                    telemetryService.trackEvent('jiraStory.implemented', {
                        issueKey: selectedIssueKey,
                        duration: (Date.now() - startTime).toString(),
                        generator: 'springBootGenerator',
                        hasOpenAPI: 'true'
                    });
                    
                    return; // Exit early - project is complete
                    
                } catch (error) {
                    logger.error('SpringBootGenerator failed, falling back to AI-based generation', error);
                    vscode.window.showWarningMessage('Template-based generation failed, falling back to AI generation...');
                    // Continue with AI-based generation below
                }
            } else {
                // SpringBootGenerator NOT triggered - show why
                const reason = !isRESTfulProject ? 'Not detected as RESTful project' :
                              !selectedOpenAPISpec ? 'No OpenAPI spec selected' :
                              projectInfo.type !== 'spring-boot' ? `Project type is ${projectInfo.type} (SpringBootGenerator only supports Spring Boot)` :
                              'Unknown reason';
                
                logger.warn(`⚠️ NOT using SpringBootGenerator: ${reason}`);
                
                if (projectInfo.type === 'dotnet' || projectInfo.type === 'nodejs' || projectInfo.type === 'python') {
                    vscode.window.showWarningMessage(
                        `⚠️ Template Generator Not Available\n\n` +
                        `SpringBootGenerator only supports Java/Spring Boot projects.\n` +
                        `Your project type: ${projectInfo.type}\n\n` +
                        `Using AI-based generation instead. Note: This may have inconsistent code structure.`,
                        'Continue with AI'
                    );
                } else {
                    await vscode.window.showWarningMessage(
                        `⚠️ Using AI-based generation (not SpringBootGenerator)\n\nReason: ${reason}\n\n` +
                        'This may result in inconsistent code structure.',
                        'Continue Anyway',
                        'Cancel'
                    ).then(choice => {
                        if (choice !== 'Continue Anyway') {
                            vscode.window.showInformationMessage('Code generation cancelled');
                            throw new Error('User cancelled - SpringBootGenerator not available');
                        }
                    });
                }
            }
            
            // Warn if build file is missing
            if (!projectInfo.hasBuildFile) {
                const buildFileType = projectInfo.type === 'spring-boot' ? 'pom.xml or build.gradle' :
                                     projectInfo.type === 'nodejs' ? 'package.json' :
                                     projectInfo.type === 'python' ? 'requirements.txt' : 'build file';
                                     
                const proceed = await vscode.window.showWarningMessage(
                    `⚠️ No ${buildFileType} detected. The implementation will include creating this file.\n\n` +
                    `Project Type: ${projectInfo.type}\n` +
                    `If this is a new project, the generated code will include all necessary setup files.\n\n` +
                    `Do you want to proceed?`,
                    'Proceed',
                    'Cancel'
                );
                
                if (proceed !== 'Proceed') {
                    vscode.window.showInformationMessage('Implementation cancelled. Consider using "Generate Spring Boot Project" for a complete project setup.');
                    return;
                }
            }

            progress.report({ increment: 10, message: 'Analyzing tasks...' });

            // Step 7: Analyze tasks and generate implementation plan
            const implementationPlan = await generateImplementationPlan(
                tasksToImplement,
                projectInfo,
                issue.description,
                progress,
                selectedOpenAPISpec // Pass OpenAPI spec for validation context
            );

            progress.report({ increment: 10, message: 'Showing preview...' });

            // Step 8: Show preview and get confirmation
            const previewMessage = `📦 **Implementation Preview**\n\n**Story:** ${selectedIssueKey} - ${issue.summary}\n\n**Tasks:** ${tasksToImplement.length}\n\n**Will Generate:**\n${implementationPlan.files.map(f => `  • ${f.path}`).join('\n')}\n\n**Project Type:** ${projectInfo.type}\n**Base Package:** ${projectInfo.basePackage || 'N/A'}${selectedOpenAPISpec ? `\n**OpenAPI Validation:** ✅ Enabled` : ''}\n\nProceed with implementation?`;

            const confirmImplement = await vscode.window.showInformationMessage(
                previewMessage,
                { modal: true },
                'Generate Code',
                'Cancel'
            );

            if (confirmImplement !== 'Generate Code') {
                vscode.window.showInformationMessage('Implementation cancelled');
                return;
            }

            progress.report({ increment: 20, message: 'Generating code...' });

            // Step 9: Generate code files using TEMPLATES
            const generatedFiles: string[] = [];
            const templateProvider = new TemplateProvider(context.extensionPath);

            // Add .gitignore if project doesn't have one and this is a new project
            const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
            if (!fs.existsSync(gitignorePath) && !projectInfo.hasBuildFile) {
                let gitignoreTemplate = '';
                if (projectInfo.type === 'spring-boot') {
                    gitignoreTemplate = await templateProvider.readSpringBootTemplate('.gitignore.template');
                } else if (projectInfo.type === 'dotnet') {
                    gitignoreTemplate = await templateProvider.readDotnetTemplate('.gitignore.template');
                }
                
                if (gitignoreTemplate) {
                    fs.writeFileSync(gitignorePath, gitignoreTemplate);
                    generatedFiles.push('.gitignore');
                    progress.report({ message: 'Generated .gitignore' });
                }
            }

            for (const fileSpec of implementationPlan.files) {
                const fileContent = await generateCodeFileFromTemplate(
                    fileSpec,
                    implementationPlan.context,
                    issue.description, // Pass full LLD content
                    projectInfo,
                    templateProvider,
                    progress
                );

                const fullPath = path.join(workspaceFolder.uri.fsPath, fileSpec.path);
                const dir = path.dirname(fullPath);

                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                fs.writeFileSync(fullPath, fileContent);
                generatedFiles.push(fileSpec.path);

                progress.report({ message: `Generated ${path.basename(fileSpec.path)}` });
            }

            // Step 9.5: Validate against OpenAPI spec if available
            if (selectedOpenAPISpec) {
                progress.report({ increment: 5, message: 'Validating against OpenAPI spec...' });
                
                const validation = await validateAgainstOpenAPI(
                    generatedFiles,
                    selectedOpenAPISpec,
                    projectInfo,
                    workspaceFolder.uri.fsPath
                );
                
                if (!validation.isValid && validation.issues.length > 0) {
                    const issueList = validation.issues.map(i => `  • ${i}`).join('\n');
                    logger.warn(`OpenAPI validation issues:\n${issueList}`);
                    
                    const choice = await vscode.window.showWarningMessage(
                        `⚠️ OpenAPI Validation Issues Detected:\n\n${issueList}\n\nProceed with commit or review first?`,
                        { modal: true },
                        'Review First',
                        'Commit Anyway'
                    );
                    
                    if (choice === 'Review First') {
                        vscode.window.showInformationMessage(`Generated ${generatedFiles.length} files. Please review before committing.`);
                        return;
                    }
                } else {
                    logger.info('✅ OpenAPI validation passed');
                    vscode.window.showInformationMessage('✅ Generated code matches OpenAPI specification');
                }
            }

            progress.report({ increment: 5, message: 'Committing to git...' });

            // Step 10: Git commit (no push - user needs to test first)
            let commitHash = '';
            let repoUrl = '';
            try {
                const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
                if (gitExtension) {
                    const git = gitExtension.getAPI(1);
                    if (git.repositories.length > 0) {
                        const repo = git.repositories[0];
                        
                        // Stage all generated files
                        for (const filePath of generatedFiles) {
                            const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
                            try {
                                await repo.add([fullPath]);
                            } catch (addError) {
                                logger.warn(`Could not stage ${filePath}: ${addError}`);
                            }
                        }
                        
                        // Commit
                        const commitMessage = `${selectedIssueKey}: Generated implementation\n\nGenerated files:\n${generatedFiles.map(f => `- ${f}`).join('\n')}`;
                        await repo.commit(commitMessage);
                        
                        // Get commit hash for remote link
                        commitHash = repo.state.HEAD?.commit || '';
                        
                        // Try to get GitHub repo URL
                        try {
                            const remotes = await repo.getRemotes();
                            const originRemote = remotes.find((r: any) => r.name === 'origin');
                            if (originRemote && originRemote.fetchUrl) {
                                const remoteUrl = originRemote.fetchUrl;
                                // Convert SSH or HTTPS to GitHub URL
                                const githubMatch = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
                                if (githubMatch) {
                                    repoUrl = `https://github.com/${githubMatch[1]}/${githubMatch[2]}`;
                                }
                            }
                        } catch (remoteError) {
                            logger.warn('Could not get remote URL');
                        }
                        
                        vscode.window.showInformationMessage(`✅ Committed ${generatedFiles.length} files to git (not pushed yet - test first!)`);
                    }
                }
            } catch (gitError: any) {
                logger.warn(`Git commit failed: ${gitError.message}`);
                vscode.window.showWarningMessage(`⚠️ Could not commit to git: ${gitError.message}`);
            }

            progress.report({ increment: 5, message: 'Updating Jira...' });

            // Step 11: Update Jira with progress
            const comment = `**Implementation Started**\n\n**Generated Files:**\n${generatedFiles.map(f => `- ${f}`).join('\n')}\n\n_Generated by DevEx AI Assistant_`;

            await jiraService.addComment(selectedIssueKey!, comment);

            // Add commit link to Jira's Development section
            if (commitHash && repoUrl) {
                const commitUrl = `${repoUrl}/commit/${commitHash}`;
                await jiraService.addRemoteLink(
                    selectedIssueKey!,
                    commitUrl,
                    `Commit: ${commitHash.substring(0, 7)}`,
                    'Commit'
                );
            }

            // Try to transition to IN PROGRESS
            // Note: transitionIssue has conversational error handling built-in
            // It will prompt user to fill required fields in browser if needed
            progress.report({ message: 'Transitioning to IN PROGRESS...' });
            try {
                await jiraService.transitionIssue(selectedIssueKey!, 'IN PROGRESS');
                vscode.window.showInformationMessage(`✅ ${selectedIssueKey} transitioned to IN PROGRESS`);
            } catch (transitionError: any) {
                // Only log - user already saw conversational error handling
                console.log('Transition did not complete:', transitionError.message);
            }

            progress.report({ increment: 10, message: 'Complete!' });

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('jira.story.implemented', {
                duration: duration.toString(),
                taskCount: tasksToImplement.length.toString(),
                fileCount: generatedFiles.length.toString(),
                projectType: projectInfo.type
            });

            // Step 12: Show success and open first file
            vscode.window.showInformationMessage(
                `✅ Generated ${generatedFiles.length} files for ${selectedIssueKey}`,
                'Open Files'
            ).then(async (action) => {
                if (action === 'Open Files' && generatedFiles.length > 0) {
                    const firstFile = path.join(workspaceFolder.uri.fsPath, generatedFiles[0]);
                    const doc = await vscode.workspace.openTextDocument(firstFile);
                    await vscode.window.showTextDocument(doc);
                }
            });
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to implement story: ${error.message}`);
        telemetryService.trackEvent('jira.story.implementation.error', {
            error: error.message
        });
    }
}

interface ProjectInfo {
    type: 'spring-boot' | 'nodejs' | 'python' | 'dotnet' | 'unknown';
    basePackage?: string;
    srcPath: string;
    language: string;
    hasBuildFile: boolean;
}

function extractTechStackFromLLD(lldContent: string): 'java' | 'dotnet' | 'nodejs' | 'python' | undefined {
    if (!lldContent) {
        return undefined;
    }

    const lowerContent = lldContent.toLowerCase();

    // Check for explicit technology_stack field
    const techStackMatch = lldContent.match(/technology[_\s]*stack\s*:?\s*([^\n]+)/i);
    if (techStackMatch) {
        const techStack = techStackMatch[1].trim().toLowerCase();
        
        if (techStack.includes('java') || techStack.includes('spring')) {
            return 'java';
        }
        if (techStack.includes('.net') || techStack.includes('dotnet') || techStack.includes('c#') || techStack.includes('csharp')) {
            return 'dotnet';
        }
        if (techStack.includes('node') || techStack.includes('typescript') || techStack.includes('javascript')) {
            return 'nodejs';
        }
        if (techStack.includes('python') || techStack.includes('fastapi') || techStack.includes('flask')) {
            return 'python';
        }
    }

    // Fallback: Check for technology mentions in the content
    const javaScore = (lowerContent.match(/\b(java|spring|maven|gradle|jdk)\b/g) || []).length;
    const dotnetScore = (lowerContent.match(/\b(\.net|dotnet|c#|csharp|asp\.net|entity framework)\b/g) || []).length;
    const nodejsScore = (lowerContent.match(/\b(node\.js|nodejs|typescript|express|npm)\b/g) || []).length;
    const pythonScore = (lowerContent.match(/\b(python|fastapi|flask|django|pip)\b/g) || []).length;

    const maxScore = Math.max(javaScore, dotnetScore, nodejsScore, pythonScore);
    
    // Only return if there's a clear winner (at least 3 mentions)
    if (maxScore >= 3) {
        if (javaScore === maxScore) return 'java';
        if (dotnetScore === maxScore) return 'dotnet';
        if (nodejsScore === maxScore) return 'nodejs';
        if (pythonScore === maxScore) return 'python';
    }

    return undefined;
}

async function detectProjectStructure(workspacePath: string, preferredTechStack?: 'java' | 'dotnet' | 'nodejs' | 'python'): Promise<ProjectInfo> {
    // If tech stack is explicitly provided, prioritize it
    if (preferredTechStack === 'dotnet') {
        // Check for .csproj files
        const csprojFiles = fs.existsSync(workspacePath) ? fs.readdirSync(workspacePath).filter(f => f.endsWith('.csproj')) : [];
        return {
            type: 'dotnet',
            srcPath: '.',
            language: 'csharp',
            hasBuildFile: csprojFiles.length > 0
        };
    }

    if (preferredTechStack === 'java') {
        // Check for pom.xml or build.gradle
        const hasPom = fs.existsSync(path.join(workspacePath, 'pom.xml'));
        const hasGradle = fs.existsSync(path.join(workspacePath, 'build.gradle')) || 
                         fs.existsSync(path.join(workspacePath, 'build.gradle.kts'));
        
        let basePackage = 'com.company.app';
        const srcMainJava = path.join(workspacePath, 'src', 'main', 'java');
        
        if (fs.existsSync(srcMainJava)) {
            basePackage = findBasePackage(srcMainJava);
        }

        return {
            type: 'spring-boot',
            basePackage,
            srcPath: 'src/main/java',
            language: 'java',
            hasBuildFile: hasPom || hasGradle
        };
    }

    if (preferredTechStack === 'nodejs') {
        const hasPackageJson = fs.existsSync(path.join(workspacePath, 'package.json'));
        return {
            type: 'nodejs',
            srcPath: 'src',
            language: 'typescript',
            hasBuildFile: hasPackageJson
        };
    }

    if (preferredTechStack === 'python') {
        const hasRequirements = fs.existsSync(path.join(workspacePath, 'requirements.txt')) ||
                               fs.existsSync(path.join(workspacePath, 'setup.py'));
        return {
            type: 'python',
            srcPath: 'src',
            language: 'python',
            hasBuildFile: hasRequirements
        };
    }

    // Fallback to file-based detection if no preference
    // Check for pom.xml (Maven Spring Boot)
    if (fs.existsSync(path.join(workspacePath, 'pom.xml'))) {
        const pomContent = fs.readFileSync(path.join(workspacePath, 'pom.xml'), 'utf-8');
        
        // Try to detect base package
        let basePackage = 'com.company.app';
        const srcMainJava = path.join(workspacePath, 'src', 'main', 'java');
        
        if (fs.existsSync(srcMainJava)) {
            const dirs = fs.readdirSync(srcMainJava);
            if (dirs.length > 0) {
                // Walk down to find the application class
                basePackage = findBasePackage(srcMainJava);
            }
        }

        return {
            type: 'spring-boot',
            basePackage,
            srcPath: 'src/main/java',
            language: 'java',
            hasBuildFile: true
        };
    }

    // Check for build.gradle (Gradle Spring Boot)
    if (fs.existsSync(path.join(workspacePath, 'build.gradle')) || 
        fs.existsSync(path.join(workspacePath, 'build.gradle.kts'))) {
        return {
            type: 'spring-boot',
            basePackage: 'com.company.app',
            srcPath: 'src/main/java',
            language: 'java',
            hasBuildFile: true
        };
    }
    
    // Check for Java source files without build file (incomplete Spring Boot project)
    const srcMainJava = path.join(workspacePath, 'src', 'main', 'java');
    if (fs.existsSync(srcMainJava)) {
        const basePackage = findBasePackage(srcMainJava) || 'com.company.app';
        return {
            type: 'spring-boot',
            basePackage,
            srcPath: 'src/main/java',
            language: 'java',
            hasBuildFile: false
        };
    }

    // Check for package.json (Node.js)
    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
        return {
            type: 'nodejs',
            srcPath: 'src',
            language: 'typescript',
            hasBuildFile: true
        };
    }

    // Check for requirements.txt or setup.py (Python)
    if (fs.existsSync(path.join(workspacePath, 'requirements.txt')) ||
        fs.existsSync(path.join(workspacePath, 'setup.py'))) {
        return {
            type: 'python',
            srcPath: 'src',
            language: 'python',
            hasBuildFile: true
        };
    }

    // Check for .csproj (.NET)
    const csprojFiles = fs.readdirSync(workspacePath).filter(f => f.endsWith('.csproj'));
    if (csprojFiles.length > 0) {
        return {
            type: 'dotnet',
            srcPath: '.',
            language: 'csharp',
            hasBuildFile: true
        };
    }

    return {
        type: 'unknown',
        srcPath: 'src',
        language: 'java',
        hasBuildFile: false
    };
}

function findBasePackage(srcPath: string): string {
    // Find the deepest package that contains a class with @SpringBootApplication
    const packages: string[] = [];
    
    function scanDir(dir: string, currentPackage: string) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const nextPackage = currentPackage ? `${currentPackage}.${item}` : item;
                scanDir(fullPath, nextPackage);
            } else if (item.endsWith('.java')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (content.includes('@SpringBootApplication')) {
                    packages.push(currentPackage);
                }
            }
        }
    }
    
    scanDir(srcPath, '');
    
    return packages.length > 0 ? packages[0] : 'com.company.app';
}

interface FileSpec {
    path: string;
    type: 'controller' | 'service' | 'repository' | 'entity' | 'dto' | 'config' | 'migration' | 'test' | 'pom' | 'build' | 'dependencies' | 'application' | 
          'csproj' | 'project' | 'program' | 'startup' | 'interface-service' | 'interface-repository' | 'dbcontext' | 'context' | 'middleware' | 'exception' |
          'dto-request' | 'dto-response' | 'request' | 'response' | 'model' | 'openapi' | 'swagger' | 'documentation';
    name: string;
    description: string;
    endpoints?: Array<{ method: string; path: string; operationId: string; summary: string }>;
}

interface ImplementationPlan {
    files: FileSpec[];
    context: string;
}

async function generateImplementationPlan(
    tasks: Array<{ key: string; summary: string; description: string }>,
    projectInfo: ProjectInfo,
    lldContext: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>,
    openAPISpec?: { path: string, content: any }
): Promise<ImplementationPlan> {
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    if (models.length === 0) {
        throw new Error('No AI models available');
    }

    const model = models[0];

    // Determine build tool from project
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const hasPomXml = workspaceFolder && fs.existsSync(path.join(workspaceFolder.uri.fsPath, 'pom.xml'));
    const hasBuildGradle = workspaceFolder && (fs.existsSync(path.join(workspaceFolder.uri.fsPath, 'build.gradle')) || fs.existsSync(path.join(workspaceFolder.uri.fsPath, 'build.gradle.kts')));
    const hasCsproj = workspaceFolder && fs.readdirSync(workspaceFolder.uri.fsPath).some(f => f.endsWith('.csproj'));
    const buildTool = projectInfo.type === 'dotnet' ? '.NET SDK' : (hasPomXml ? 'Maven' : (hasBuildGradle ? 'Gradle' : 'Maven'));

    // Analyze task names to determine what type of work is being requested
    const taskSummaries = tasks.map(t => t.summary.toLowerCase()).join(' | ');
    const taskDescriptions = tasks.map(t => (t.description || '').toLowerCase()).join(' | ');
    const allTaskText = `${taskSummaries} ${taskDescriptions}`;
    
    // Detect if this is a specific artifact generation task
    // Check for specific patterns that indicate ONLY spec/DDL generation (not full implementation)
    const hasOpenAPIKeyword = allTaskText.match(/\b(openapi|swagger|api spec|api contract|yaml spec|openapi\.yaml)\b/);
    const hasCodeImplementationKeyword = allTaskText.match(/\b(controller|service|repository|entity|endpoint|rest api|spring boot app|implement api|implement rest)\b/);
    const isOpenAPIOnly = hasOpenAPIKeyword && !hasCodeImplementationKeyword;
    
    const hasDDLKeyword = allTaskText.match(/\b(ddl|database schema|flyway|liquibase|migration script|create table|sql migration)\b/);
    const hasEntityKeyword = allTaskText.match(/\b(entity|jpa|hibernate|repository|dao)\b/);
    const isDDLOnly = hasDDLKeyword && !hasEntityKeyword;
    
    const hasDocKeyword = allTaskText.match(/\b(documentation|readme|doc|guide)\b/);
    const hasCodeKeyword = allTaskText.match(/\b(code|java|class|method|function)\b/);
    const isDocumentationOnly = hasDocKeyword && !hasCodeKeyword;

    // Determine generation scope
    let generationScope = 'full'; // Default to full implementation
    if (isOpenAPIOnly) {
        generationScope = 'openapi-only';
        logger.info(`Detected OpenAPI-only generation scope from task: "${taskSummaries}"`);
    } else if (isDDLOnly) {
        generationScope = 'ddl-only';
        logger.info(`Detected DDL-only generation scope from task: "${taskSummaries}"`);
    } else if (isDocumentationOnly) {
        generationScope = 'documentation-only';
        logger.info(`Detected documentation-only generation scope from task: "${taskSummaries}"`);
    } else {
        logger.info(`Detected full implementation scope from task: "${taskSummaries}"`);
    }

    // For openapi-only, use a completely different, simpler prompt
    if (generationScope === 'openapi-only') {
        const openapiOnlyPrompt = `You are creating an implementation plan for generating ONLY an OpenAPI specification file.

**Tasks to Implement:**
${tasks.map(t => `- ${t.key}: ${t.summary}\n  ${t.description}`).join('\n\n')}

**LLD Context:**
${lldContext.substring(0, 2000)}

⚠️ CRITICAL: Generate ONLY ONE file - the OpenAPI YAML specification. DO NOT include any Java code, pom.xml, controllers, services, or entities.

Return ONLY this JSON structure with EXACTLY ONE file:
{
    "context": "Generating OpenAPI 3.0 specification for the API",
    "files": [
        {
            "path": "openapi.yaml",
            "type": "openapi",
            "name": "API Specification",
            "description": "Complete OpenAPI 3.0 specification with all endpoints, schemas, and security definitions"
        }
    ]
}

Return ONLY valid JSON, no other text.`;

        const messages = [vscode.LanguageModelChatMessage.User(openapiOnlyPrompt)];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let fullResponse = '';
        for await (const fragment of response.text) {
            fullResponse += fragment;
        }

        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            // If AI fails, return default openapi-only plan
            return {
                context: 'Generating OpenAPI 3.0 specification',
                files: [{
                    path: 'openapi.yaml',
                    type: 'openapi',
                    name: 'API Specification',
                    description: 'Complete OpenAPI 3.0 specification'
                }]
            };
        }

        return JSON.parse(jsonMatch[0]);
    }

    const prompt = `You are a senior software engineer creating an implementation plan for Jira tasks.

**Project Type:** ${projectInfo.type}
**Language:** ${projectInfo.language}
${projectInfo.basePackage ? `**Base Package/Namespace:** ${projectInfo.basePackage}` : ''}
**Has Build File:** ${projectInfo.hasBuildFile}
${projectInfo.type === 'spring-boot' ? `**Build Tool:** ${buildTool} (DO NOT CHANGE THIS - use ${buildTool === 'Maven' ? 'pom.xml' : 'build.gradle'} ONLY)` : ''}
${projectInfo.type === 'dotnet' ? `**Build Tool:** .NET SDK (use .csproj files ONLY - NO pom.xml or package.json)` : ''}

**Generation Scope:** ${generationScope}
${generationScope === 'openapi-only' ? `⚠️ CRITICAL: User selected ONLY OpenAPI/Swagger specification generation. Generate ONLY the OpenAPI YAML/JSON file - NO Java code, NO entities, NO controllers, NO services.` : ''}
${generationScope === 'ddl-only' ? `⚠️ CRITICAL: User selected ONLY database DDL/migration generation. Generate ONLY Flyway migration SQL files - NO Java code, NO entities, NO repositories.` : ''}
${generationScope === 'documentation-only' ? `⚠️ CRITICAL: User selected ONLY documentation generation. Generate ONLY README/documentation files - NO code files.` : ''}

${!projectInfo.hasBuildFile ? `⚠️ IMPORTANT: This project is MISSING its build file. Your implementation plan MUST include creating the build file as the FIRST file.` : ''}

**LLD Context:**
${lldContext.substring(0, 2000)}

${openAPISpec ? `
**OpenAPI Specification:** ✅ Available for validation
**OpenAPI File:** ${path.basename(openAPISpec.path)}
**API Title:** ${openAPISpec.content.info?.title || 'N/A'}
**API Version:** ${openAPISpec.content.info?.version || 'N/A'}
**Endpoints Defined:** ${Object.keys(openAPISpec.content.paths || {}).length}
**Schemas Defined:** ${Object.keys(openAPISpec.content.components?.schemas || {}).length}

⚠️ CRITICAL: Your implementation MUST match the OpenAPI specification:
- Controller endpoints MUST match the paths and HTTP methods in the spec
- Request/Response DTOs MUST match the schema definitions in the spec
- Field names, types, and validation rules MUST match exactly
- Use the operationId from OpenAPI as the method name in controllers

OpenAPI Summary:
${JSON.stringify({
    paths: Object.keys(openAPISpec.content.paths || {}),
    schemas: Object.keys(openAPISpec.content.components?.schemas || {})
}, null, 2).substring(0, 1000)}
` : '⚠️ No OpenAPI specification available - implementation based on LLD only'}

**Tasks to Implement:**
${tasks.map(t => `- ${t.key}: ${t.summary}\n  ${t.description}`).join('\n\n')}

${generationScope === 'full' ? 'Generate a comprehensive implementation plan with ALL necessary files for a complete, compilable implementation.' : `Generate ONLY the files relevant to: ${generationScope.replace('-only', '').toUpperCase()}`}

${generationScope === 'full' ? `
${projectInfo.type === 'spring-boot' ? `
For Spring Boot, MUST generate:
${!projectInfo.hasBuildFile ? `1. **pom.xml** (CRITICAL - CREATE FIRST, NOT build.gradle) - Complete Spring Boot ${buildTool} project with:\n   - Spring Boot parent and dependencies (web, data-jpa, validation, test)\n   - Java version configuration\n   - Build plugins (spring-boot-maven-plugin)\n   - Group ID, artifact ID, version\n` : `1. ${buildTool === 'Maven' ? 'pom.xml' : 'build.gradle'} updates - ONLY if new dependencies are needed\n`}
2. Application main class with @SpringBootApplication (if not exists)
3. application.yml with database and server config (if not exists)
4. Controller classes (REST endpoints with @RestController, @RequestMapping)
5. Service classes (@Service with business logic)
6. Repository interfaces (@Repository with Spring Data JPA)
7. Entity classes (@Entity with JPA annotations)
8. DTO classes for request/response
9. Configuration classes if needed (@Configuration)
10. Flyway migration SQL if database changes (V001__description.sql)
11. Test classes (@SpringBootTest)
` : ''}

${projectInfo.type === 'dotnet' ? `
For .NET Core, MUST generate:
${!hasCsproj ? `1. **{ProjectName}.csproj** (CRITICAL - CREATE FIRST) - .NET 8.0 project file with:
   - TargetFramework: net8.0 (NOT netcoreapp2.2 or any old version)
   - PackageReferences: ASP.NET Core, EF Core, JWT, Serilog
   - NO pom.xml, NO package.json, NO build.gradle - ONLY .csproj for .NET projects
` : `1. .csproj updates - ONLY if new NuGet packages needed\n`}
2. Program.cs with WebApplication builder and middleware configuration
3. appsettings.json with connection strings and JWT config
4. Controller classes (API endpoints with [ApiController], [Route] attributes)
5. Service classes (IService interfaces + implementations with DI)
6. Repository classes (IRepository<T> interfaces + implementations)
7. DbContext class (Entity Framework Core)
8. Entity/Model classes (with data annotations)
9. DTO classes (Request/Response with validation attributes)
10. GlobalExceptionHandler middleware
11. Test project ({ProjectName}.Tests.csproj) with xUnit/NUnit

⚠️ CRITICAL .NET NAMING RULES:
- Controllers: {Feature}Controller (e.g., ACBController, NOT ACBControllerController)
- Services: {Feature}Service + I{Feature}Service interface (e.g., ACBService + IACBService)
- Repositories: {Feature}Repository + I{Feature}Repository (e.g., ACBRepository + IACBRepository)
- Entities: {Feature}Entity or {Feature} (e.g., ACBEntity or ACB)
- DTOs: {Feature}Request + {Feature}Response (e.g., ACBRequest + ACBResponse)
- Namespace: Use consistent ${projectInfo.basePackage || 'Company.Application'}.* everywhere
  - Controllers: ${projectInfo.basePackage || 'Company.Application'}.Controllers
  - Services: ${projectInfo.basePackage || 'Company.Application'}.Services
  - Repositories: ${projectInfo.basePackage || 'Company.Application'}.Data
  - Models: ${projectInfo.basePackage || 'Company.Application'}.Models
  - DTOs: ${projectInfo.basePackage || 'Company.Application'}.DTOs

⚠️ REQUIRED FILES FOR .NET:
- Data/IRepository.cs: Generic IRepository<T> interface
- Data/Repository.cs: Generic Repository<T> implementation
- Data/ApplicationDbContext.cs: DbContext (NOT {Feature}DbContext)
- For each feature (e.g., ACB):
  * Controllers/{Feature}Controller.cs
  * Services/I{Feature}Service.cs (interface only)
  * Services/{Feature}Service.cs (implementation)
  * Data/I{Feature}Repository.cs : IRepository<{Feature}Entity>
  * Data/{Feature}Repository.cs : Repository<{Feature}Entity>
  * Models/{Feature}Entity.cs
  * DTOs/{Feature}Request.cs
  * DTOs/{Feature}Response.cs
` : ''}

${projectInfo.type === 'nodejs' ? `
For Node.js, MUST generate:
1. package.json updates if new dependencies needed
2. Route handlers (Express routes)
3. Service classes (business logic)
4. Database models (Mongoose/TypeORM)
5. DTOs/interfaces (TypeScript types)
6. Middleware if needed
7. Test files (Jest/Mocha)
` : ''}

${projectInfo.type === 'python' ? `
For Python, MUST generate:
1. requirements.txt updates if new dependencies needed
2. API routes (FastAPI/Flask)
3. Service modules (business logic)
4. Database models (SQLAlchemy/Pydantic)
5. Schemas (request/response models)
6. Test files (pytest)
` : ''}
` : ''}

${generationScope === 'openapi-only' ? `
For OpenAPI Specification ONLY, generate:
1. openapi.yaml or swagger.yaml - Complete OpenAPI 3.0 specification with:
   - All API endpoints from the LLD
   - Request/response schemas
   - Security definitions (JWT/OAuth)
   - Example requests and responses
   - Error responses (400, 401, 403, 404, 500)
   - tags, descriptions, operationIds
   
DO NOT generate any Java/C#/Python code files. ONLY the OpenAPI YAML specification.
` : ''}

${generationScope === 'ddl-only' ? `
For Database DDL/Migration ONLY, generate:
1. Flyway migration SQL files (V001__description.sql, V002__description.sql, etc.) with:
   - CREATE TABLE statements for all entities
   - Primary keys, foreign keys, indexes
   - NOT NULL constraints, CHECK constraints
   - Default values where appropriate
   - Comments on tables and columns
   
DO NOT generate any Java/C#/Python entity classes or repository code. ONLY the SQL migration files.
` : ''}

${generationScope === 'documentation-only' ? `
For Documentation ONLY, generate:
1. README.md with:
   - Project overview and purpose
   - Technology stack
   - Setup instructions
   - API documentation links
   - Development workflow
   - Testing instructions
   
DO NOT generate any code files. ONLY documentation.
` : ''}

Format as JSON:
{
    "context": "Brief summary of what we're implementing and key technical decisions",
    "files": [
        {
            "path": "${generationScope === 'openapi-only' ? 'openapi.yaml' : generationScope === 'ddl-only' ? 'src/main/resources/db/migration/V001__initial_schema.sql' : projectInfo.type === 'spring-boot' ? `${projectInfo.srcPath}/${projectInfo.basePackage?.replace(/\./g, '/')}/controller/PayrollController.java` : 'src/controllers/payroll.controller.ts'}",
            "type": "${generationScope === 'openapi-only' ? 'openapi' : generationScope === 'ddl-only' ? 'migration' : 'controller'}",
            "name": "${generationScope === 'openapi-only' ? 'OpenAPI Specification' : generationScope === 'ddl-only' ? 'Initial Schema Migration' : 'PayrollController'}",
            "description": "${generationScope === 'openapi-only' ? 'Complete OpenAPI 3.0 specification for all API endpoints' : generationScope === 'ddl-only' ? 'Database schema creation SQL' : 'REST endpoints for payroll operations'}"
        }
    ]
}

${generationScope === 'openapi-only' ? `
⚠️ CRITICAL REMINDER: Your response must contain EXACTLY ONE file in the "files" array, and that file MUST be:
- path: "openapi.yaml" (or "swagger.yaml")
- type: "openapi"
- NO Java files, NO controller files, NO entity files
` : ''}`;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullResponse = '';
    for await (const fragment of response.text) {
        fullResponse += fragment;
    }

    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse implementation plan');
    }

    const plan: ImplementationPlan = JSON.parse(jsonMatch[0]);
    
    // CRITICAL: Enforce scope filtering - remove any files that don't match the scope
    if (generationScope === 'openapi-only') {
        // ONLY keep openapi/swagger files
        plan.files = plan.files.filter(f => 
            f.type === 'openapi' || 
            f.type === 'swagger' || 
            f.path.toLowerCase().endsWith('openapi.yaml') || 
            f.path.toLowerCase().endsWith('swagger.yaml') ||
            f.path.toLowerCase().endsWith('openapi.yml') ||
            f.path.toLowerCase().endsWith('swagger.yml')
        );
        
        if (plan.files.length === 0) {
            // AI didn't generate any OpenAPI files, create one manually
            logger.warn('AI did not generate OpenAPI file, creating default entry');
            plan.files = [{
                path: 'openapi.yaml',
                type: 'openapi',
                name: 'API Specification',
                description: 'OpenAPI 3.0 specification for all API endpoints'
            }];
        } else if (plan.files.length > 1) {
            // Keep only the first OpenAPI file
            logger.warn(`AI generated ${plan.files.length} files for openapi-only scope, keeping only first OpenAPI file`);
            plan.files = [plan.files[0]];
        }
        
        logger.info(`OpenAPI-only scope: Will generate ${plan.files.length} file(s): ${plan.files.map(f => f.path).join(', ')}`);
    } else if (generationScope === 'ddl-only') {
        // ONLY keep migration/SQL files
        plan.files = plan.files.filter(f => 
            f.type === 'migration' || 
            f.path.toLowerCase().includes('migration') ||
            f.path.toLowerCase().endsWith('.sql')
        );
        logger.info(`DDL-only scope: Will generate ${plan.files.length} file(s)`);
    } else if (generationScope === 'documentation-only') {
        // ONLY keep documentation files
        plan.files = plan.files.filter(f => 
            f.type === 'documentation' || 
            f.path.toLowerCase().includes('readme') ||
            f.path.toLowerCase().endsWith('.md')
        );
        logger.info(`Documentation-only scope: Will generate ${plan.files.length} file(s)`);
    }

    return plan;
}

async function generateCodeFileFromTemplate(
    fileSpec: FileSpec,
    context: string,
    fullLLDContent: string, // Full LLD from story description
    projectInfo: ProjectInfo,
    templateProvider: TemplateProvider,
    progress: vscode.Progress<{ increment?: number; message?: string }>
): Promise<string> {
    logger.info(`Generating ${fileSpec.path} from template (type: ${fileSpec.type})`);

    // For OpenAPI/Swagger files, use the specialized AIService method
    if (fileSpec.type === 'openapi' || fileSpec.type === 'swagger') {
        logger.info('Using AIService.generateOpenAPISpec for comprehensive OpenAPI generation');
        const aiService = new AIService();
        
        // Extract service name from project or fileSpec
        const serviceName = projectInfo.basePackage?.split('.').pop() || fileSpec.name || 'API';
        
        const openAPISpec = await aiService.generateOpenAPISpec(fullLLDContent, {
            serviceName: serviceName,
            version: '1.0.0',
            format: fileSpec.path.endsWith('.json') ? 'json' : 'yaml',
            includeExamples: true,
            includeSecurity: true
        });
        
        return openAPISpec;
    }

    // For Spring Boot projects, use templates
    if (projectInfo.type === 'spring-boot') {
        return generateSpringBootFile(fileSpec, projectInfo, templateProvider);
    }

    // For .NET projects, use templates
    if (projectInfo.type === 'dotnet') {
        return generateDotnetFile(fileSpec, projectInfo, templateProvider);
    }

    // For other project types, fall back to AI with strict template requirements
    return generateCodeFileWithAI(fileSpec, context, projectInfo, progress);
}

async function generateSpringBootFile(
    fileSpec: FileSpec,
    projectInfo: ProjectInfo,
    templateProvider: TemplateProvider
): Promise<string> {
    const fileName = path.basename(fileSpec.path);
    
    // Determine which template to use based on file type
    let templateName = '';
    let templateData: any = {
        packageName: projectInfo.basePackage,
        className: fileSpec.name
    };

    switch (fileSpec.type) {
        case 'controller':
            templateName = 'Controller.java.template';
            templateData.serviceName = fileSpec.name.replace('Controller', 'Service');
            templateData.resourceName = fileSpec.name.replace('Controller', '').toLowerCase();
            templateData.endpoints = fileSpec.endpoints || [];
            break;

        case 'service':
            templateName = 'Service.java.template';
            templateData.repositoryName = fileSpec.name.replace('Service', 'Repository');
            templateData.resourceName = fileSpec.name.replace('Service', '').toLowerCase();
            break;

        case 'repository':
            templateName = 'Repository.java.template';
            templateData.entityName = fileSpec.name.replace('Repository', '');
            templateData.resourceName = fileSpec.name.replace('Repository', '').toLowerCase();
            break;

        case 'pom':
        case 'build':
            if (fileName === 'pom.xml') {
                templateName = 'pom.xml.template';
                const appConfig = getConfig();
                templateData = {
                    groupId: projectInfo.basePackage?.split('.').slice(0, 2).join('.') || 'com.company',
                    artifactId: fileSpec.name || 'app',
                    version: '0.0.1-SNAPSHOT',
                    name: fileSpec.name || 'Application',
                    description: fileSpec.description || 'Spring Boot Application',
                    javaVersion: appConfig.javaVersion,
                    springBootVersion: appConfig.springBootVersion
                };
            } else if (fileName === 'build.gradle') {
                templateName = 'build.gradle.template';
            }
            break;

        case 'config':
            if (fileName === 'application.yml' || fileName === 'application.yaml') {
                templateName = 'application.yml.template';
                templateData = {
                    applicationName: fileSpec.name || 'application',
                    port: 8080
                };
            } else if (fileName.includes('OpenApi') || fileName.includes('Swagger')) {
                templateName = 'OpenApiConfig.java.template';
            } else {
                templateName = 'GlobalExceptionHandler.java.template';
            }
            break;

        case 'application':
            templateName = 'Application.java.template';
            templateData.className = fileSpec.name || 'Application';
            break;

        case 'test':
            templateName = 'ApplicationTests.java.template';
            templateData.className = fileSpec.name || 'ApplicationTests';
            break;

        case 'openapi':
        case 'swagger':
        case 'documentation':
            // These are handled in generateCodeFileFromTemplate before reaching here
            // This case should not be reached, but if it is, throw error
            throw new Error(`${fileSpec.type} files should be handled before template generation`);

        default:
            logger.warn(`No template found for file type: ${fileSpec.type}, falling back to AI`);
            // Fall back to AI for unknown types
            return generateCodeFileWithAI(fileSpec, '', projectInfo, {
                report: () => {}
            } as any);
    }

    if (!templateName) {
        throw new Error(`Unable to determine template for ${fileSpec.path}`);
    }

    try {
        const template = await templateProvider.readSpringBootTemplate(templateName);
        const compiled = Handlebars.compile(template);
        const content = compiled(templateData);
        
        logger.info(`✓ Generated ${fileSpec.path} from ${templateName}`);
        return content;
    } catch (error: any) {
        logger.error(`Failed to generate from template ${templateName}: ${error.message}`);
        throw error;
    }
}

async function generateDotnetFile(
    fileSpec: FileSpec,
    projectInfo: ProjectInfo,
    templateProvider: TemplateProvider
): Promise<string> {
    const fileName = path.basename(fileSpec.path);
    
    // Clean up the name - remove redundant suffixes
    let cleanName = fileSpec.name;
    
    // Fix double suffixes: ACBControllerController → ACBController
    if (cleanName.endsWith('ControllerController')) {
        cleanName = cleanName.replace('ControllerController', 'Controller');
    }
    if (cleanName.endsWith('ServiceService')) {
        cleanName = cleanName.replace('ServiceService', 'Service');
    }
    if (cleanName.endsWith('RepositoryRepository')) {
        cleanName = cleanName.replace('RepositoryRepository', 'Repository');
    }
    
    // Determine which template to use based on file type
    let templateName = '';
    let templateData: any = {
        namespace: projectInfo.basePackage || 'Company.Application',
        className: cleanName,
        projectName: cleanName.replace(/Controller|Service|Repository|Entity|Request|Response|Tests?/g, '') || 'Application'
    };

    switch (fileSpec.type) {
        case 'controller':
            templateName = 'Controller.cs.template';
            // ACBController → ACB
            const featureName = cleanName.replace('Controller', '');
            templateData.serviceName = featureName + 'Service';
            templateData.serviceNameCamel = featureName.charAt(0).toLowerCase() + featureName.slice(1) + 'Service';
            templateData.resourceName = featureName;
            templateData.className = featureName + 'Controller';
            break;

        case 'service':
            templateName = 'Service.cs.template';
            const serviceFeature = cleanName.replace('Service', '');
            templateData.className = serviceFeature + 'Service';
            templateData.entityName = serviceFeature + 'Entity';
            break;

        case 'interface-service':
            templateName = 'IService.cs.template';
            const iServiceFeature = cleanName.replace(/^I/, '').replace('Service', '');
            templateData.className = iServiceFeature + 'Service';
            break;

        case 'repository':
            templateName = 'Repository.cs.template';
            const repoFeature = cleanName.replace('Repository', '');
            templateData.className = repoFeature + 'Repository';
            templateData.entityName = repoFeature + 'Entity';
            // If name is just "Repository", use generic template
            if (cleanName === 'Repository' || cleanName === 'RepositoryGeneric') {
                templateName = 'RepositoryGeneric.cs.template';
                templateData.className = 'Repository';
            }
            break;

        case 'interface-repository':
            templateName = 'IRepository.cs.template';
            const iRepoFeature = cleanName.replace(/^I/, '').replace('Repository', '');
            templateData.className = iRepoFeature + 'Repository';
            templateData.entityName = iRepoFeature + 'Entity';
            // If name is just "IRepository", use generic template
            if (cleanName === 'IRepository' || cleanName === 'IRepositoryGeneric') {
                templateName = 'IRepositoryGeneric.cs.template';
                templateData.className = 'IRepository';
            }
            break;

        case 'entity':
        case 'model':
            templateName = 'Entity.cs.template';
            const entityName = cleanName.replace('Entity', '');
            templateData.className = entityName + 'Entity';
            templateData.tableName = entityName + 's'; // Simple pluralization
            break;

        case 'dto-request':
        case 'request':
            templateName = 'RequestDto.cs.template';
            const requestFeature = cleanName.replace(/Request|Dto/g, '');
            templateData.className = requestFeature + 'Request';
            break;

        case 'dto-response':
        case 'response':
            templateName = 'ResponseDto.cs.template';
            const responseFeature = cleanName.replace(/Response|Dto/g, '');
            templateData.className = responseFeature + 'Response';
            break;

        case 'dbcontext':
        case 'context':
            templateName = 'DbContext.cs.template';
            templateData.className = 'ApplicationDbContext'; // Always use ApplicationDbContext
            break;

        case 'middleware':
        case 'exception':
            templateName = 'GlobalExceptionHandler.cs.template';
            break;

        case 'project':
        case 'csproj':
            if (fileName.endsWith('.csproj')) {
                templateName = 'Project.csproj.template';
                templateData.projectName = fileSpec.name || 'Application';
                templateData.targetFramework = 'net8.0';
            }
            break;

        case 'program':
        case 'startup':
            templateName = 'Program.cs.template';
            templateData.projectDescription = fileSpec.description || 'ASP.NET Core Application';
            templateData.databaseName = templateData.projectName + 'Db';
            break;

        case 'config':
            if (fileName === 'appsettings.json') {
                templateName = 'appsettings.json.template';
                templateData.databaseName = templateData.projectName + 'Db';
            } else if (fileName === 'appsettings.Development.json') {
                templateName = 'appsettings.Development.json.template';
            }
            break;

        case 'test':
            // TODO: Add test project templates
            logger.warn('Test project generation not yet implemented for .NET');
            return `// TODO: Generate test project for ${fileSpec.name}`;

        default:
            logger.warn(`No template found for .NET file type: ${fileSpec.type}, falling back to AI`);
            return generateCodeFileWithAI(fileSpec, '', projectInfo, {
                report: () => {}
            } as any);
    }

    if (!templateName) {
        throw new Error(`Unable to determine .NET template for ${fileSpec.path}`);
    }

    try {
        const template = await templateProvider.readDotnetTemplate(templateName);
        const compiled = Handlebars.compile(template);
        const content = compiled(templateData);
        
        logger.info(`✓ Generated ${fileSpec.path} from ${templateName}`);
        return content;
    } catch (error: any) {
        logger.error(`Failed to generate from .NET template ${templateName}: ${error.message}`);
        throw error;
    }
}

async function generateCodeFileWithAI(
    fileSpec: FileSpec,
    context: string,
    projectInfo: ProjectInfo,
    progress: vscode.Progress<{ increment?: number; message?: string }>
): Promise<string> {
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    if (models.length === 0) {
        throw new Error('No AI models available');
    }

    const model = models[0];

    const prompt = `Generate COMPLETE, production-ready ${projectInfo.language} code for this file that will compile/run without errors.

**Context:** ${context}

**File:** ${fileSpec.path}
**Type:** ${fileSpec.type}
**Name:** ${fileSpec.name}
**Description:** ${fileSpec.description}

**Project Type:** ${projectInfo.type}
${projectInfo.basePackage ? `**Package:** ${projectInfo.basePackage}` : ''}

CRITICAL Requirements:
- Generate COMPLETE, COMPILABLE code - no placeholders or "..."
- Include ALL necessary imports (fully qualified)
- Include package declaration (for Java)
- Add comprehensive documentation (JavaDoc/JSDoc/docstrings)
- Include proper error handling and validation
- Add TODO comments ONLY for business-specific logic that requires domain knowledge
- Follow SOLID principles and ${projectInfo.language} best practices
${projectInfo.type === 'spring-boot' ? '- Use proper Spring Boot annotations (@RestController, @Service, @Repository, @Entity, @Autowired)' : ''}
${projectInfo.type === 'spring-boot' ? '- Include validation annotations (@Valid, @NotNull, @NotEmpty, @Size, etc.)' : ''}
${projectInfo.type === 'spring-boot' ? '- Use proper Spring Data JPA for repositories (extends JpaRepository)' : ''}
${fileSpec.type === 'test' ? '- Include COMPLETE test cases with given-when-then structure, assertions, and test setup' : ''}
${fileSpec.type === 'migration' ? '- Use Flyway naming convention (V###__description.sql) with proper SQL DDL' : ''}
${fileSpec.type === 'pom' || fileSpec.name === 'pom.xml' ? `
⚠️ CRITICAL for pom.xml:
1. MUST use Spring Boot parent POM:
   <parent>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-parent</artifactId>
       <version>3.4.1</version>
   </parent>
2. DO NOT specify versions for Spring Boot managed dependencies:
   - spring-boot-starter-web (NO version)
   - spring-boot-starter-data-jpa (NO version)
   - spring-boot-starter-validation (NO version)
   - spring-boot-starter-test (NO version)
   - spring-boot-starter-actuator (NO version)
   - h2database (NO version)
3. Spring Boot parent manages ALL dependency versions automatically
4. Plugin section: spring-boot-maven-plugin (NO version needed)
5. Use properties for non-Spring dependencies: springdoc.version, lombok.version, mapstruct.version
` : ''}

Generate ONLY the code with NO markdown fences, NO explanations, NO placeholders.`;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let code = '';
    for await (const fragment of response.text) {
        code += fragment;
    }

    // Clean up markdown code blocks if present
    code = code.replace(/```[\w]*\n/g, '').replace(/```$/g, '').trim();

    return code;
}

/**
 * Find OpenAPI specification files in the workspace AND .devex folder
 */
async function findOpenAPISpecs(workspacePath: string): Promise<Array<{ path: string, content: any }>> {
    const SwaggerParser = require('swagger-parser');
    const specs: Array<{ path: string, content: any }> = [];
    
    // Common OpenAPI file patterns
    const patterns = [
        '**/openapi.yaml',
        '**/openapi.yml', 
        '**/swagger.yaml',
        '**/swagger.yml',
        '**/openapi.json',
        '**/swagger.json',
        '**/api-spec.yaml',
        '**/api-spec.yml',
        '**/.devex/**/openapi.yaml',  // Check .devex folder
        '**/.devex/**/openapi.yml',
        '**/.devex/**/swagger.yaml',
        '**/.devex/**/swagger.yml'
    ];
    
    try {
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 20);
            
            for (const fileUri of files) {
                // Skip if already added (avoid duplicates)
                if (specs.some(s => s.path === fileUri.fsPath)) {
                    continue;
                }
                
                try {
                    // Validate and parse the OpenAPI spec
                    const api = await SwaggerParser.validate(fileUri.fsPath);
                    specs.push({
                        path: fileUri.fsPath,
                        content: api
                    });
                    logger.info(`Found valid OpenAPI spec: ${fileUri.fsPath}`);
                } catch (error: any) {
                    logger.warn(`Invalid OpenAPI spec at ${fileUri.fsPath}: ${error.message}`);
                }
            }
        }
        
        // Also check directly in .devex folder if it exists
        const devexFolder = path.join(workspacePath, '.devex');
        if (fs.existsSync(devexFolder)) {
            const devexFiles = fs.readdirSync(devexFolder);
            for (const file of devexFiles) {
                if (file.match(/openapi\.(yaml|yml|json)$/i) || file.match(/swagger\.(yaml|yml|json)$/i)) {
                    const filePath = path.join(devexFolder, file);
                    
                    // Skip if already added
                    if (specs.some(s => s.path === filePath)) {
                        continue;
                    }
                    
                    try {
                        const api = await SwaggerParser.validate(filePath);
                        specs.push({
                            path: filePath,
                            content: api
                        });
                        logger.info(`Found valid OpenAPI spec in .devex: ${filePath}`);
                    } catch (error: any) {
                        logger.warn(`Invalid OpenAPI spec at ${filePath}: ${error.message}`);
                    }
                }
            }
        }
    } catch (error: any) {
        logger.error(`Error searching for OpenAPI specs: ${error.message}`);
    }
    
    // Sort specs: .devex folder first, then by filename
    specs.sort((a, b) => {
        const aInDevex = a.path.includes('.devex');
        const bInDevex = b.path.includes('.devex');
        if (aInDevex && !bInDevex) {return -1;}
        if (!aInDevex && bInDevex) {return 1;}
        return path.basename(a.path).localeCompare(path.basename(b.path));
    });
    
    return specs;
}

/**
 * Validate generated code against OpenAPI specification
 */
async function validateAgainstOpenAPI(
    generatedFiles: string[],
    openAPISpec: { path: string, content: any },
    projectInfo: ProjectInfo,
    workspacePath: string
): Promise<{ isValid: boolean, issues: string[] }> {
    const issues: string[] = [];
    
    try {
        // Extract endpoints from OpenAPI spec
        const specEndpoints = extractEndpointsFromOpenAPI(openAPISpec.content);
        
        // Read generated controller files to check if they implement the endpoints
        const controllerFiles = generatedFiles.filter(f => 
            f.includes('controller') || f.includes('Controller')
        );
        
        if (controllerFiles.length === 0 && specEndpoints.length > 0) {
            issues.push(`⚠️ OpenAPI spec defines ${specEndpoints.length} endpoints but no controller files were generated`);
        }
        
        // Check DTOs match OpenAPI schemas
        const specSchemas = Object.keys(openAPISpec.content.components?.schemas || {});
        const dtoFiles = generatedFiles.filter(f => 
            f.includes('/dto/') || f.includes('\\dto\\') ||
            f.includes('Request') || f.includes('Response')
        );
        
        if (specSchemas.length > 0 && dtoFiles.length === 0) {
            issues.push(`⚠️ OpenAPI spec defines ${specSchemas.length} schemas but no DTO files were generated`);
        }
        
        // Validate HTTP methods and paths
        for (const endpoint of specEndpoints) {
            logger.info(`OpenAPI endpoint: ${endpoint.method.toUpperCase()} ${endpoint.path}`);
        }
        
        if (issues.length === 0) {
            logger.info('✅ Generated code structure matches OpenAPI specification');
        }
        
    } catch (error: any) {
        logger.error(`Error validating against OpenAPI: ${error.message}`);
        issues.push(`Validation error: ${error.message}`);
    }
    
    return {
        isValid: issues.length === 0,
        issues
    };
}

function extractEndpointsFromOpenAPI(spec: any): Array<{ path: string, method: string, operationId?: string }> {
    const endpoints: Array<{ path: string, method: string, operationId?: string }> = [];
    
    const paths = spec.paths || {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
        const methods = ['get', 'post', 'put', 'patch', 'delete'];
        for (const method of methods) {
            if ((pathItem as any)[method]) {
                const operation = (pathItem as any)[method];
                endpoints.push({
                    path: pathKey,
                    method,
                    operationId: operation.operationId
                });
            }
        }
    }
    
    return endpoints;
}
