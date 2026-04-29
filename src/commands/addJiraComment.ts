import * as vscode from 'vscode';
import { JiraService } from '../services/jiraService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';

/**
 * Command to add selected text as a comment to a Jira ticket
 */
export async function addJiraCommentCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();

    try {
        // Get selected text from active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor. Please open a file and select text to comment.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText || selectedText.trim().length === 0) {
            vscode.window.showWarningMessage('Please select text to add as a Jira comment.');
            return;
        }

        // Get or prompt for issue key
        let targetIssueKey = issueKey;
        
        if (!targetIssueKey) {
            targetIssueKey = await vscode.window.showInputBox({
                prompt: 'Enter Jira issue key (e.g., SWIFT-70243)',
                placeHolder: 'SWIFT-70243',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Please enter an issue key';
                    }
                    if (!/^[A-Z]+-\d+$/i.test(value.trim())) {
                        return 'Invalid issue key format. Expected format: PROJ-123';
                    }
                    return undefined;
                }
            });
        }

        if (!targetIssueKey) {
            return; // User cancelled
        }

        targetIssueKey = targetIssueKey.trim().toUpperCase();

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Adding comment to ${targetIssueKey}...`,
            cancellable: false
        }, async (progress) => {
            const jiraService = new JiraService();
            
            // Post comment to Jira
            await jiraService.addComment(targetIssueKey, selectedText);

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('jira.comment.added', {
                duration,
                issueKey: targetIssueKey,
                commentLength: selectedText.length
            });

            logger.info(`Successfully added comment to ${targetIssueKey}`);
        });

        // Show success with actions
        const action = await vscode.window.showInformationMessage(
            `✅ Comment added to ${targetIssueKey}`,
            'Open in Jira',
            'Add Another Comment'
        );

        if (action === 'Open in Jira') {
            const jiraService = new JiraService();
            await jiraService.initialize();
            const config = (jiraService as any).config;
            if (config) {
                const url = `${config.baseUrl}/browse/${targetIssueKey}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        } else if (action === 'Add Another Comment') {
            // Recursively call this command to add another comment
            await addJiraCommentCommand(context, telemetryService);
        }

    } catch (error: any) {
        logger.error('Failed to add Jira comment', error);
        vscode.window.showErrorMessage(`Failed to add Jira comment: ${error.message}`);
        
        telemetryService.trackEvent('jira.comment.failed', {
            error: error.message
        });
    }
}
