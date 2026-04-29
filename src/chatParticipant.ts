import * as vscode from 'vscode';
import { JiraService } from './services/jiraService';
import { TelemetryService } from './services/telemetryService';
import { logger } from './utils/logger';

/**
 * Chat participant for DevEx AI Assistant
 * Enables @askcodesamurai in Copilot Chat
 */
export function registerChatParticipant(context: vscode.ExtensionContext, telemetryService: TelemetryService) {
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        try {
            const prompt = request.prompt.toLowerCase().trim();
            
            // Parse command from prompt
            if (prompt.includes('fetch') && prompt.includes('ticket')) {
                await handleFetchTickets(stream, telemetryService);
            } else if (prompt.includes('analyze') || prompt.includes('summarize')) {
                await handleAnalyzeTicket(stream, request.prompt, telemetryService);
            } else if (prompt.includes('add comment') || prompt.includes('comment')) {
                await handleAddComment(stream, request.prompt, context, telemetryService);
            } else if (prompt.includes('work on') || prompt.includes('implement') || prompt.includes('start')) {
                await handleWorkOnTicket(stream, request.prompt, telemetryService, token);
            } else if (prompt.includes('kdd') || prompt.includes('design document') || prompt.includes('key design')) {
                await handleGenerateKDD(stream, request.prompt);
            } else {
                // Default help message
                stream.markdown(`# 👋 Ask CodeSamurai

I can help you with Jira ticket management! Here's what I can do:

## 📋 Available Commands

- **Fetch my tickets** - Get all your assigned Jira tickets
  - Example: \`@askcodesamurai fetch my tickets\`
  
- **Analyze ticket** - Generate AI analysis and TODO list
  - Example: \`@askcodesamurai analyze SWIFT-70243\`
  
- **Work on ticket** - Intelligent workflow orchestration 🚀
  - Example: \`@askcodesamurai work on SWIFT-70243\`
  - AI analyzes the ticket and suggests relevant tools (Spring Boot, OpenAPI, LLD, etc.)

- **Generate KDD** - Create Key Design Document 📋
  - Example: \`@askcodesamurai generate kdd for microservices migration\`
  - Conversational AI-driven design decision documentation
  
- **Add comment** - Post selected text as Jira comment
  - Example: Select text, then \`@askcodesamurai add comment to SWIFT-70243\`

## 💡 Tips

- Make sure you have Jira configured in VS Code settings
- Select text before adding comments
- Ticket keys should be in format: PROJ-123

What would you like to do?`);
            }

        } catch (error: any) {
            stream.markdown(`❌ Error: ${error.message}`);
            logger.error('Chat participant error', error);
        }
    };

    const participant = vscode.chat.createChatParticipant('askcodesamurai', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');

    context.subscriptions.push(participant);
    logger.info('Chat participant @askcodesamurai registered');
}

/**
 * Handle fetching Jira tickets
 */
async function handleFetchTickets(
    stream: vscode.ChatResponseStream,
    telemetryService: TelemetryService
): Promise<void> {
    stream.progress('Fetching your Jira tickets...');
    
    const jiraService = new JiraService();
    const issues = await jiraService.fetchMyIssues(50);

    if (issues.length === 0) {
        stream.markdown('No Jira tickets assigned to you.');
        return;
    }

    stream.markdown(`# 📋 Your Jira Tickets (${issues.length})\n\n`);

    for (const issue of issues) {
        const statusIcon = getStatusIcon(issue.status);
        const priorityIcon = getPriorityIcon(issue.priority);
        
        stream.markdown(`## ${statusIcon} ${issue.key}: ${issue.summary}\n`);
        stream.markdown(`**Status:** ${issue.status} | **Priority:** ${priorityIcon} ${issue.priority}\n\n`);
    }

    stream.button({
        command: 'devex.fetchMyJiraTickets',
        title: 'Open in QuickPick'
    });

    telemetryService.trackEvent('chat.fetch.tickets', { count: issues.length });
}

/**
 * Handle analyzing a Jira ticket
 */
