import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { JiraService } from '../services/jiraService';
import { AIService } from '../services/aiService';
import { analyzeERDImage } from './analyzeERD';

interface DomainInfo {
    name: string;
    erdImagePath?: string;
    csvData?: string;
    entities: string[];
}

interface CreatedStory {
    domain: string;
    issueKey: string;
    openAPIPath?: string;
    springBootPath?: string;
    error?: string;
    timestamp?: number;
}

interface Checkpoint {
    parentIssueKey: string;
    basePackage: string;
    generateSpringBootNow: boolean;
    generateTests: boolean; // Auto-generate unit tests after code generation
    outputRootFolder?: string;
    completedDomains: CreatedStory[];
    timestamp: number;
}

// Helper function to get checkpoint file path
function getCheckpointPath(): string {
    const userHomeDir = os.homedir();
    const devexFolder = path.join(userHomeDir, '.devex', 'swift-ods');
    return path.join(devexFolder, 'checkpoint.json');
}

// Helper function to save checkpoint
function saveCheckpoint(checkpoint: Checkpoint): void {
    const checkpointPath = getCheckpointPath();
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    logger.info(`Checkpoint saved: ${checkpoint.completedDomains.length} domains completed`);
}

// Helper function to load checkpoint
function loadCheckpoint(): Checkpoint | null {
    const checkpointPath = getCheckpointPath();
    if (!fs.existsSync(checkpointPath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(checkpointPath, 'utf-8');
        const checkpoint = JSON.parse(data) as Checkpoint;
        logger.info(`Checkpoint loaded: ${checkpoint.completedDomains.length} domains already completed`);
        return checkpoint;
    } catch (error) {
        logger.error(`Failed to load checkpoint: ${error}`);
        return null;
    }
}

// Helper function to check if ERD has changed in last 2 days
function hasERDChangedRecently(erdPath: string | undefined): boolean {
    if (!erdPath || !fs.existsSync(erdPath)) {
        return true; // Assume changed if path missing
    }
    const stats = fs.statSync(erdPath);
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    return stats.mtimeMs > twoDaysAgo;
}

// Helper function to check if OpenAPI should be regenerated
function shouldRegenerateOpenAPI(domain: DomainInfo, openAPIPath: string, forceReuse: boolean = false): boolean {
    if (!fs.existsSync(openAPIPath)) {
        return true; // File doesn't exist, must generate
    }
    if (forceReuse) {
        logger.info(`Reusing existing OpenAPI for ${domain.name} (user requested reuse)`);
        return false; // User explicitly wants to reuse existing files
    }
    if (hasERDChangedRecently(domain.erdImagePath)) {
        logger.info(`ERD changed recently for ${domain.name}, will regenerate OpenAPI`);
        return true; // ERD changed in last 2 days
    }
    logger.info(`Reusing existing OpenAPI for ${domain.name} (ERD unchanged, file exists)`);
    return false; // Skip regeneration
}

/**
 * End-to-end workflow for domain-driven API generation:
 * 1. Analyze ERD images + CSV from datamodel folder
 * 2. Generate Jira stories for each domain
 * 3. Generate OpenAPI specs per domain
 * 4. Ready for Spring Boot code generation via "Implement Jira Task"
 */
export async function generateDomainDrivenAPIsCommand(): Promise<void> {
    try {
        // Step 1: Select the Swift_ODS_Datamodel folder
        const folderUris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Datamodel Folder (with ERD images and CSV)'
        });

        if (!folderUris || folderUris.length === 0) {
            return;
        }

        const datamodelFolder = folderUris[0].fsPath;
        logger.info(`Selected folder: ${datamodelFolder}`);

        // Declare variables outside withProgress for timeout callback access
        let parentIssueKey: string | undefined;
        let basePackage: string | undefined;
        let generateSpringBootNow: boolean = false;
        let generateTests: boolean = false;
        let outputRootFolder: string | undefined;
        let createdStories: CreatedStory[] = [];
        let projectKey: string | undefined;
        let domains: any[] = [];
        let remainingDomains: any[] = [];
        let jiraService: any;
        let jiraBaseUrl: string | undefined;
        let reuseExistingOpenAPI: boolean = false;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Domain-Driven APIs',
            cancellable: false
        }, async (progress) => {
            
            progress.report({ increment: 5, message: 'Reading folder contents...' });

            // Step 2: Find all PNG images and CSV file
            const files = fs.readdirSync(datamodelFolder);
            const pngFiles = files.filter(f => f.toLowerCase().endsWith('.png'));
            const csvFile = files.find(f => f.toLowerCase() === 'datamodel.csv');

            if (pngFiles.length === 0 && !csvFile) {
                throw new Error('No PNG files or Datamodel.csv found in folder');
            }

            logger.info(`Found ${pngFiles.length} PNG files and CSV: ${csvFile ? 'Yes' : 'No'}`);

            // Step 3: Parse CSV to get domain structure
            progress.report({ increment: 10, message: 'Parsing Datamodel.csv...' });
            
            domains = await parseDomains(datamodelFolder, pngFiles, csvFile);
            
            logger.info(`Identified ${domains.length} domains: ${domains.map(d => d.name).join(', ')}`);

            // Step 4: Get Jira configuration
            progress.report({ increment: 5, message: 'Connecting to Jira...' });
            
            const jiraConfig = vscode.workspace.getConfiguration('devex.jira');
            jiraBaseUrl = jiraConfig.get<string>('baseUrl');
            const jiraEmail = jiraConfig.get<string>('email');
            const jiraApiToken = jiraConfig.get<string>('apiToken');

            if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
                const configure = await vscode.window.showErrorMessage(
                    'Jira is not configured. Please configure Jira settings first.',
                    'Configure'
                );
                if (configure === 'Configure') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'devex.jira');
                }
                return;
            }

            jiraService = new JiraService(jiraBaseUrl, jiraEmail, jiraApiToken);
            const aiService = new AIService();

            // Step 4.5: Check for existing checkpoint
            const existingCheckpoint = loadCheckpoint();
            let resumeFromCheckpoint = false;

            if (existingCheckpoint && existingCheckpoint.completedDomains.length > 0) {
                const resume = await vscode.window.showInformationMessage(
                    `📋 **Found Previous Session**\n\n` +
                    `Completed: ${existingCheckpoint.completedDomains.length} domains\n` +
                    `Parent Epic: ${existingCheckpoint.parentIssueKey || 'None'}\n` +
                    `Package: ${existingCheckpoint.basePackage}\n\n` +
                    `Resume from checkpoint or start fresh?`,
                    'Resume',
                    'Start Fresh',
                    'Cancel'
                );

                if (resume === 'Cancel') {
                    return;
                }

                if (resume === 'Resume') {
                    resumeFromCheckpoint = true;
                    parentIssueKey = existingCheckpoint.parentIssueKey;
                    generateSpringBootNow = existingCheckpoint.generateSpringBootNow;
                    generateTests = existingCheckpoint.generateTests || false;
                    outputRootFolder = existingCheckpoint.outputRootFolder;
                    createdStories = existingCheckpoint.completedDomains;
                    
                    // Extract project key from parent or set from checkpoint
                    projectKey = parentIssueKey ? parentIssueKey.split('-')[0] : existingCheckpoint.parentIssueKey.split('-')[0];
                    
                    // Allow user to confirm or change the base package name
                    basePackage = await vscode.window.showInputBox({
                        prompt: 'Confirm or change base package name for Spring Boot projects',
                        placeHolder: 'com.company.project',
                        value: existingCheckpoint.basePackage, // Pre-fill with previous value
                        validateInput: (value) => {
                            if (!value || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
                                return 'Please enter a valid Java package name (e.g., com.company.project)';
                            }
                            return null;
                        }
                    });

                    if (!basePackage) {
                        return;
                    }
                    
                    logger.info(`Resuming from checkpoint: ${createdStories.length} domains already completed`);
                } else {
                    // Start fresh - delete checkpoint
                    const checkpointPath = getCheckpointPath();
                    if (fs.existsSync(checkpointPath)) {
                        fs.unlinkSync(checkpointPath);
                        logger.info('Checkpoint deleted, starting fresh');
                    }
                }
            }

            // Step 5: Ask user for parent Epic/Story (optional) - skip if resuming
            if (!resumeFromCheckpoint) {
                parentIssueKey = await vscode.window.showInputBox({
                    prompt: 'Enter parent Jira Epic or Story key (optional - press Enter to skip)',
                    placeHolder: 'SWIFT-74713 (optional)',
                    validateInput: (value) => {
                        if (value && !/^[A-Z]+-\d+$/.test(value)) {
                            return 'Please enter a valid Jira issue key (e.g., SWIFT-74713) or leave empty';
                        }
                        return null;
                    }
                });

                if (parentIssueKey === undefined) {
                    return;
                }

                // If no parent epic provided, ask for project key once
                if (!parentIssueKey || parentIssueKey.trim() === '') {
                    projectKey = await vscode.window.showInputBox({
                        prompt: 'Enter Jira Project Key (e.g., SWIFT)',
                        placeHolder: 'SWIFT',
                        validateInput: (value) => {
                            if (!value || !/^[A-Z]+$/.test(value)) {
                                return 'Please enter a valid Jira project key (uppercase letters only)';
                            }
                            return null;
                        }
                    });
                    
                    if (!projectKey) {
                        return;
                    }
                    logger.info(`Using project key: ${projectKey} for all domains`);
                } else {
                    // Extract project key from parent epic
                    projectKey = parentIssueKey.split('-')[0];
                    logger.info(`Using project key from parent epic: ${projectKey}`);
                }

                // Step 5.5: Ask for base package name for generated projects
                const suggestedPackage = projectKey ? `com.company.${projectKey.toLowerCase()}` : 'com.company.project';
                basePackage = await vscode.window.showInputBox({
                prompt: 'Enter base package name for generated Spring Boot projects',
                placeHolder: 'com.company.project',
                value: suggestedPackage,
                validateInput: (value) => {
                    if (!value || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
                        return 'Please enter a valid Java package name (e.g., com.company.project)';
                    }
                    return null;
                }
            });

            if (!basePackage) {
                return;
            }

            // Step 5.6: Ask where to generate Spring Boot projects
            const generateNowChoice = await vscode.window.showQuickPick([
                { 
                    label: '$(file-directory) Generate stories and OpenAPI only', 
                    value: 'stories-only',
                    description: 'Create Jira stories and OpenAPI specs. Generate Spring Boot code later via "Implement Jira Story"'
                },
                { 
                    label: '$(rocket) Generate everything now', 
                    value: 'generate-all',
                    description: 'Create stories, OpenAPI specs, AND Spring Boot projects immediately'
                }
            ], {
                placeHolder: 'Choose generation mode',
                title: 'Domain Generation Mode'
            });

            if (!generateNowChoice) {
                return;
            }

            generateSpringBootNow = generateNowChoice.value === 'generate-all';

            if (generateSpringBootNow) {
                // Ask if tests should be auto-generated
                const generateTestsChoice = await vscode.window.showQuickPick([
                    { 
                        label: '$(beaker) Generate unit tests (80%+ coverage)', 
                        value: true,
                        description: 'Auto-generate comprehensive unit tests after code generation. Recommended!',
                        detail: 'Uses AI to analyze code and generate JUnit 5 + Mockito tests'
                    },
                    { 
                        label: '$(x) Skip test generation', 
                        value: false,
                        description: 'Only generate Spring Boot code without tests'
                    }
                ], {
                    placeHolder: 'Generate unit tests automatically?',
                    title: 'Test Generation'
                });

                if (generateTestsChoice === undefined) {
                    return;
                }

                generateTests = generateTestsChoice.value;

                // Ask where to generate Spring Boot projects
                const folderUris = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select output folder for Spring Boot projects',
                    openLabel: 'Select Output Folder'
                });

                if (!folderUris || folderUris.length === 0) {
                    return;
                }

                outputRootFolder = folderUris[0].fsPath;
                logger.info(`Spring Boot projects will be generated to: ${outputRootFolder}`);
            }
            }

            // Step 5.5: Check for existing OpenAPI files and ask user preference
            const userHomeDir = os.homedir();
            const devexFolder = path.join(userHomeDir, '.devex', 'swift-ods');
            const openAPIFolder = path.join(devexFolder, 'openapi');
            
            if (fs.existsSync(openAPIFolder)) {
                const existingFiles = fs.readdirSync(openAPIFolder).filter(f => f.endsWith('-api.yaml'));
                
                if (existingFiles.length > 0) {
                    const reuseChoice = await vscode.window.showQuickPick([
                        { 
                            label: '$(sync) Reuse existing OpenAPI files', 
                            value: true,
                            description: `Found ${existingFiles.length} existing OpenAPI spec(s)`,
                            detail: 'Skip OpenAPI regeneration, only create missing files for new domains'
                        },
                        { 
                            label: '$(refresh) Regenerate all OpenAPI specs', 
                            value: false,
                            description: 'Generate fresh OpenAPI specs for all domains (takes ~3 hours for 17 domains)'
                        }
                    ], {
                        placeHolder: 'Existing OpenAPI files detected. What would you like to do?',
                        title: 'OpenAPI Generation Strategy'
                    });

                    if (reuseChoice === undefined) {
                        return;
                    }

                    reuseExistingOpenAPI = reuseChoice.value;
                    
                    if (reuseExistingOpenAPI) {
                        logger.info(`Will reuse ${existingFiles.length} existing OpenAPI files, only generating for new domains`);
                    } else {
                        logger.info('Will regenerate all OpenAPI specs from scratch');
                    }
                }
            }

            // Step 6: Generate stories for each domain
            progress.report({ increment: 10, message: 'Analyzing domains and generating stories...' });

            // Skip already completed domains if resuming
            const completedDomainNames = new Set(createdStories.map(s => s.domain));
            remainingDomains = domains.filter(d => !completedDomainNames.has(d.name));
            
            if (resumeFromCheckpoint) {
                logger.info(`Skipping ${completedDomainNames.size} already completed domains, processing ${remainingDomains.length} remaining`);
                vscode.window.showInformationMessage(`Resuming: ${completedDomainNames.size} domains done, ${remainingDomains.length} remaining`);
            }

            let progressIncrement = 60 / domains.length;

            for (const domain of remainingDomains) {
                progress.report({ 
                    increment: progressIncrement / 3, 
                    message: `Analyzing ${domain.name} domain...` 
                });

                // Analyze ERD image if exists
                let erdAnalysis = '';
                if (domain.erdImagePath) {
                    try {
                        erdAnalysis = await analyzeERDImage(domain.erdImagePath);
                        logger.info(`Successfully analyzed ERD for ${domain.name}`);
                    } catch (error: any) {
                        logger.warn(`Could not analyze ERD image for ${domain.name}: ${error.message}`);
                    }
                }

                // Combine ERD analysis with CSV data
                const fullContext = `# ${domain.name} Domain

## Entities
${domain.entities.join(', ')}

${domain.csvData ? `## Data Model (from CSV)\n${domain.csvData}` : ''}

${erdAnalysis ? `## ERD Analysis\n${erdAnalysis}` : ''}`;

                progress.report({ 
                    increment: progressIncrement / 3, 
                    message: `Creating Jira story for ${domain.name}...` 
                });

                // Create Jira story with complete LLD
                const storyTitle = `${domain.name} Domain - API Implementation`;
                const storyDescription = await generateStoryDescription(fullContext, domain);

                try {
                    const issueData: any = {
                        fields: {
                            project: {
                                key: projectKey!
                            },
                            summary: storyTitle,
                            description: storyDescription,
                            issuetype: {
                                name: 'Story'
                            },
                            labels: ['swift-ods', domain.name.toLowerCase(), 'auto-generated']
                        }
                    };

                    // Add parent link only if provided
                    if (parentIssueKey && parentIssueKey.trim() !== '') {
                        issueData.fields.parent = {
                            key: parentIssueKey
                        };
                    }

                    const createdIssue = await jiraService.createIssue(issueData);

                    logger.info(`Created Jira story: ${createdIssue.key} for ${domain.name}`);
                    const newStory: CreatedStory = { 
                        domain: domain.name, 
                        issueKey: createdIssue.key,
                        timestamp: Date.now()
                    };
                    createdStories.push(newStory);

                    // Generate or reuse OpenAPI spec for this domain
                    const userHomeDir = os.homedir();
                    const devexFolder = path.join(userHomeDir, '.devex', 'swift-ods');
                    const openAPIFolder = path.join(devexFolder, 'openapi');
                    if (!fs.existsSync(openAPIFolder)) {
                        fs.mkdirSync(openAPIFolder, { recursive: true });
                    }

                    const openAPIPath = path.join(openAPIFolder, `${domain.name.toLowerCase()}-api.yaml`);
                    
                    if (shouldRegenerateOpenAPI(domain, openAPIPath, reuseExistingOpenAPI)) {
                        progress.report({ 
                            increment: progressIncrement / 3, 
                            message: `Generating OpenAPI spec for ${domain.name}...` 
                        });

                        const openAPISpec = await aiService.generateOpenAPISpec(fullContext, {
                            serviceName: `${domain.name} API`,
                            version: '1.0.0',
                            format: 'yaml',
                            includeExamples: true,
                            includeSecurity: true
                        });

                        fs.writeFileSync(openAPIPath, openAPISpec, 'utf-8');
                        logger.info(`Saved OpenAPI spec to: ${openAPIPath}`);
                    } else {
                        progress.report({ 
                            increment: progressIncrement / 3, 
                            message: `Reusing existing OpenAPI for ${domain.name}...` 
                        });
                        logger.info(`Reusing existing OpenAPI spec: ${openAPIPath}`);
                    }
                    
                    createdStories[createdStories.length - 1].openAPIPath = openAPIPath;

                    // Save checkpoint after each successful domain
                    saveCheckpoint({
                        parentIssueKey: parentIssueKey || '',
                        basePackage: basePackage!,
                        generateSpringBootNow,
                        generateTests,
                        outputRootFolder,
                        completedDomains: createdStories,
                        timestamp: Date.now()
                    });

                    // Attach OpenAPI spec to Jira story
                    await jiraService.addComment(
                        createdIssue.key,
                        `**OpenAPI Specification Generated**\n\nLocation: \`${openAPIPath}\`\n\n${generateSpringBootNow ? 'Spring Boot code generation in progress...' : 'Use "DevEx: Implement Jira Story" command with this issue key to generate Spring Boot code.'}`
                    );

                    // Generate Spring Boot project if requested
                    if (generateSpringBootNow && outputRootFolder) {
                            progress.report({ 
                                increment: progressIncrement / 4, 
                                message: `Generating Spring Boot project for ${domain.name}...` 
                            });

                            try {
                                const { SpringBootGenerator } = await import('../services/springBootGenerator');
                                const { TemplateProvider } = await import('../services/templateProvider');
                                
                                // Get extension context for template path
                                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                                if (!workspaceFolder) {
                                    throw new Error('No workspace folder available');
                                }
                                
                                const extensionPath = vscode.extensions.getExtension('yourpublisher.devex-ai-assistant')?.extensionPath || workspaceFolder.uri.fsPath;
                                const templateProvider = new TemplateProvider(extensionPath);
                                
                                const domainPackage = `${basePackage}.${domain.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                                const projectName = `${projectKey!.toLowerCase()}-${domain.name.toLowerCase().replace(/\s+/g, '-')}`;
                                const projectFolder = path.join(outputRootFolder, projectName);

                                // Parse OpenAPI spec to get endpoints
                                const yaml = await import('js-yaml');
                                const openApiContent = fs.readFileSync(openAPIPath, 'utf-8');
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

                                const generator = new SpringBootGenerator(templateProvider);
                                await generator.generateProject(
                                    {
                                        targetDirectory: outputRootFolder,
                                        projectName,
                                        packageName: domainPackage,
                                        groupId: basePackage!,
                                        artifactId: projectName,
                                        javaVersion: '21',
                                        springBootVersion: '3.4.1',
                                        buildTool: 'maven'
                                    },
                                    endpoints
                                );

                                logger.info(`Generated Spring Boot project for ${domain.name} at: ${projectFolder}`);
                                createdStories[createdStories.length - 1].springBootPath = projectFolder;

                                // Generate unit tests if requested
                                if (generateTests) {
                                    progress.report({ 
                                        increment: progressIncrement / 5, 
                                        message: `Generating unit tests for ${domain.name}...` 
                                    });

                                    try {
                                        const { TestGenerationService } = await import('../services/testGenerationService');
                                        const testService = new TestGenerationService();
                                        
                                        logger.info(`Generating unit tests for ${domain.name} at: ${projectFolder}`);
                                        
                                        // Generate tests for entire project
                                        const testResults = await testService.generateTestsForProject(
                                            projectFolder,
                                            80 // Target 80% coverage
                                        );

                                        const successCount = testResults.length;
                                        const totalCount = testResults.length;
                                        const avgCoverage = testResults.reduce((sum, r) => sum + (r.coverageEstimate || 0), 0) / (totalCount || 1);

                                        logger.info(`Generated ${successCount}/${totalCount} test files for ${domain.name} (avg coverage: ${avgCoverage.toFixed(1)}%)`);
                                        
                                        // Add test generation info to Jira comment
                                        await jiraService.addComment(
                                            createdIssue.key,
                                            `**Spring Boot Project Generated**\n\nLocation: \`${projectFolder}\`\nPackage: \`${domainPackage}\`\n\n**Unit Tests Generated**\n✅ Test Files: ${successCount}/${totalCount}\n📊 Estimated Coverage: ~${avgCoverage.toFixed(0)}%\n\nProject is ready to compile and run tests!\n\`\`\`bash\ncd ${projectFolder}\nmvn test\n\`\`\``
                                        );

                                    } catch (testError: any) {
                                        logger.error(`Failed to generate tests for ${domain.name}: ${testError.message}`);
                                        // Don't fail the whole process, just log and continue
                                        await jiraService.addComment(
                                            createdIssue.key,
                                            `**Spring Boot Project Generated**\n\nLocation: \`${projectFolder}\`\nPackage: \`${domainPackage}\`\n\n⚠️ Test generation failed: ${testError.message}\n\nYou can manually generate tests using:\n\`DevEx: Generate Unit Tests for Entire Project\``
                                        );
                                    }
                                } else {
                                    // Add comment without test info
                                    await jiraService.addComment(
                                        createdIssue.key,
                                        `**Spring Boot Project Generated**\n\nLocation: \`${projectFolder}\`\nPackage: \`${domainPackage}\`\n\nProject is ready to compile and run!`
                                    );
                                }
                            } catch (error: any) {
                                logger.error(`Failed to generate Spring Boot project for ${domain.name}: ${error.message}`);
                                vscode.window.showErrorMessage(`Failed to generate Spring Boot for ${domain.name}: ${error.message}`);
                            }
                        }

                } catch (error: any) {
                    const errorMsg = `Failed to create story for ${domain.name}: ${error.message}`;
                    logger.error(errorMsg);
                    vscode.window.showErrorMessage(errorMsg);
                    
                    // Add to failed list for summary
                    createdStories.push({ 
                        domain: domain.name, 
                        issueKey: 'FAILED', 
                        error: error.message 
                    });
                }
            }

            progress.report({ increment: 100, message: 'Complete!' });
        });

        // Show summary after progress dismisses
        setTimeout(async () => {
            // Step 7: Show summary
            const successCount = createdStories.filter(s => s.issueKey !== 'FAILED').length;
            const failureCount = createdStories.filter(s => s.issueKey === 'FAILED').length;

            // Delete checkpoint on successful completion
            if (successCount > 0 && remainingDomains.length === 0) {
                const checkpointPath = getCheckpointPath();
                if (fs.existsSync(checkpointPath)) {
                    fs.unlinkSync(checkpointPath);
                    logger.info('Checkpoint deleted after successful completion');
                }
            }
            
            if (successCount === 0) {
                vscode.window.showErrorMessage(
                    `❌ **No Stories Created**\n\n` +
                    `All ${failureCount} domains failed. Check:\n` +
                    `1. Jira credentials are correct (Settings > DevEx > Jira)\n` +
                    `2. Project key exists in Jira\n` +
                    `3. You have permission to create stories\n` +
                    `4. Parent epic exists (if provided)\n\n` +
                    `See OUTPUT panel for detailed errors.`
                );
                return;
            }

            const summaryMessage = `${successCount === domains.length ? '✅' : '⚠️'} **Domain-Driven API Generation ${successCount === domains.length ? 'Complete' : 'Partially Complete'}**\n\n` +
                `**Created ${successCount} of ${domains.length} Jira Stories:**\n\n` +
                createdStories.filter(s => s.issueKey !== 'FAILED').map(s => 
                    `• **${s.issueKey}** - ${s.domain} Domain\n` +
                    `  OpenAPI: ${s.openAPIPath ? '✅' : '❌'}\n` +
                    `  Spring Boot: ${s.springBootPath ? '✅ ' + s.springBootPath : generateSpringBootNow ? '❌ Failed' : 'Not generated'}`
                ).join('\n') +
                (failureCount > 0 ? `\n\n**Failed Domains (${failureCount}):**\n` + 
                    createdStories.filter(s => s.issueKey === 'FAILED').map(s =>
                        `• ❌ ${s.domain}: ${s.error}`
                    ).join('\n')
                : '') +
                `\n\n**Package Name:** ${basePackage}\n` +
                `${generateSpringBootNow ? `**Output Folder:** ${outputRootFolder}\n` : ''}` +
                `\n**Next Steps:**\n` +
                (generateSpringBootNow 
                    ? `1. Review generated Spring Boot projects\n2. Compile and test: cd {project-folder} && ./mvnw spring-boot:run\n3. Commit and create GitHub PR`
                    : `1. Review stories in Jira\n2. Run "DevEx: Implement Jira Story" for each issue key\n3. Review generated Spring Boot code\n4. Create GitHub PR with all changes`);

            const action = await vscode.window.showInformationMessage(
                summaryMessage,
                'Open Summary File',
                ...(generateSpringBootNow && createdStories.some(s => s.springBootPath) ? ['Open First Project'] : ['Implement First Story'])
            );

            if (action === 'Open Summary File') {
                // Create summary markdown file in user home directory
                const userHomeDir = os.homedir();
                const devexFolder = path.join(userHomeDir, '.devex', 'swift-ods');
                const openAPIFolder = path.join(devexFolder, 'openapi');
                if (!fs.existsSync(devexFolder)) {
                    fs.mkdirSync(devexFolder, { recursive: true });
                }
                const summaryPath = path.join(devexFolder, 'DOMAIN_GENERATION_SUMMARY.md');
                const summaryContent = `# Domain-Driven API Generation Summary

**Generated:** ${new Date().toLocaleString()}
**Parent Epic:** ${parentIssueKey}
**Base Package:** ${basePackage}
${generateSpringBootNow ? `**Output Folder:** ${outputRootFolder}` : ''}

## Created Stories

${createdStories.map(s => `### ${s.issueKey} - ${s.domain} Domain

- **OpenAPI Spec:** ${s.openAPIPath ? `\`${s.openAPIPath}\`` : 'Not generated'}
- **Spring Boot Project:** ${s.springBootPath ? `\`${s.springBootPath}\`` : generateSpringBootNow ? 'Failed to generate' : 'Not generated (run Implement Jira Story)'}
- **Package Name:** \`${basePackage}.${s.domain.toLowerCase().replace(/[^a-z0-9]/g, '')}\`
- **Jira Link:** ${jiraBaseUrl}/browse/${s.issueKey}
`).join('\n')}

## Implementation Steps

${generateSpringBootNow ? `
### Spring Boot Projects Generated

All projects have been generated to \`${outputRootFolder}\`.

**To run a project:**
\`\`\`bash
cd ${outputRootFolder}/{domain-name}
./mvnw spring-boot:run
\`\`\`

**Access Swagger UI:** http://localhost:8080/swagger-ui.html
**Access H2 Console:** http://localhost:8080/h2-console

### Next Steps
1. Test each Spring Boot project
2. Customize business logic as needed
3. Commit all projects to Git
4. Create GitHub PR with reference to ${parentIssueKey}
` : `
### Generate Spring Boot Code

For each story, run: \`DevEx: Implement Jira Story\`

1. **Review Each Story:**
   - Open each story in Jira to review requirements
   - Verify entity schemas and API endpoints

2. **Generate Spring Boot Code:**
   - For each story, run: \`DevEx: Implement Jira Story\`
   - Enter the issue key (e.g., \`${createdStories[0]?.issueKey}\`)
   - Choose output location
   - Review generated code
   - Test compilation

3. **Create GitHub PR:**
   - Commit all generated code
   - Create PR with reference to parent epic: ${parentIssueKey}
   - Link all story keys in PR description
`}

## Generated Artifacts

- **OpenAPI Specs:** \`${openAPIFolder}/*.yaml\`
${generateSpringBootNow ? `- **Spring Boot Projects:** \`${outputRootFolder}/*\`` : '- **Spring Boot Projects:** Generate via Implement Jira Story command'}
- **Summary:** \`${devexFolder}/DOMAIN_GENERATION_SUMMARY.md\`
`;
                fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
                const doc = await vscode.workspace.openTextDocument(summaryPath);
                await vscode.window.showTextDocument(doc);
            } else if (action === 'Open First Project' && createdStories.length > 0 && createdStories[0].springBootPath) {
                // Open the first generated Spring Boot project
                const projectUri = vscode.Uri.file(createdStories[0].springBootPath);
                await vscode.commands.executeCommand('vscode.openFolder', projectUri, { forceNewWindow: true });
            } else if (action === 'Implement First Story' && createdStories.length > 0) {
                await vscode.commands.executeCommand('devex.implementJiraStory', createdStories[0].issueKey);
            }
        }, 100); // Small delay to let progress notification dismiss

    } catch (error: any) {
        logger.error(`Failed to generate domain-driven APIs: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to generate domains: ${error.message}`);
    }
}

