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
            } else {
                // Default help message
                stream.markdown(`# 👋 Ask CodeSamurai

I can help you with Jira ticket management! Here's what I can do:

## 📋 Available Commands

- **Fetch my tickets** - Get all your assigned Jira tickets
  - Example: \`@askcodesamurai fetch my tickets\`
  
- **Analyze ticket** - Generate AI analysis and TODO list
  - Example: \`@askcodesamurai analyze SWIFT-70243\`
  
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
