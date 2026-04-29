import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';
import { getDevExStateManager, PendingCompletion } from '../services/devexStateManager';

export async function resumeJiraStoryCompletion(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const startTime = Date.now();
    const stateManager = getDevExStateManager();
    
    // Log command start
    stateManager.logActivity({
        command: 'resumeJiraStoryCompletion',
        workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        status: 'started'
    });
    
    try {
        // Load all pending completions from .devex folder
        const allPendingCompletions = await stateManager.loadPendingCompletions();
        
        if (!allPendingCompletions || allPendingCompletions.length === 0) {
            vscode.window.showInformationMessage(
                'No pending repository completion found. Use "Complete Jira Story" command to start a new completion.'
            );
            
            stateManager.logActivity({
                command: 'resumeJiraStoryCompletion',
                status: 'completed',
                details: { result: 'no_pending_completions' },
                duration: Date.now() - startTime
            });
            
            return;
        }
        
        // Select pending completion if multiple exist
        let pendingCompletion: PendingCompletion;
        
        if (allPendingCompletions.length === 1) {
            pendingCompletion = allPendingCompletions[0];
        } else {
            const path = require('path');
            // Show quick pick with all pending completions
            const selected = await vscode.window.showQuickPick(
                allPendingCompletions.map(p => ({
                    label: p.issueKey,
                    description: path.basename(p.workspacePath),
                    detail: `${p.workspacePath} - ${Math.floor((Date.now() - p.timestamp) / (1000 * 60 * 60 * 24))} day(s) ago`,
                    completion: p
                })),
                {
                    title: 'Select pending completion to resume',
                    placeHolder: 'Choose a Jira story to complete'
                }
            );
            
            if (!selected) {
                stateManager.logActivity({
                    command: 'resumeJiraStoryCompletion',
                    status: 'cancelled',
                    details: { result: 'user_cancelled_selection' },
                    duration: Date.now() - startTime
                });
                return;
            }
            
            pendingCompletion = selected.completion;
        }

        const { issueKey, workspacePath, timestamp } = pendingCompletion;
        const daysAgo = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
        
        const proceed = await vscode.window.showInformationMessage(
            `Resume completion for ${issueKey}?\n\n` +
            `Workspace: ${workspacePath}\n` +
            `Requested: ${daysAgo === 0 ? 'Today' : `${daysAgo} day(s) ago`}\n\n` +
            'Make sure the GitHub repository has been created.',
            { modal: true },
            'Resume',
            'Cancel',
            'Clear Pending'
        );

        if (proceed === 'Clear Pending') {
            await stateManager.clearPendingCompletion(issueKey);
            vscode.window.showInformationMessage('Pending completion cleared.');
            
            stateManager.logActivity({
                command: 'resumeJiraStoryCompletion',
                status: 'completed',
                details: { issueKey, action: 'cleared_pending' },
                duration: Date.now() - startTime
            });
            
            return;
        }

        if (proceed !== 'Resume') {
            stateManager.logActivity({
                command: 'resumeJiraStoryCompletion',
                status: 'cancelled',
                details: { issueKey },
                duration: Date.now() - startTime
            });
            return;
        }

        // Get the repository URL
        const repoUrl = await vscode.window.showInputBox({
            prompt: 'Enter the URL of the newly created GitHub repository',
            placeHolder: 'https://github.com/mfc-gwam/peng-projectname-api',
            validateInput: (value) => {
                if (!value || !value.includes('github.com')) {
                    return 'Please enter a valid GitHub repository URL';
                }
                return null;
            }
        });

        if (!repoUrl) {
            vscode.window.showInformationMessage('Resume cancelled.');
            return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.find(
            folder => folder.uri.fsPath === workspacePath
        );

        if (!workspaceFolder) {
            vscode.window.showErrorMessage(
                `Workspace not found: ${workspacePath}\n\nPlease open the workspace and try again.`
            );
            return;
        }

        // Connect to the repository
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
            // Check if git is initialized
            let gitInitialized = false;
            try {
                await execAsync('git rev-parse --git-dir', { cwd: workspacePath });
                gitInitialized = true;
            } catch {
                // Need to initialize
            }

            if (!gitInitialized) {
                await execAsync('git init', { cwd: workspacePath });
                logger.info('Initialized git repository');
            }

            // Add remote
            try {
                await execAsync(`git remote add origin ${repoUrl}`, { cwd: workspacePath });
                logger.info(`Added remote: ${repoUrl}`);
            } catch (error: any) {
                // Remote might already exist
                if (error.message?.includes('already exists')) {
                    await execAsync(`git remote set-url origin ${repoUrl}`, { cwd: workspacePath });
                    logger.info(`Updated remote: ${repoUrl}`);
                } else {
                    throw error;
                }
            }

            // Create develop branch if needed
            try {
                await execAsync('git checkout -b develop', { cwd: workspacePath });
            } catch {
                // Branch might already exist
            }

            // Clear pending state from .devex folder
            await stateManager.clearPendingCompletion(issueKey);

            vscode.window.showInformationMessage(
                `✅ Connected to repository. Now run "Complete Jira Story" command to finish the completion.`,
                'Complete Now'
            ).then(action => {
                if (action === 'Complete Now') {
                    vscode.commands.executeCommand('devex.completeJiraStory', issueKey);
                }
            });

            telemetryService.trackEvent('jira.story.completion.resumed', {
                issueKey,
                daysAgo: daysAgo.toString()
            });
            
            // Log successful connection to .devex
            stateManager.logActivity({
                command: 'resumeJiraStoryCompletion',
                workspace: workspacePath,
                status: 'completed',
                details: { issueKey, repoUrl, daysAgo },
                duration: Date.now() - startTime
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to connect to repository: ${error.message}`);
            logger.error('Resume completion failed', error);
            
            // Log failure to .devex
            stateManager.logActivity({
                command: 'resumeJiraStoryCompletion',
                workspace: workspacePath,
                status: 'failed',
                details: { issueKey, error: error.message },
                duration: Date.now() - startTime
            });
            
            telemetryService.trackEvent('jira.story.completion.resume.error', {
                error: error.message,
                issueKey
            });
        }

    } catch (error: any) {
        vscode.window.showErrorMessage(`Resume failed: ${error.message}`);
        logger.error('Resume Jira Story Completion error', error);
        
        // Log outer catch error to .devex
        stateManager.logActivity({
            command: 'resumeJiraStoryCompletion',
            status: 'failed',
            details: { error: error.message },
            duration: Date.now() - startTime
        });
        
        telemetryService.trackEvent('jira.story.completion.resume.error', {
            error: error.message
        });
    }
}