async function handleAnalyzeTicket(
    stream: vscode.ChatResponseStream,
    prompt: string,
    telemetryService: TelemetryService
): Promise<void> {
    // Extract ticket key from prompt
    const ticketMatch = prompt.match(/([A-Z]+-\d+)/i);
    
    if (!ticketMatch) {
        stream.markdown('❌ Please specify a ticket key (e.g., SWIFT-70243)');
        return;
    }

    const issueKey = ticketMatch[1].toUpperCase();
    stream.progress(`Analyzing ${issueKey}...`);

    // Trigger the analyze command
    await vscode.commands.executeCommand('devex.analyzeJiraTicket', issueKey);
    
    stream.markdown(`✅ Analysis for **${issueKey}** has been generated and opened in a new editor.`);
    
    telemetryService.trackEvent('chat.analyze.ticket', { issueKey });
}

/**
 * Handle adding a comment to Jira
 */
async function handleAddComment(
    stream: vscode.ChatResponseStream,
    prompt: string,
    chatContext: vscode.ChatContext,
    telemetryService: TelemetryService
): Promise<void> {
    // Get selected text from active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        stream.markdown('❌ Please select text in your editor first, then ask me to add it as a comment.');
        return;
    }

    const selectedText = editor.document.getText(editor.selection);

    // Extract ticket key from prompt
    const ticketMatch = prompt.match(/([A-Z]+-\d+)/i);
    
    if (!ticketMatch) {
        stream.markdown('❌ Please specify a ticket key (e.g., add comment to SWIFT-70243)');
        return;
    }

    const issueKey = ticketMatch[1].toUpperCase();
    stream.progress(`Adding comment to ${issueKey}...`);

    try {
        const jiraService = new JiraService();
        await jiraService.addComment(issueKey, selectedText);

        stream.markdown(`✅ Comment added to **${issueKey}**\n\n`);
        stream.markdown(`**Comment preview:**\n\`\`\`\n${selectedText.substring(0, 200)}${selectedText.length > 200 ? '...' : ''}\n\`\`\`\n\n`);
        
        stream.button({
            command: 'vscode.open',
            title: 'Open in Jira',
            arguments: [vscode.Uri.parse(`https://manulife-gwam.atlassian.net/browse/${issueKey}`)]
        });

        telemetryService.trackEvent('chat.add.comment', { issueKey, commentLength: selectedText.length });

    } catch (error: any) {
        stream.markdown(`❌ Failed to add comment: ${error.message}`);
        throw error;
    }
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('progress') || statusLower.includes('doing')) {
        return '🔵';
    } else if (statusLower.includes('done') || statusLower.includes('complete')) {
        return '✅';
    } else if (statusLower.includes('review')) {
        return '👀';
    } else {
        return '⚪';
    }
}

/**
 * Get priority icon
 */
function getPriorityIcon(priority: string): string {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('highest') || priorityLower.includes('critical')) {
        return '🔴';
    } else if (priorityLower.includes('high')) {
        return '🟠';
    } else if (priorityLower.includes('medium')) {
        return '🟡';
    } else {
        return '🟢';
    }
}

/**
 * Analyze workspace to detect existing project structure
 */
async function analyzeWorkspace(): Promise<{
    hasSpringBoot: boolean;
    hasOpenAPI: boolean;
    hasDeploymentConfig: boolean;
}> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return { hasSpringBoot: false, hasOpenAPI: false, hasDeploymentConfig: false };
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check for Spring Boot
    const pomFiles = await vscode.workspace.findFiles('**/pom.xml', '**/node_modules/**', 1);
    const gradleFiles = await vscode.workspace.findFiles('**/build.gradle', '**/node_modules/**', 1);
    const hasSpringBoot = pomFiles.length > 0 || gradleFiles.length > 0;

    // Check for OpenAPI
    const openApiFiles = await vscode.workspace.findFiles('**/{openapi,swagger}.{yaml,yml,json}', '**/node_modules/**', 1);
    const hasOpenAPI = openApiFiles.length > 0;

    // Check for deployment configs
    const dockerFiles = await vscode.workspace.findFiles('**/Dockerfile', '**/node_modules/**', 1);
    const k8sFiles = await vscode.workspace.findFiles('**/{deployment,service}.{yaml,yml}', '**/node_modules/**', 1);
    const ciFiles = await vscode.workspace.findFiles('**/.github/workflows/*.{yaml,yml}', null, 1);
    const hasDeploymentConfig = dockerFiles.length > 0 || k8sFiles.length > 0 || ciFiles.length > 0;

    return { hasSpringBoot, hasOpenAPI, hasDeploymentConfig };
}

