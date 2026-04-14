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

let telemetryService: TelemetryService;

export function activate(context: vscode.ExtensionContext) {
    console.log('DevEx AI Assistant is now active!');

    // Initialize telemetry service
    telemetryService = new TelemetryService(context);

    // Register chat participant (@askcodesamurai)
    registerChatParticipant(context, telemetryService);

    // Check if Copilot is available
    checkCopilotAvailability();

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

    // Show welcome message on first activation
    showWelcomeMessage(context);

    // Check for updates periodically
    scheduleUpdateCheck(context);

    // Track activation
    telemetryService.trackEvent('extension.activated');
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
