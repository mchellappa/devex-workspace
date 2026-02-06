import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';
import { TemplateProvider } from '../services/templateProvider';
import { logger } from '../utils/logger';

// Register Handlebars helpers
Handlebars.registerHelper('camelCase', function(str: string) {
    return str.charAt(0).toLowerCase() + str.slice(1);
});

Handlebars.registerHelper('pascalCase', function(str: string) {
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
                prompt: 'Enter Jira Story or Task key (e.g., SWIFT-123)',
                placeHolder: 'SWIFT-123',
                validateInput: (value) => {
                    if (!value || !/^[A-Z]+-\d+$/.test(value)) {
                        return 'Please enter a valid Jira issue key (e.g., SWIFT-123)';
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

            const projectInfo = await detectProjectStructure(workspaceFolder.uri.fsPath);
            
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
                progress
            );

            progress.report({ increment: 10, message: 'Showing preview...' });

            // Step 8: Show preview and get confirmation
            const previewMessage = `📦 **Implementation Preview**\n\n**Story:** ${selectedIssueKey} - ${issue.summary}\n\n**Tasks:** ${tasksToImplement.length}\n\n**Will Generate:**\n${implementationPlan.files.map(f => `  • ${f.path}`).join('\n')}\n\n**Project Type:** ${projectInfo.type}\n**Base Package:** ${projectInfo.basePackage || 'N/A'}\n\nProceed with implementation?`;

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

            for (const fileSpec of implementationPlan.files) {
                const fileContent = await generateCodeFileFromTemplate(
                    fileSpec,
                    implementationPlan.context,
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

            progress.report({ increment: 5, message: 'Committing to git...' });

            // Step 10: Git commit (no push - user needs to test first)
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

async function detectProjectStructure(workspacePath: string): Promise<ProjectInfo> {
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
    type: 'controller' | 'service' | 'repository' | 'entity' | 'dto' | 'config' | 'migration' | 'test' | 'pom' | 'build' | 'dependencies' | 'application';
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
    progress: vscode.Progress<{ increment?: number; message?: string }>
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
    const buildTool = hasPomXml ? 'Maven' : (hasBuildGradle ? 'Gradle' : 'Maven');

    const prompt = `You are a senior software engineer creating an implementation plan for Jira tasks.

**Project Type:** ${projectInfo.type}
**Language:** ${projectInfo.language}
${projectInfo.basePackage ? `**Base Package:** ${projectInfo.basePackage}` : ''}
**Has Build File:** ${projectInfo.hasBuildFile}
**Build Tool:** ${buildTool} (DO NOT CHANGE THIS - use ${buildTool === 'Maven' ? 'pom.xml' : 'build.gradle'} ONLY)



${!projectInfo.hasBuildFile ? `⚠️ IMPORTANT: This project is MISSING its build file. Your implementation plan MUST include creating the build file as the FIRST file.` : ''}

**LLD Context:**
${lldContext.substring(0, 2000)}

**Tasks to Implement:**
${tasks.map(t => `- ${t.key}: ${t.summary}\n  ${t.description}`).join('\n\n')}

Generate a comprehensive implementation plan with ALL necessary files for a complete, compilable implementation.

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

Format as JSON:
{
    "context": "Brief summary of what we're implementing and key technical decisions",
    "files": [
        {
            "path": "${projectInfo.type === 'spring-boot' ? `${projectInfo.srcPath}/${projectInfo.basePackage?.replace(/\./g, '/')}/controller/PayrollController.java` : 'src/controllers/payroll.controller.ts'}",
            "type": "controller",
            "name": "PayrollController",
            "description": "REST endpoints for payroll operations"
        }
    ]
}`;

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

    return JSON.parse(jsonMatch[0]);
}

async function generateCodeFileFromTemplate(
    fileSpec: FileSpec,
    context: string,
    projectInfo: ProjectInfo,
    templateProvider: TemplateProvider,
    progress: vscode.Progress<{ increment?: number; message?: string }>
): Promise<string> {
    logger.info(`Generating ${fileSpec.path} from template (type: ${fileSpec.type})`);

    // For Spring Boot projects, use templates
    if (projectInfo.type === 'spring-boot') {
        return generateSpringBootFile(fileSpec, projectInfo, templateProvider);
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
                templateData = {
                    groupId: projectInfo.basePackage?.split('.').slice(0, 2).join('.') || 'com.company',
                    artifactId: fileSpec.name || 'app',
                    version: '0.0.1-SNAPSHOT',
                    name: fileSpec.name || 'Application',
                    description: fileSpec.description || 'Spring Boot Application',
                    javaVersion: '21',
                    springBootVersion: '3.4.1'
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