/**
 * Handle "work on" command - Intelligent workflow orchestration
 */
async function handleWorkOnTicket(
    stream: vscode.ChatResponseStream,
    prompt: string,
    telemetryService: TelemetryService,
    token: vscode.CancellationToken
): Promise<void> {
    // Extract ticket key
    const ticketMatch = prompt.match(/([A-Z]+-\d+)/i);
    
    if (!ticketMatch) {
        stream.markdown('❌ Please specify a ticket key (e.g., work on SWIFT-70243)');
        return;
    }

    const issueKey = ticketMatch[1].toUpperCase();
    stream.progress(`Analyzing ${issueKey}...`);

    try {
        // Fetch ticket details
        const jiraService = new JiraService();
        const issue = await jiraService.fetchIssue(issueKey);

        if (!issue) {
            stream.markdown(`❌ Could not find ticket ${issueKey}`);
            return;
        }

        stream.markdown(`# 🎯 Working on ${issueKey}\n\n`);
        stream.markdown(`**${issue.summary}**\n\n`);

        // Scan workspace to understand existing project structure
        stream.progress('Scanning workspace...');
        const workspaceContext = await analyzeWorkspace();
        
        stream.markdown(`**Workspace Analysis:**\n`);
        if (workspaceContext.hasSpringBoot) {
            stream.markdown(`- ✅ Spring Boot project detected\n`);
        }
        if (workspaceContext.hasOpenAPI) {
            stream.markdown(`- ✅ OpenAPI specification found\n`);
        }
        if (workspaceContext.hasDeploymentConfig) {
            stream.markdown(`- ✅ Deployment templates exist\n`);
        }
        if (!workspaceContext.hasSpringBoot && !workspaceContext.hasOpenAPI && !workspaceContext.hasDeploymentConfig) {
            stream.markdown(`- 📦 New project workspace\n`);
        }
        stream.markdown('\n');

        // Analyze what needs to be done using AI
        const [aiModel] = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        if (!aiModel) {
            stream.markdown('❌ AI model not available. Please ensure GitHub Copilot is active.');
            return;
        }

        stream.progress('Understanding requirements...');

        const analysisPrompt = `Analyze this Jira ticket and determine what development tasks are needed:

Title: ${issue.summary}
Description: ${issue.description}
Type: ${issue.issueType}

Workspace Context:
- Has existing Spring Boot project: ${workspaceContext.hasSpringBoot ? 'YES' : 'NO'}
- Has existing OpenAPI spec: ${workspaceContext.hasOpenAPI ? 'YES' : 'NO'}
- Has deployment templates: ${workspaceContext.hasDeploymentConfig ? 'YES' : 'NO'}

Based on this ticket and workspace context, what needs to be implemented? Choose the most relevant action(s):

**For NEW projects (no existing code):**
1. Generate Spring Boot Project - If creating a new REST API from scratch
2. Generate OpenAPI Spec - If creating new API documentation
3. Generate LLD Document - If design documentation is needed
4. Setup Infrastructure - If deployment templates needed

**For EXISTING projects:**
5. Add REST Endpoint - If adding new endpoint to existing Spring Boot project
6. Add OpenAPI Endpoint - If adding endpoint to existing OpenAPI spec
7. Review Code - If reviewing/refactoring existing code
8. Update Infrastructure - If modifying existing deployment configs

9. Other - If none of the above apply

Respond with ONLY the number(s) of relevant actions, comma-separated (e.g., "5,6" for adding to existing or "1,2" for new project).`;

        const messages = [
            vscode.LanguageModelChatMessage.User(analysisPrompt)
        ];

        const aiResponse = await aiModel.sendRequest(messages, {}, token);
        let aiResult = '';
        for await (const fragment of aiResponse.text) {
            aiResult += fragment;
        }

        const actions = aiResult.trim().split(',').map(a => a.trim());

        stream.markdown(`## 🤖 AI Analysis\n\n`);

        // Map actions to commands
        const actionMap: { [key: string]: { title: string; command: string; context?: any } } = {
            '1': {
                title: '🚀 Generate Spring Boot Project',
                command: 'devex.generateSpringBootProject',
                context: { issueKey, summary: issue.summary, description: issue.description }
            },
            '2': {
                title: '📋 Generate OpenAPI Specification',
                command: 'devex.generateOpenAPISpec',
                context: { issueKey, summary: issue.summary }
            },
            '3': {
                title: '📝 Generate LLD Document',
                command: 'devex.generateLLDFromRequirements',
                context: { source: 'jira', issueKey }
            },
            '4': {
                title: '🐳 Setup Infrastructure Templates',
                command: 'devex.insertDeploymentTemplate',
                context: { issueKey }
            },
            '5': {
                title: '➕ Add REST Endpoint to Existing Project',
                command: 'devex.addEndpoint',
                context: { issueKey, summary: issue.summary, description: issue.description }
            },
            '6': {
                title: '📄 Add Endpoint to OpenAPI Spec',
                command: 'devex.parseOpenAPI',
                context: { issueKey }
            },
            '7': {
                title: '🔍 Review Code',
                command: 'devex.reviewCode'
            },
            '8': {
                title: '🔧 Update Infrastructure Templates',
                command: 'devex.insertDeploymentTemplate',
                context: { issueKey, mode: 'update' }
            }
        };

        if (actions.length === 1 && actions[0] === '9') {
            stream.markdown('This ticket requires manual implementation. I recommend:\n\n');
            stream.markdown(`1. Generate LLD document first\n`);
            stream.markdown(`2. Break down the work into smaller tasks\n\n`);
            
            stream.button({
                command: 'devex.generateLLDFromRequirements',
                title: '📝 Generate LLD',
                arguments: [{ source: 'jira', issueKey }]
            });
        } else {
            stream.markdown('**Recommended actions:**\n\n');

            for (const actionNum of actions) {
                const action = actionMap[actionNum];
                if (action) {
                    stream.markdown(`- ${action.title}\n`);
                }
            }

            stream.markdown('\n**Choose an action to proceed:**\n\n');

            // Add buttons for each action
            for (const actionNum of actions) {
                const action = actionMap[actionNum];
                if (action) {
                    stream.button({
                        command: action.command,
                        title: action.title,
                        arguments: action.context ? [action.context] : []
                    });
                }
            }
        }

        telemetryService.trackEvent('chat.work.on.ticket', { 
            issueKey, 
            actions: actions.join(','),
            issueType: issue.issueType 
        });

    } catch (error: any) {
        stream.markdown(`❌ Error: ${error.message}`);
        logger.error('Work on ticket error', error);
    }
}
/**
 * Handle KDD generation through chat
 */
