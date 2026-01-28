import * as vscode from 'vscode';
import { JiraService } from '../services/jiraService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';

/**
 * Test Jira connection and configuration
 */
export async function testJiraConnectionCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    try {
        telemetryService.trackEvent('command.testJiraConnection.started');

        const jiraService = new JiraService();

        // Initialize (will prompt for config if needed)
        const initialized = await jiraService.initialize();
        if (!initialized) {
            vscode.window.showWarningMessage('Jira configuration not completed.');
            return;
        }

        // Test connection
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing Jira Connection...',
            cancellable: false
        }, async () => {
            return await jiraService.testConnection();
        });

        telemetryService.trackEvent('command.testJiraConnection.completed');

    } catch (error: any) {
        logger.error('Test connection failed', error);
        vscode.window.showErrorMessage(`Connection test failed: ${error.message}`);
        
        telemetryService.trackEvent('command.testJiraConnection.failed', {
            error: error.message
        });
    }
}
