import * as vscode from 'vscode';
import { generateSpringBootProjectCommand } from './commands/generateSpringBootProject';
import { summarizeLLDCommand } from './commands/summarizeLLD';
import { reviewLLDCommand } from './commands/reviewLLD';
import { reviewCodeCommand } from './commands/reviewCode';
import { parseOpenAPICommand } from './commands/parseOpenAPI';
import { generateOpenAPISpecCommand } from './commands/generateOpenAPISpec';
import { insertDeploymentTemplateCommand } from './commands/insertDeploymentTemplate';
import { addEndpointCommand } from './commands/addEndpoint';
import { viewDashboardCommand } from './commands/viewDashboard';
import { validateLLDAgainstJiraCommand } from './commands/validateLLDAgainstJira';
import { generateLLDFromRequirementsCommand } from './commands/generateLLDFromRequirements';
import { fetchMyJiraTicketsCommand } from './commands/fetchMyJiraTickets';
import { analyzeJiraTicketCommand } from './commands/analyzeJiraTicket';
import { addJiraCommentCommand } from './commands/addJiraComment';
import { generateKDD } from './commands/generateKDD';
import { generateRCA } from './commands/generateRCA';
import { createJiraStoryFromLLD } from './commands/createJiraStoryFromLLD';
import { implementJiraStory } from './commands/implementJiraStory';
import { completeJiraStory } from './commands/completeJiraStory';
import { resumeJiraStoryCompletion } from './commands/resumeJiraStoryCompletion';
import { convertMarkdownCommand } from './commands/convertMarkdown';
import { analyzeERDCommand } from './commands/analyzeERD';
import { generateDomainDrivenAPIsCommand } from './commands/generateDomainDrivenAPIs';
import { generateUnitTestsCommand, generateTestsForProjectCommand } from './commands/generateUnitTests';
import { validateGeneratedCode } from './commands/validateGeneratedCode';
import { generateCALMArchitectureCommand } from './commands/generateCALMArchitecture';
import { TelemetryService } from './services/telemetryService';
import { checkForUpdatesCommand } from './commands/checkForUpdates';
import { registerChatParticipant } from './chatParticipant';
import { registerDevExTools } from './tools/devexToolsRegistration';
import { verifyToolRegistration } from './commands/diagnosticTools';
import { generateAgentCommand } from './commands/generateAgent';
import { generateSkillCommand } from './commands/generateSkill';
import { manageDeployedAgentsCommand } from './commands/manageDeployedAgents';
import { transcribeKTSessionsCommand } from './commands/transcribeKTSessions';
import { structureKTTranscriptsCommand } from './commands/structureKTTranscripts';
import * as path from 'path';
import * as fs from 'fs';

let telemetryService: TelemetryService;

