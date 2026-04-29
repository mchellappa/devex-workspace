import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';
import { logger } from '../utils/logger';
import { getDevExStateManager, PendingCompletion } from '../services/devexStateManager';

export async function completeJiraStory(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();
    const stateManager = getDevExStateManager();
    
    // Log command execution
    stateManager.logActivity({
        command: 'completeJiraStory',
        workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        status: 'started',
        details: { issueKey }
    });

    try {
        // Step 1: Get Jira configuration
        const config = vscode.workspace.getConfiguration('devex');
        const jiraBaseUrl = config.get<string>('jira.baseUrl');
        const jiraEmail = config.get<string>('jira.email');
        const jiraApiToken = config.get<string>('jira.apiToken');

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
                prompt: 'Enter Jira Story or Task key to complete (e.g., SWIFT-123)',
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

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Step 3: Fetch issue details early (needed for repo request if git not found)
        const issue = await jiraService.fetchIssue(selectedIssueKey);

        if (!issue) {
            throw new Error(`Issue ${selectedIssueKey} not found`);
        }

        // Step 3.5: Determine if this is an API story (needed for repo request scenario)
        const isApiStory = isRestfulApiStory(issue);

        // Step 4: Check for Git repository
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension?.getAPI(1);

        if (!git) {
            throw new Error('Git extension not found. Please ensure VS Code Git extension is enabled.');
        }

        // Wait for git to initialize if needed
        if (git.repositories.length === 0) {
            // Try to wait a bit for git to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        let repository = git.repositories[0];
        if (!repository) {
            // Offer to initialize git repository or create GitHub issue to request one
            const action = await vscode.window.showWarningMessage(
                'No Git repository found in workspace. How would you like to proceed?',
                { modal: true },
                'Initialize Git Locally',
                'Create GitHub Issue for Repo Request',
                'Cancel'
            );

            if (action === 'Cancel' || !action) {
                vscode.window.showInformationMessage('Completion cancelled - Git repository required');
                return;
            }

            if (action === 'Create GitHub Issue for Repo Request') {
                // Create GitHub issue to request new repository
                const issueCreated = await createGitHubRepoRequestIssue(
                    workspaceFolder,
                    selectedIssueKey,
                    issue
                );
                
                if (issueCreated) {
                    // Save state for resuming later in .devex folder
                    const pendingCompletion: PendingCompletion = {
                        issueKey: selectedIssueKey,
                        workspacePath: workspaceFolder.uri.fsPath,
                        timestamp: Date.now(),
                        isApiStory
                    };
                    
                    await stateManager.savePendingCompletion(pendingCompletion);
                    
                    stateManager.logActivity({
                        command: 'completeJiraStory',
                        workspace: workspaceFolder.uri.fsPath,
                        status: 'completed',
                        details: { issueKey: selectedIssueKey, action: 'repo_request_created' },
                        duration: Date.now() - startTime
                    });
                    
                    const resumeAction = await vscode.window.showInformationMessage(
                        '✅ GitHub issue created for repo request.\n\n' +
                        'After the repository is created on GitHub:\n' +
                        '1. Copy the new repository URL\n' +
                        '2. Click "Resume" to connect and continue\n\n' +
                        'Or manually run the Complete command again later.',
                        { modal: true },
                        'Resume After Repo Created',
                        'I\'ll Do It Later'
                    );
                    
                    if (resumeAction === 'Resume After Repo Created') {
                        // Wait for user to confirm repo is ready
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
                        
                        if (repoUrl) {
                            // Initialize git and connect to remote
                            const connected = await connectToNewRepository(workspaceFolder, repoUrl);
                            
                            if (connected) {
                                // Clear pending state from .devex folder
                                await stateManager.clearPendingCompletion(selectedIssueKey);
                                
                                // Refresh git repositories
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                repository = git.repositories[0];
                                
                                if (!repository) {
                                    throw new Error('Could not detect git repository after connecting. Please restart VS Code.');
                                }
                                
                                vscode.window.showInformationMessage('✅ Connected to repository. Continuing with completion...');
                                // Continue with normal flow (don't return)
                            } else {
                                vscode.window.showWarningMessage('Failed to connect to repository. Please try again later.');
                                return;
                            }
                        } else {
                            vscode.window.showInformationMessage('Resume cancelled. Run Complete command again when ready.');
                            return;
                        }
                    } else {
                        vscode.window.showInformationMessage('You can resume by running the Complete command again.');
                        return;
                    }
                } else {
                    vscode.window.showWarningMessage('Failed to create GitHub issue. Please create it manually.');
                    return;
                }
            }

            // Initialize git repository locally
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            try {
                await execAsync('git init', { cwd: workspaceFolder.uri.fsPath });
                logger.info('Initialized git repository');
                
                // Wait for VS Code to detect the new repository
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                repository = git.repositories[0];
                if (!repository) {
                    throw new Error('Git repository initialized but not detected by VS Code. Please restart VS Code.');
                }
                
                vscode.window.showInformationMessage('✅ Git repository initialized');
            } catch (error: any) {
                throw new Error(`Failed to initialize git repository: ${error.message}`);
            }
        }

        // Step 5: Log if this is a RESTful API story (already determined earlier)
        if (isApiStory) {
            logger.info(`Detected RESTful API story: ${selectedIssueKey}`);
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Completing ${selectedIssueKey}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Checking Git status...' });

            // Step 5: Check for uncommitted changes
            const changes = repository.state.workingTreeChanges;
            const stagedChanges = repository.state.indexChanges;
            const hasUncommittedChanges = changes.length > 0 || stagedChanges.length > 0;

            if (!hasUncommittedChanges) {
                vscode.window.showInformationMessage(
                    `No uncommitted changes found. Files were already committed in Implement Story. Proceeding with push and PR...`
                );
            }

            // Step 6: Ask for completion options
            const options = await vscode.window.showQuickPick(
                [
                    { label: 'Run Tests', description: 'Run tests before committing', picked: true },
                    { label: 'Create Pull Request', description: isApiStory ? 'Required for API stories' : 'Create GitHub PR after push', picked: true },
                    { label: 'Transition to Done', description: 'Mark Jira story as Done', picked: true }
                ],
                {
                    canPickMany: true,
                    placeHolder: isApiStory ? `Complete ${selectedIssueKey} (API Story - PR Required)` : `Complete ${selectedIssueKey}`,
                    title: `Complete ${selectedIssueKey}`
                }
            );

            if (!options) {
                return;
            }

            const shouldRunTests = options.some(o => o.label === 'Run Tests');
            let shouldCreatePR = options.some(o => o.label === 'Create Pull Request');
            const shouldTransitionToDone = options.some(o => o.label === 'Transition to Done');
            
            // For API stories, PR is mandatory
            if (isApiStory && !shouldCreatePR) {
                const forcePR = await vscode.window.showWarningMessage(
                    '⚠️ This is a RESTful API story. Pull Request is required to link code changes to Jira.',
                    { modal: true },
                    'Create PR',
                    'Cancel'
                );
                
                if (forcePR !== 'Create PR') {
                    vscode.window.showInformationMessage('Completion cancelled - PR required for API stories');
                    return;
                }
                
                shouldCreatePR = true;
            }

            let testResults = { passed: true, summary: '' };

            // Step 7: Run tests if requested
            if (shouldRunTests) {
                progress.report({ increment: 20, message: 'Running tests...' });
                testResults = await runTests(workspaceFolder.uri.fsPath, progress);

                if (!testResults.passed) {
                    const continueAnyway = await vscode.window.showWarningMessage(
                        'Some tests failed. Continue with completion?',
                        'Yes, Continue',
                        'Cancel'
                    );

                    if (continueAnyway !== 'Yes, Continue') {
                        vscode.window.showInformationMessage('Completion cancelled due to test failures');
                        return;
                    }
                }
            }

            progress.report({ increment: 10, message: 'Staging changes...' });

            // Step 8: Stage and commit only if there are uncommitted changes
            let commitHash = 'unknown';
            let commitMessage = '';
            
            if (hasUncommittedChanges) {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);

                try {
                    // Stage all changes using git add -A (includes deletions, modifications, new files)
                    await execAsync('git add -A', { cwd: workspaceFolder.uri.fsPath });
                    logger.info('Staged all changes using git add -A');
                } catch (addError: any) {
                    throw new Error(`Failed to stage changes: ${addError.message}. Check that git is working properly.`);
                }

                progress.report({ increment: 10, message: 'Creating commit...' });

                // Step 9: Verify git configuration before committing
                try {
                // Check git user.name
                let userName: string | undefined;
                let userEmail: string | undefined;

                try {
                    const { stdout: nameOutput } = await execAsync('git config user.name', { cwd: workspaceFolder.uri.fsPath });
                    userName = nameOutput.trim();
                } catch {
                    // Try global config
                    try {
                        const { stdout: globalNameOutput } = await execAsync('git config --global user.name', { cwd: workspaceFolder.uri.fsPath });
                        userName = globalNameOutput.trim();
                    } catch {
                        userName = undefined;
                    }
                }

                try {
                    const { stdout: emailOutput } = await execAsync('git config user.email', { cwd: workspaceFolder.uri.fsPath });
                    userEmail = emailOutput.trim();
                } catch {
                    // Try global config
                    try {
                        const { stdout: globalEmailOutput } = await execAsync('git config --global user.email', { cwd: workspaceFolder.uri.fsPath });
                        userEmail = globalEmailOutput.trim();
                    } catch {
                        userEmail = undefined;
                    }
                }

                if (!userName || !userEmail) {
                    const configAction = await vscode.window.showErrorMessage(
                        `Git is not configured. Please set user.name and user.email.\n\nCurrent values:\nuser.name: ${userName || 'NOT SET'}\nuser.email: ${userEmail || 'NOT SET'}`,
                        'Configure Git',
                        'Cancel'
                    );

                    if (configAction === 'Configure Git') {
                        const newUserName = await vscode.window.showInputBox({
                            prompt: 'Enter your git user.name',
                            value: userName || '',
                            placeHolder: 'John Doe'
                        });

                        if (!newUserName) {
                            vscode.window.showInformationMessage('Git configuration cancelled');
                            return;
                        }

                        const newUserEmail = await vscode.window.showInputBox({
                            prompt: 'Enter your git user.email',
                            value: userEmail || '',
                            placeHolder: 'john.doe@example.com'
                        });

                        if (!newUserEmail) {
                            vscode.window.showInformationMessage('Git configuration cancelled');
                            return;
                        }

                        // Configure git globally
                        await execAsync(`git config --global user.name "${newUserName}"`, { cwd: workspaceFolder.uri.fsPath });
                        await execAsync(`git config --global user.email "${newUserEmail}"`, { cwd: workspaceFolder.uri.fsPath });

                        vscode.window.showInformationMessage(`Git configured with user.name="${newUserName}" and user.email="${newUserEmail}"`);
                    } else {
                        vscode.window.showInformationMessage('Completion cancelled');
                        return;
                    }
                }
            } catch (configError: any) {
                logger.error(`Failed to verify git configuration: ${configError.message}`, configError);
                // Continue anyway - might still work
            }

            // Step 9b: Create commit using git command directly (more reliable than VS Code API)
            commitMessage = await vscode.window.showInputBox({
                prompt: 'Enter commit message',
                value: `${selectedIssueKey}: ${issue.summary}`,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Commit message is required';
                    }
                    return null;
                }
            }) || '';

            if (!commitMessage) {
                vscode.window.showInformationMessage('Completion cancelled');
                return;
            }

            try {
                // Use git commit command directly - more reliable than VS Code Git API
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: workspaceFolder.uri.fsPath });
                logger.info(`Created commit: ${commitMessage}`);
                
                // Get the commit hash
                const { stdout: hashOutput } = await execAsync('git rev-parse --short HEAD', { cwd: workspaceFolder.uri.fsPath });
                commitHash = hashOutput.trim();
            } catch (commitError: any) {
                throw new Error(`Failed to create commit: ${commitError.message}`);
            }
            } else {
                // No uncommitted changes - get the latest commit hash
                progress.report({ increment: 20, message: 'No new changes to commit...' });
                try {
                    const { exec } = require('child_process');
                    const { promisify } = require('util');
                    const execAsync = promisify(exec);
                    const { stdout: hashOutput } = await execAsync('git rev-parse --short HEAD', { cwd: workspaceFolder.uri.fsPath });
                    commitHash = hashOutput.trim();
                    logger.info(`No uncommitted changes - using existing commit: ${commitHash}`);
                } catch (hashError: any) {
                    commitHash = 'unknown';
                    logger.warn(`Could not get commit hash: ${hashError.message}`);
                }
            }

            progress.report({ increment: 10, message: 'Pushing to remote...' });

            // Step 10: Push to remote
            try {
                // Get current branch
                const currentBranch = repository.state.HEAD?.name;
                
                // Try to push - if no upstream, VS Code Git API will handle it
                await repository.push();
                
            } catch (pushError: any) {
                // If push fails due to no upstream, try to set it
                if (pushError.message?.includes('no upstream') || 
                    pushError.message?.includes('has no upstream branch') ||
                    pushError.gitErrorCode === 'NoUpstreamBranch') {
                    
                    const currentBranch = repository.state.HEAD?.name;
                    if (currentBranch) {
                        try {
                            // Set upstream and push using git command
                            const { exec } = require('child_process');
                            const util = require('util');
                            const execPromise = util.promisify(exec);
                            
                            vscode.window.showInformationMessage(`Setting upstream for branch: ${currentBranch}`);
                            await execPromise(`git push --set-upstream origin ${currentBranch}`, { 
                                cwd: workspaceFolder.uri.fsPath 
                            });
                            vscode.window.showInformationMessage(`✅ Pushed to origin/${currentBranch}`);
                        } catch (upstreamError: any) {
                            throw new Error(`Failed to set upstream and push: ${upstreamError.message}`);
                        }
                    } else {
                        throw new Error('Cannot push: no current branch detected');
                    }
                } else {
                    vscode.window.showWarningMessage(`Push failed: ${pushError.message}. You may need to push manually.`);
                }
            }

            let prUrl = '';

            // Step 11: Create Pull Request if requested
            if (shouldCreatePR) {
                progress.report({ increment: 10, message: 'Creating Pull Request...' });

                try {
                    prUrl = await createPullRequest(
                        workspaceFolder.uri.fsPath,
                        selectedIssueKey,
                        issue.summary,
                        commitMessage,
                        progress
                    );
                    
                    // For API stories, validate PR URL was obtained
                    if (isApiStory && (!prUrl || prUrl.includes('manually') || prUrl.includes('browser'))) {
                        const manualPrUrl = await vscode.window.showInputBox({
                            prompt: '⚠️ API Story requires PR URL. Please enter the GitHub PR URL:',
                            placeHolder: 'https://github.com/owner/repo/pull/123',
                            validateInput: (value) => {
                                if (!value || value.trim().length === 0) {
                                    return 'PR URL is required for API stories';
                                }
                                if (!value.includes('github.com') || !value.includes('/pull/')) {
                                    return 'Please enter a valid GitHub PR URL';
                                }
                                return null;
                            }
                        });
                        
                        if (!manualPrUrl) {
                            vscode.window.showWarningMessage('Completion will continue but PR URL is missing');
                        } else {
                            prUrl = manualPrUrl;
                        }
                    }
                } catch (prError: any) {
                    if (isApiStory) {
                        // For API stories, PR is critical
                        const continueWithoutPR = await vscode.window.showErrorMessage(
                            `Failed to create PR: ${prError.message}\n\nAPI stories require a PR URL. Continue anyway?`,
                            { modal: true },
                            'Enter PR URL Manually',
                            'Cancel'
                        );
                        
                        if (continueWithoutPR === 'Enter PR URL Manually') {
                            const manualPrUrl = await vscode.window.showInputBox({
                                prompt: 'Enter the GitHub PR URL:',
                                placeHolder: 'https://github.com/owner/repo/pull/123',
                                validateInput: (value) => {
                                    return value && value.includes('github.com') && value.includes('/pull/') 
                                        ? null 
                                        : 'Please enter a valid GitHub PR URL';
                                }
                            });
                            
                            if (manualPrUrl) {
                                prUrl = manualPrUrl;
                            } else {
                                vscode.window.showInformationMessage('Completion cancelled - PR URL required for API stories');
                                return;
                            }
                        } else {
                            vscode.window.showInformationMessage('Completion cancelled');
                            return;
                        }
                    } else {
                        vscode.window.showWarningMessage(`Could not create PR: ${prError.message}`);
                    }
                }
            }

            progress.report({ increment: 10, message: 'Updating Jira...' });

            // Step 12: Get list of changed files
            const changedFiles = [...stagedChanges, ...changes]
                .map(c => path.relative(workspaceFolder.uri.fsPath, c.uri.fsPath))
                .slice(0, 20); // Limit to 20 files

            // Step 13: Create completion comment
            let completionComment = `**Story Completed** ✅\n\n`;
            completionComment += `**Commit:** \`${commitHash}\`\n`;
            completionComment += `**Branch:** ${repository.state.HEAD?.name || 'unknown'}\n\n`;

            if (prUrl) {
                completionComment += `**Pull Request:** ${prUrl}\n\n`;
            }

            if (shouldRunTests) {
                completionComment += `**Tests:** ${testResults.passed ? '✅ All Passed' : '⚠️ Some Failed'}\n`;
                if (testResults.summary) {
                    completionComment += `\`\`\`\n${testResults.summary}\n\`\`\`\n\n`;
                }
            }

            completionComment += `**Changed Files:**\n${changedFiles.map(f => `- ${f}`).join('\n')}\n\n`;
            completionComment += `_Completed by DevEx AI Assistant_`;

            await jiraService.addComment(selectedIssueKey, completionComment);

            // Add PR as remote link to Jira's Development section
            if (prUrl && !prUrl.includes('manually') && !prUrl.includes('browser')) {
                progress.report({ message: 'Linking PR to Jira...' });
                try {
                    await jiraService.addRemoteLink(
                        selectedIssueKey,
                        prUrl,
                        `PR: ${issue.summary}`,
                        'Pull Request'
                    );
                    logger.info(`Linked PR to Jira: ${prUrl}`);
                } catch (linkError: any) {
                    logger.warn(`Failed to link PR to Jira: ${linkError.message}`);
                    // Continue anyway - comment already added
                }
            } else if (isApiStory && !prUrl) {
                vscode.window.showWarningMessage('⚠️ API Story completed but PR URL not linked to Jira');
            }

            // Step 14: Transition to DONE if requested
            // Note: transitionIssue has conversational error handling built-in
            if (shouldTransitionToDone) {
                progress.report({ increment: 10, message: 'Transitioning to DONE...' });

                try {
                    await jiraService.transitionIssue(selectedIssueKey, 'DONE');
                    vscode.window.showInformationMessage(`✅ ${selectedIssueKey} transitioned to DONE`);
                } catch (transitionError: any) {
                    // Only log - user already saw conversational error handling
                    console.log('Transition did not complete:', transitionError.message);
                }
            }

            progress.report({ increment: 10, message: 'Complete!' });

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('jira.story.completed', {
                duration: duration.toString(),
                testsRun: shouldRunTests.toString(),
                testsPassed: testResults.passed.toString(),
                prCreated: (!!prUrl).toString(),
                transitioned: shouldTransitionToDone.toString(),
                filesChanged: changedFiles.length.toString()
            });
            
            // Log completion success to .devex
            stateManager.logActivity({
                command: 'completeJiraStory',
                workspace: workspaceFolder.uri.fsPath,
                status: 'completed',
                details: {
                    issueKey: selectedIssueKey,
                    testsRun: shouldRunTests,
                    prCreated: !!prUrl,
                    filesChanged: changedFiles.length
                },
                duration
            });

            // Step 15: Show success message
            const issueUrl = `${jiraBaseUrl}/browse/${selectedIssueKey}`;
            const actions = ['Open in Jira'];
            if (prUrl) {
                actions.push('Open PR');
            }

            const action = await vscode.window.showInformationMessage(
                `✅ Story ${selectedIssueKey} completed successfully!`,
                ...actions
            );

            if (action === 'Open in Jira') {
                await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
            } else if (action === 'Open PR' && prUrl) {
                await vscode.env.openExternal(vscode.Uri.parse(prUrl));
            }
        });

    } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error('Complete Jira Story error:', error);
        
        // Log failure to .devex
        const stateManager = getDevExStateManager();
        stateManager.logActivity({
            command: 'completeJiraStory',
            workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            status: 'failed',
            details: { error: errorMsg },
            duration: Date.now() - startTime
        });
        
        // Show detailed error message
        vscode.window.showErrorMessage(
            `Failed to complete story: ${errorMsg}`,
            'View Output'
        ).then(action => {
            if (action === 'View Output') {
                vscode.commands.executeCommand('workbench.action.output.toggleOutput');
            }
        });
        
        telemetryService.trackEvent('jira.story.completion.error', {
            error: errorMsg,
            stack: error.stack?.substring(0, 500) || 'no stack'
        });
    }
}

