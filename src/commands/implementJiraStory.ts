import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';

export async function implementJiraStory(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();

    try {
        // Step 1: Get Jira configuration
        const config = vscode.workspace.getConfiguration('devex');
        const jiraBaseUrl = config.get<string>('jiraBaseUrl');
        const jiraEmail = config.get<string>('jiraEmail');
        const jiraApiToken = config.get<string>('jiraApiToken');

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

            // Step 4: Determine if it's a story or subtask
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

            // Step 5: Detect project type and structure
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const projectInfo = await detectProjectStructure(workspaceFolder.uri.fsPath);

            progress.report({ increment: 10, message: 'Analyzing tasks...' });

            // Step 6: Analyze tasks and generate implementation plan
            const implementationPlan = await generateImplementationPlan(
                tasksToImplement,
                projectInfo,
                issue.description,
                progress
            );

            progress.report({ increment: 10, message: 'Showing preview...' });

            // Step 7: Show preview and get confirmation
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

            // Step 8: Generate code files
            const generatedFiles: string[] = [];

            for (const fileSpec of implementationPlan.files) {
                const fileContent = await generateCodeFile(
                    fileSpec,
                    implementationPlan.context,
                    projectInfo,
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

            progress.report({ increment: 10, message: 'Updating Jira...' });

            // Step 9: Update Jira with progress
            const comment = `**Implementation Started**\n\n**Generated Files:**\n${generatedFiles.map(f => `- ${f}`).join('\n')}\n\n_Generated by DevEx AI Assistant_`;

            await jiraService.addComment(selectedIssueKey!, comment);

            // Try to transition to In Progress
            try {
                await jiraService.transitionIssue(selectedIssueKey!, 'In Progress');
            } catch (transitionError) {
                console.log('Could not transition issue (may already be in progress):', transitionError);
            }

            progress.report({ increment: 10, message: 'Complete!' });

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('jira.story.implemented', {
                duration: duration.toString(),
                taskCount: tasksToImplement.length.toString(),
                fileCount: generatedFiles.length.toString(),
                projectType: projectInfo.type
            });

            // Step 10: Show success and open first file
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
            language: 'java'
        };
    }

    // Check for build.gradle (Gradle Spring Boot)
    if (fs.existsSync(path.join(workspacePath, 'build.gradle')) || 
        fs.existsSync(path.join(workspacePath, 'build.gradle.kts'))) {
        return {
            type: 'spring-boot',
            basePackage: 'com.company.app',
            srcPath: 'src/main/java',
            language: 'java'
        };
    }

    // Check for package.json (Node.js)
    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
        return {
            type: 'nodejs',
            srcPath: 'src',
            language: 'typescript'
        };
    }

    // Check for requirements.txt or setup.py (Python)
    if (fs.existsSync(path.join(workspacePath, 'requirements.txt')) ||
        fs.existsSync(path.join(workspacePath, 'setup.py'))) {
        return {
            type: 'python',
            srcPath: 'src',
            language: 'python'
        };
    }

    // Check for .csproj (.NET)
    const csprojFiles = fs.readdirSync(workspacePath).filter(f => f.endsWith('.csproj'));
    if (csprojFiles.length > 0) {
        return {
            type: 'dotnet',
            srcPath: '.',
            language: 'csharp'
        };
    }

    return {
        type: 'unknown',
        srcPath: 'src',
        language: 'java'
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
    type: 'controller' | 'service' | 'repository' | 'entity' | 'dto' | 'config' | 'migration' | 'test';
    name: string;
    description: string;
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

    const prompt = `You are a senior software engineer creating an implementation plan for Jira tasks.

**Project Type:** ${projectInfo.type}
**Language:** ${projectInfo.language}
${projectInfo.basePackage ? `**Base Package:** ${projectInfo.basePackage}` : ''}

**LLD Context:**
${lldContext.substring(0, 2000)}

**Tasks to Implement:**
${tasks.map(t => `- ${t.key}: ${t.summary}\n  ${t.description}`).join('\n\n')}

Generate a comprehensive implementation plan with files to create.

${projectInfo.type === 'spring-boot' ? `
For Spring Boot, generate:
- Controller classes (REST endpoints with @RestController, @RequestMapping)
- Service classes (@Service with business logic)
- Repository interfaces (@Repository with Spring Data JPA)
- Entity classes (@Entity with JPA annotations)
- DTO classes for request/response
- Configuration classes if needed (@Configuration)
- Flyway migration SQL if database changes
- Test classes (@SpringBootTest)
` : ''}

${projectInfo.type === 'nodejs' ? `
For Node.js, generate:
- Route handlers (Express routes)
- Service classes (business logic)
- Database models (Mongoose/TypeORM)
- DTOs/interfaces (TypeScript types)
- Middleware if needed
- Test files (Jest/Mocha)
` : ''}

${projectInfo.type === 'python' ? `
For Python, generate:
- API routes (FastAPI/Flask)
- Service modules (business logic)
- Database models (SQLAlchemy/Pydantic)
- Schemas (request/response models)
- Test files (pytest)
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

async function generateCodeFile(
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

    const prompt = `Generate production-ready ${projectInfo.language} code for this file.

**Context:** ${context}

**File:** ${fileSpec.path}
**Type:** ${fileSpec.type}
**Name:** ${fileSpec.name}
**Description:** ${fileSpec.description}

**Project Type:** ${projectInfo.type}
${projectInfo.basePackage ? `**Package:** ${projectInfo.basePackage}` : ''}

Requirements:
- Follow ${projectInfo.language} best practices and conventions
- Include proper imports
- Add comprehensive documentation (JavaDoc/JSDoc/docstrings)
- Include error handling
- Add TODO comments for business logic that needs customization
- Follow SOLID principles
${projectInfo.type === 'spring-boot' ? '- Use Spring Boot annotations (@RestController, @Service, @Repository, @Entity)' : ''}
${projectInfo.type === 'spring-boot' ? '- Include validation annotations (@Valid, @NotNull, etc.)' : ''}
${fileSpec.type === 'test' ? '- Include sample test cases with given-when-then structure' : ''}
${fileSpec.type === 'migration' ? '- Use Flyway naming convention (V001__description.sql)' : ''}

Generate ONLY the code, no explanations or markdown.`;

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