export async function activate(context: vscode.ExtensionContext) {
    console.log('DevEx AI Assistant is now active!');

    // Initialize telemetry service
    telemetryService = new TelemetryService(context);

    // Register chat participant (@askcodesamurai)
    registerChatParticipant(context, telemetryService);

    // Register Language Model Tools for AI assistants
    registerDevExTools(context);

    // Check if Copilot is available
    checkCopilotAvailability();

    // Auto-initialize Code Samurai agent and workspace settings
    await initializeCodeSamuraiAgent(context);

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateSpringBootProject', () => 
            generateSpringBootProjectCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.summarizeLLD', (fileUri?: vscode.Uri) => 
            summarizeLLDCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.reviewLLD', (fileUri?: vscode.Uri) => 
            reviewLLDCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.parseOpenAPI', (fileUri?: vscode.Uri) => 
            parseOpenAPICommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateOpenAPISpec', (fileUri?: vscode.Uri) => 
            generateOpenAPISpecCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.insertDeploymentTemplate', () => 
            insertDeploymentTemplateCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.addEndpoint', () => 
            addEndpointCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.viewDashboard', () => 
            viewDashboardCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.checkForUpdates', () => 
            checkForUpdatesCommand(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.reviewCode', (folderUri?: vscode.Uri) => 
            reviewCodeCommand(context, telemetryService, folderUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.validateLLDAgainstJira', (fileUri?: vscode.Uri) => 
            validateLLDAgainstJiraCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateLLDFromRequirements', (fileUri?: vscode.Uri) => 
            generateLLDFromRequirementsCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.fetchMyJiraTickets', () => 
            fetchMyJiraTicketsCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.analyzeJiraTicket', (issueKey?: string) => 
            analyzeJiraTicketCommand(context, telemetryService, issueKey)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.addJiraComment', (issueKey?: string) => 
            addJiraCommentCommand(context, telemetryService, issueKey)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateKDD', () => 
            generateKDD(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateRCA', () => 
            generateRCA(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateCALMArchitecture', (issueKey?: string) => 
            generateCALMArchitectureCommand(context, telemetryService, issueKey)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.createJiraStoryFromLLD', (fileUri?: vscode.Uri) => 
            createJiraStoryFromLLD(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.implementJiraStory', (issueKey?: string) => 
            implementJiraStory(context, telemetryService, issueKey)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.completeJiraStory', (issueKey?: string) => 
            completeJiraStory(context, telemetryService, issueKey)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.resumeJiraStoryCompletion', () => 
            resumeJiraStoryCompletion(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.convertMarkdown', (fileUri?: vscode.Uri) => 
            convertMarkdownCommand(context, telemetryService, fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.analyzeERD', (fileUri?: vscode.Uri) => 
            analyzeERDCommand(fileUri)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateDomainDrivenAPIs', () => 
            generateDomainDrivenAPIsCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateUnitTests', () => 
            generateUnitTestsCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateTestsForProject', () => 
            generateTestsForProjectCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.validateGeneratedCode', () => 
            validateGeneratedCode(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.verifyToolRegistration', () => 
            verifyToolRegistration(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateAgent', () =>
            generateAgentCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.generateSkill', () =>
            generateSkillCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.manageDeployedAgents', () =>
            manageDeployedAgentsCommand(context, telemetryService)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.transcribeKTSessions', () =>
            transcribeKTSessionsCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devex.structureKTTranscripts', () =>
            structureKTTranscriptsCommand()
        )
    );

    // Show welcome message on first activation
    showWelcomeMessage(context);

    // Check for updates periodically
    scheduleUpdateCheck(context);

    // Track activation
    telemetryService.trackEvent('extension.activated');
}

/**
 * Auto-initialize Code Samurai agent in the workspace.
 * Creates .github/agents/code-samurai.agent.md if it doesn't exist.
 * Also ensures workspace settings have the required Copilot setting.
 */
async function initializeCodeSamuraiAgent(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.log('No workspace folder found, skipping Code Samurai initialization');
        return;
    }

    try {
        const workspacePath = workspaceFolder.uri.fsPath;
        
        // 1. Ensure .github/agents/ directory exists
        const agentsDir = path.join(workspacePath, '.github', 'agents');
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
            console.log('Created .github/agents/ directory');
        }

        // 2. Create code-samurai.agent.md if it doesn't exist
        const agentFilePath = path.join(agentsDir, 'code-samurai.agent.md');
        if (!fs.existsSync(agentFilePath)) {
            // Read template from extension
            const templatePath = path.join(context.extensionPath, 'templates', 'agents', 'code-samurai.agent.md');
            
            if (fs.existsSync(templatePath)) {
                const templateContent = fs.readFileSync(templatePath, 'utf8');
                fs.writeFileSync(agentFilePath, templateContent, 'utf8');
                console.log('✅ Code Samurai agent initialized at .github/agents/code-samurai.agent.md');
            } else {
                console.warn('Code Samurai template not found in extension');
            }
        } else {
            console.log('Code Samurai agent already exists, skipping');
        }

        // 3. Ensure .vscode/settings.json has the required Copilot setting
        const vscodeDirPath = path.join(workspacePath, '.vscode');
        const settingsPath = path.join(vscodeDirPath, 'settings.json');
        
        if (!fs.existsSync(vscodeDirPath)) {
            fs.mkdirSync(vscodeDirPath, { recursive: true });
        }

        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
            try {
                const settingsContent = fs.readFileSync(settingsPath, 'utf8');
                settings = JSON.parse(settingsContent);
            } catch (error) {
                console.error('Error reading settings.json:', error);
            }
        }

        // Add the required setting if not present
        if (!settings['github.copilot.chat.useProjectTemplates']) {
            settings['github.copilot.chat.useProjectTemplates'] = true;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
            console.log('✅ Added Copilot project templates setting to workspace');
        }

    } catch (error) {
        console.error('Error initializing Code Samurai agent:', error);
        // Don't show error to user - silent initialization
    }
}

async function checkCopilotAvailability() {
    try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models && models.length > 0) {
            console.log('GitHub Copilot is available');
        } else {
            vscode.window.showWarningMessage(
                'GitHub Copilot not detected. Some AI features may not work. Please ensure you have Copilot installed and activated.'
            );
        }
    } catch (error) {
        console.error('Error checking Copilot availability:', error);
    }
}

function showWelcomeMessage(context: vscode.ExtensionContext) {
    const hasSeenWelcome = context.globalState.get<boolean>('devex.hasSeenWelcome');
    
    if (!hasSeenWelcome) {
        const message = 'Welcome to DevEx AI Assistant! 🚀 Generate Spring Boot projects from LLD and OpenAPI specs.';
        vscode.window.showInformationMessage(
            message,
            'Get Started',
            'View Dashboard'
        ).then(selection => {
            if (selection === 'Get Started') {
                vscode.commands.executeCommand('devex.generateSpringBootProject');
            } else if (selection === 'View Dashboard') {
                vscode.commands.executeCommand('devex.viewDashboard');
            }
        });
        
        context.globalState.update('devex.hasSeenWelcome', true);
    }
}

function scheduleUpdateCheck(context: vscode.ExtensionContext) {
    const lastCheck = context.globalState.get<number>('devex.lastUpdateCheck', 0);
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    if (lastCheck < oneDayAgo) {
        // Check for updates once per day
        setTimeout(() => {
            vscode.commands.executeCommand('devex.checkForUpdates');
            context.globalState.update('devex.lastUpdateCheck', Date.now());
        }, 5000); // Wait 5 seconds after activation
    }
}

export function deactivate() {
    console.log('DevEx AI Assistant is now deactivated');
}