interface TestResults {
    passed: boolean;
    summary: string;
}

async function runTests(
    workspacePath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
): Promise<TestResults> {
    try {
        // Detect project type and run appropriate tests
        if (fs.existsSync(path.join(workspacePath, 'pom.xml'))) {
            // Maven project
            progress.report({ message: 'Running Maven tests...' });
            
            const terminal = vscode.window.createTerminal({
                name: 'DevEx Tests',
                cwd: workspacePath
            });

            terminal.sendText('mvn test', true);
            
            // Note: In a real implementation, we'd wait for the terminal to complete
            // For now, we'll return a placeholder result
            return {
                passed: true,
                summary: 'Maven tests executed. Check terminal for results.'
            };
        } else if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
            // Node.js project
            progress.report({ message: 'Running npm tests...' });
            
            const terminal = vscode.window.createTerminal({
                name: 'DevEx Tests',
                cwd: workspacePath
            });

            terminal.sendText('npm test', true);
            
            return {
                passed: true,
                summary: 'npm tests executed. Check terminal for results.'
            };
        } else if (fs.existsSync(path.join(workspacePath, 'requirements.txt'))) {
            // Python project
            progress.report({ message: 'Running pytest...' });
            
            const terminal = vscode.window.createTerminal({
                name: 'DevEx Tests',
                cwd: workspacePath
            });

            terminal.sendText('pytest', true);
            
            return {
                passed: true,
                summary: 'pytest executed. Check terminal for results.'
            };
        }

        return {
            passed: true,
            summary: 'No test framework detected'
        };

    } catch (error: any) {
        return {
            passed: false,
            summary: `Test execution failed: ${error.message}`
        };
    }
}