async function parseDomains(
    folderPath: string, 
    pngFiles: string[], 
    csvFileName?: string
): Promise<DomainInfo[]> {
    const domains: Map<string, DomainInfo> = new Map();

    // Parse CSV if exists
    if (csvFileName) {
        const csvPath = path.join(folderPath, csvFileName);
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n');

        let currentPage = '';
        let currentPageEntities: string[] = [];
        let currentPageData: string[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Parse CSV line - assuming format from Lucidchart export
            const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
            
            // Column indices (adjust based on actual CSV structure)
            const pageIdIndex = 3; // "Page ID" column
            const shapeLibIndex = 2; // "Shape Library" column
            const nameIndex = 1; // "Name" column

            if (columns.length > pageIdIndex) {
                const pageName = columns[pageIdIndex];
                const shapeName = columns[shapeLibIndex] || '';
                const entityName = columns[nameIndex];

                if (pageName && pageName !== currentPage) {
                    // Save previous page
                    if (currentPage && currentPageEntities.length > 0) {
                        const domainName = currentPage.charAt(0).toUpperCase() + currentPage.slice(1);
                        domains.set(domainName, {
                            name: domainName,
                            entities: currentPageEntities,
                            csvData: currentPageData.join('\n')
                        });
                    }

                    // Start new page
                    currentPage = pageName;
                    currentPageEntities = [];
                    currentPageData = [];
                }

                // Collect entities (shapes that are "Entity" type)
                if (shapeName.toLowerCase().includes('entity') && entityName) {
                    currentPageEntities.push(entityName);
                }

                currentPageData.push(line);
            }
        }

        // Save last page
        if (currentPage && currentPageEntities.length > 0) {
            const domainName = currentPage.charAt(0).toUpperCase() + currentPage.slice(1);
            domains.set(domainName, {
                name: domainName,
                entities: currentPageEntities,
                csvData: currentPageData.join('\n')
            });
        }
    }

    // Map PNG files to domains (by filename)
    for (const pngFile of pngFiles) {
        const domainName = path.basename(pngFile, '.png')
            .replace(/[-_]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

        if (domains.has(domainName)) {
            domains.get(domainName)!.erdImagePath = path.join(folderPath, pngFile);
        } else {
            // Create domain from PNG filename
            domains.set(domainName, {
                name: domainName,
                erdImagePath: path.join(folderPath, pngFile),
                entities: []
            });
        }
    }

    return Array.from(domains.values());
}

async function generateStoryDescription(context: string, domain: DomainInfo): Promise<string> {
    return `# ${domain.name} Domain - Implementation Requirements

## Overview
Implement the ${domain.name} domain API with database schema, OpenAPI specification, and Spring Boot REST API.

## Entities
${domain.entities.length > 0 ? domain.entities.map(e => `- ${e}`).join('\n') : 'See data model details below'}

## Data Model

${context}

## Technical Requirements

### 1. Database Schema (Flyway)
- Create Flyway migration scripts for all entities
- Include primary keys, foreign keys, indexes
- Add constraints (NOT NULL, UNIQUE, CHECK)
- Include audit fields (createdAt, updatedAt, createdBy, updatedBy)

### 2. OpenAPI 3.0 Specification
- Complete API contract with all CRUD endpoints
- Request/response schemas matching entity definitions
- OData query support ($filter, $orderby, $select, $expand)
- Pagination parameters (offset, limit)
- Security definitions (JWT Bearer)
- Error response schemas (400, 401, 403, 404, 500)

### 3. Spring Boot Implementation
- **Entities:** JPA entities with proper annotations (@Entity, @Table, @Column)
- **Repositories:** Spring Data JPA repositories with custom query methods
- **Services:** Business logic layer with CRUD operations
- **Controllers:** REST controllers with full CRUD endpoints
- **DTOs:** Request and Response DTOs with validation
- **Exception Handling:** Global exception handler
- **Configuration:** Database, security, OpenAPI configuration

### 4. API Features
- **CRUD Operations:** Create, Read, Update, Delete for all entities
- **Pagination:** Page-based and offset-based pagination
- **Sorting:** Sort by any field, ascending/descending
- **Filtering:** Filter by any field with operators (eq, ne, gt, lt, like)
- **Field Selection:** Select specific fields to return
- **Validation:** Request validation with meaningful error messages

## Acceptance Criteria
- [ ] All entities have corresponding database tables (Flyway migrations)
- [ ] OpenAPI specification is complete and accurate
- [ ] All CRUD endpoints are implemented and functional
- [ ] Code compiles without errors
- [ ] Basic unit tests pass
- [ ] API documentation is accessible via Swagger UI
- [ ] Security is configured (authentication ready)

## Implementation Notes
- Use Spring Boot 3.4.1 with Java 21
- Use H2 database for development
- Include Lombok for boilerplate reduction
- Follow RESTful best practices
- Use proper HTTP status codes
- Include logging with SLF4J

---
**Generated by DevEx AI Assistant**
`;
}
