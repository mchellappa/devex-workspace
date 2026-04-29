import * as vscode from 'vscode';
import { JiraService, JiraIssue } from '../services/jiraService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';

/**
 * Fetch and display Jira tickets assigned to the current user
 */
export async function fetchMyJiraTicketsCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const startTime = Date.now();

    try {
        telemetryService.trackEvent('command.fetchMyJiraTickets.started');

        const jiraService = new JiraService();

        // Initialize Jira service (prompt for config if needed)
        const initialized = await jiraService.initialize();
        if (!initialized) {
            vscode.window.showWarningMessage('Jira configuration not completed. Please try again.');
            return;
        }

        // Fetch issues with progress
        const issues = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching your Jira tickets...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Querying Jira...' });
            return await jiraService.fetchMyIssues(50);
        });

        if (!issues || issues.length === 0) {
            vscode.window.showInformationMessage('No Jira tickets assigned to you.');
            return;
        }

        // Show tickets in QuickPick
        await showTicketsQuickPick(issues, context, telemetryService);

        // Track telemetry
        const duration = Date.now() - startTime;
        telemetryService.trackEvent('command.fetchMyJiraTickets.completed', {
            ticketCount: issues.length.toString(),
            duration: duration.toString()
        });

        // Track time saved (estimated 2-3 min to open Jira and find tickets)
        await telemetryService.trackProductivityMetric(
            'fetchMyJiraTickets',
            150, // 2.5 minutes in seconds
            duration / 1000
        );

    } catch (error: any) {
        logger.error('Failed to fetch Jira tickets', error);
        vscode.window.showErrorMessage(`Failed to fetch Jira tickets: ${error.message}`);
        
        telemetryService.trackEvent('command.fetchMyJiraTickets.failed', {
            error: error.message
        });
    }
}

/**
 * Show tickets in QuickPick with actions
 */
async function showTicketsQuickPick(
    issues: JiraIssue[],
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    interface TicketQuickPickItem extends vscode.QuickPickItem {
        issue: JiraIssue;
    }

    // Create QuickPick items with rich display
    const items: TicketQuickPickItem[] = issues.map(issue => {
        const statusIcon = getStatusIcon(issue.status);
        const priorityIcon = getPriorityIcon(issue.priority);
        
        return {
            label: `${statusIcon} ${issue.key}`,
            description: `[${issue.status}] ${priorityIcon} ${issue.priority}`,
            detail: issue.summary,
            issue: issue
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select a ticket to view details (${issues.length} tickets found)`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selected) {
        // Open ticket details
        await vscode.commands.executeCommand('devex.analyzeJiraTicket', selected.issue.key);
    }
}

/**
 * Get status icon for ticket
 */
function getStatusIcon(status: string): string {
    const statusLower = status.toLowerCase();
    
    if (statusLower.includes('done') || statusLower.includes('closed')) {
        return '✅';
    } else if (statusLower.includes('progress') || statusLower.includes('development')) {
        return '🔵';
    } else if (statusLower.includes('review')) {
        return '👀';
    } else if (statusLower.includes('test') || statusLower.includes('qa')) {
        return '🧪';
    } else if (statusLower.includes('blocked')) {
        return '🚫';
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
    } else if (priorityLower.includes('low')) {
        return '🟢';
    } else {
        return '⚫';
    }
}