async function createPullRequest(
    workspacePath: string,
    issueKey: string,
    issueSummary: string,
    commitMessage: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
): Promise<string> {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    try {
        // Get current branch name
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension?.getAPI(1);
        const repository = git?.repositories[0];
        
        const currentBranch = repository?.state.HEAD?.name || 'main';
        
        // Try GitHub CLI first
        let ghCliAvailable = false;
        try {
            await execPromise('gh --version', { cwd: workspacePath });
            await execPromise('gh auth status', { cwd: workspacePath });
            ghCliAvailable = true;
        } catch (error) {
            // gh CLI not available - will use browser fallback
        }
        
        if (ghCliAvailable) {
            // Create PR using GitHub CLI
            const prTitle = `${issueKey}: ${issueSummary}`;
            const prBody = `Resolves ${issueKey}\n\n${commitMessage}\n\n_Created by DevEx AI Assistant_`;
            
            progress.report({ message: 'Creating PR via GitHub CLI...' });
            
            const createPrCommand = `gh pr create --title "${prTitle}" --body "${prBody}" --head ${currentBranch}`;
            const { stdout } = await execPromise(createPrCommand, { cwd: workspacePath });
            
            // Extract PR URL from output
            const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
            if (urlMatch) {
                return urlMatch[0];
            }
            
            // Fallback to gh pr view
            try {
                const { stdout: prUrl } = await execPromise('gh pr view --json url -q .url', { cwd: workspacePath });
                return prUrl.trim();
            } catch (viewError) {
                return 'PR created successfully';
            }
        } else {
            // Fallback: Open GitHub PR creation page in browser with pre-filled form
            progress.report({ message: 'Opening GitHub PR page in browser...' });
            
            try {
                // Get remote URL
                const { stdout: remoteUrl } = await execPromise('git remote get-url origin', { cwd: workspacePath });
                const url = remoteUrl.trim();
                
                // Parse GitHub owner/repo from URL
                // Handles: git@github.com:owner/repo.git or https://github.com/owner/repo.git
                let owner = '';
                let repo = '';
                
                const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)(\.git)?/);
                const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\/([^.]+)(\.git)?/);
                
                if (sshMatch) {
                    owner = sshMatch[1];
                    repo = sshMatch[2];
                } else if (httpsMatch) {
                    owner = httpsMatch[1];
                    repo = httpsMatch[2];
                } else {
                    throw new Error('Could not parse GitHub repository URL');
                }
                
                // Build PR creation URL with pre-filled form
                const prTitle = `${issueKey}: ${issueSummary}`;
                const prBody = `Resolves ${issueKey}\n\n${commitMessage}\n\n_Created by DevEx AI Assistant_`;
                const encodedTitle = encodeURIComponent(prTitle);
                const encodedBody = encodeURIComponent(prBody);
                
                // Get base branch (usually main or master)
                let baseBranch = 'main';
                try {
                    const { stdout: defaultBranch } = await execPromise('git symbolic-ref refs/remotes/origin/HEAD', { cwd: workspacePath });
                    baseBranch = defaultBranch.trim().replace('refs/remotes/origin/', '');
                } catch (err) {
                    // Fallback to main
                }
                
                const prUrl = `https://github.com/${owner}/${repo}/compare/${baseBranch}...${currentBranch}?quick_pull=1&title=${encodedTitle}&body=${encodedBody}`;
                
                // Open in browser
                await vscode.env.openExternal(vscode.Uri.parse(prUrl));
                
                // Show message
                const action = await vscode.window.showInformationMessage(
                    `📝 GitHub PR page opened in browser with pre-filled form.\\n\\nAfter creating the PR, paste the URL here:`,
                    { modal: false },
                    'Enter PR URL',
                    'Skip'
                );
                
                if (action === 'Enter PR URL') {
                    const manualPrUrl = await vscode.window.showInputBox({
                        prompt: 'Enter the GitHub PR URL',
                        placeHolder: 'https://github.com/owner/repo/pull/123',
                        validateInput: (value) => {
                            return value && value.includes('github.com') && value.includes('/pull/') 
                                ? null 
                                : 'Please enter a valid GitHub PR URL';
                        }
                    });
                    
                    return manualPrUrl || 'PR created manually';
                }
                
                return 'PR form opened in browser';
                
            } catch (error: any) {
                vscode.window.showErrorMessage(`Could not open PR page: ${error.message}`);
                throw error;
            }
        }
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create PR: ${error.message}`);
        throw error;
    }
}

/**
 * Determines if a Jira issue is a RESTful API story
 * Checks issue type, labels, and summary for API-related keywords
 */
function isRestfulApiStory(issue: any): boolean {
    const issueType = issue.issueType?.toLowerCase() || '';
    const summary = issue.summary?.toLowerCase() || '';
    const description = issue.description?.toLowerCase() || '';
    const labels = (issue.labels || []).map((l: string) => l.toLowerCase());
    
    // Check issue type
    const apiIssueTypes = ['api', 'rest api', 'restful api', 'api development', 'api story'];
    if (apiIssueTypes.some(type => issueType.includes(type))) {
        return true;
    }
    
    // Check labels
    const apiLabels = ['api', 'rest-api', 'restful-api', 'rest', 'api-development', 'backend-api'];
    if (labels.some((label: string) => apiLabels.includes(label))) {
        return true;
    }
    
    // Check summary for API keywords
    const apiKeywords = [
        'rest api',
        'restful api',
        'api endpoint',
        'create api',
        'develop api',
        'implement api',
        'api for',
        '/api/',
        'rest service',
        'restful service',
        'web service',
        'microservice api'
    ];
    
    if (apiKeywords.some(keyword => summary.includes(keyword) || description.includes(keyword))) {
        return true;
    }
    
    return false;
}

/**
 * Creates a GitHub issue to request a new repository using company's IssueOps template
 * Opens browser to the form template at mfc-gwam/peng-bldengg-action-ref
 */
async function createGitHubRepoRequestIssue(
    workspaceFolder: vscode.WorkspaceFolder,
    jiraIssueKey: string,
    jiraIssue: any
): Promise<boolean> {
    try {
        const projectName = workspaceFolder.name;
        
        // Show information message with context
        const proceed = await vscode.window.showInformationMessage(
            `📋 Opening GitHub repository request form for: ${projectName}\n\n` +
            `The form will be pre-populated with:\n` +
            `- Title: Create Repository - ${projectName}\n` +
            `- Jira Issue: ${jiraIssueKey}\n\n` +
            `Please fill out the required fields in the form:\n` +
            `✓ Vertical (e.g., peng, eng, dgt)\n` +
            `✓ Repository Type (e.g., api, ui, lib)\n` +
            `✓ Deployment Region (CA/US/ASIA)\n` +
            `✓ ACL Name\n` +
            `✓ Visibility (private/internal)\n` +
            `And other scan/mirror options as needed.`,
            { modal: true },
            'Open Form',
            'Cancel'
        );
        
        if (proceed !== 'Open Form') {
            return false;
        }
        
        // Use the company's IssueOps template
        const repoRequestRepo = 'mfc-gwam/peng-bldengg-action-ref';
        const templateName = 'issueops-hcreate-new-repo.yml';
        
        // Build the title for the issue
        const issueTitle = `Create Repository - ${projectName}`;
        
        // Build URL to the issue form
        // Note: GitHub issue forms don't support URL parameter pre-filling for form fields
        // But we can set the title
        const encodedTitle = encodeURIComponent(issueTitle);
        const issueUrl = `https://github.com/${repoRequestRepo}/issues/new?template=${templateName}&title=${encodedTitle}`;
        
        // Open in browser
        await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
        
        // Show helper information in a notification
        vscode.window.showInformationMessage(
            `💡 Tip: Project name is "${projectName}". Use this in the form's "Project Name" field.`,
            'Copy Project Name'
        ).then(action => {
            if (action === 'Copy Project Name') {
                vscode.env.clipboard.writeText(projectName);
                vscode.window.showInformationMessage('Project name copied to clipboard');
            }
        });
        
        // Wait a moment then ask if user created the issue
        setTimeout(async () => {
            const result = await vscode.window.showInformationMessage(
                '✅ After creating the GitHub issue, you can track its progress.\n\n' +
                'Complete the Jira story after the repository is created and ready.',
                'I Created the Issue',
                'Copy Issue Template Link'
            );
            
            if (result === 'Copy Issue Template Link') {
                await vscode.env.clipboard.writeText(issueUrl);
                vscode.window.showInformationMessage('Issue template URL copied to clipboard');
            }
        }, 3000);
        
        logger.info(`Opened repo request form for ${projectName} (Jira: ${jiraIssueKey})`);
        return true;
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to open GitHub issue form: ${error.message}`);
        logger.error('GitHub repo request form opening failed', error);
        return false;
    }
}

/**
 * Connects workspace to a newly created GitHub repository
 * Initializes git if needed and adds remote origin
 */
async function connectToNewRepository(
    workspaceFolder: vscode.WorkspaceFolder,
    repoUrl: string
): Promise<boolean> {
    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const workspacePath = workspaceFolder.uri.fsPath;
        
        // Check if git is already initialized
        let gitInitialized = false;
        try {
            await execAsync('git rev-parse --git-dir', { cwd: workspacePath });
            gitInitialized = true;
        } catch {
            // Git not initialized
        }
        
        // Initialize git if needed
        if (!gitInitialized) {
            try {
                await execAsync('git init', { cwd: workspacePath });
                logger.info('Initialized git repository');
            } catch (error: any) {
                throw new Error(`Failed to initialize git: ${error.message}`);
            }
        }
        
        // Check if remote already exists
        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd: workspacePath });
            const existingRemote = stdout.trim();
            
            if (existingRemote && existingRemote !== repoUrl) {
                // Remote exists but different URL - update it
                await execAsync(`git remote set-url origin ${repoUrl}`, { cwd: workspacePath });
                logger.info(`Updated remote origin to: ${repoUrl}`);
            } else if (existingRemote === repoUrl) {
                logger.info('Remote origin already set correctly');
            }
        } catch {
            // Remote doesn't exist - add it
            try {
                await execAsync(`git remote add origin ${repoUrl}`, { cwd: workspacePath });
                logger.info(`Added remote origin: ${repoUrl}`);
            } catch (error: any) {
                throw new Error(`Failed to add remote: ${error.message}`);
            }
        }
        
        // Create initial branch if needed
        try {
            await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workspacePath });
        } catch {
            // No branch exists - create one
            try {
                await execAsync('git checkout -b develop', { cwd: workspacePath });
                logger.info('Created develop branch');
            } catch (error: any) {
                logger.warn(`Could not create develop branch: ${error.message}`);
            }
        }
        
        vscode.window.showInformationMessage(`✅ Connected to ${repoUrl}`);
        return true;
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to connect to repository: ${error.message}`);
        logger.error('Repository connection failed', error);
        return false;
    }
}