async function handleGenerateKDD(
    stream: vscode.ChatResponseStream,
    prompt: string
): Promise<void> {
    try {
        stream.progress('Starting KDD generation...');

        // Extract problem statement from prompt
        const problemStatement = prompt
            .replace(/generate kdd|create kdd|kdd for|key design document/gi, '')
            .trim();

        if (problemStatement.length < 10) {
            stream.markdown(`# 📋 Generate Key Design Document

I'll help you create a comprehensive Key Design Document (KDD).

To get started, I need a problem statement. For example:
- "We need to migrate our monolithic application to microservices"
- "How should we implement real-time notifications?"
- "Choose between SQL and NoSQL for our new data platform"

Please provide more details about the technical challenge or design decision you're facing.

Alternatively, you can run the full command from the Command Palette:
`);
            
            stream.button({
                command: 'devex.generateKDD',
                title: '🚀 Start KDD Generator',
                arguments: []
            });

            return;
        }

        stream.markdown(`# 📋 Generating KDD

**Problem Statement:**
${problemStatement}

I'll launch the interactive KDD generator which will:
1. 🎯 Gather context about your problem
2. 🤖 Generate 3 design options using AI
3. ✏️ Allow you to refine the options
4. 📊 Help you evaluate and score each option
5. 📄 Create a comprehensive KDD document

Click below to start the interactive process:
`);

        stream.button({
            command: 'devex.generateKDD',
            title: '🚀 Start KDD Generator',
            arguments: []
        });

        stream.markdown(`\n\n💡 **Tip:** The KDD generator uses conversational AI to help you explore design options, generate pros/cons, and make informed architectural decisions.`);

    } catch (error: any) {
        stream.markdown(`❌ Error: ${error.message}`);
        logger.error('Error generating KDD', error);
    }
}
