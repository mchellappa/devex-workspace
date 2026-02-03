import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TelemetryService } from '../services/telemetryService';
import { JiraService } from '../services/jiraService';
import mammoth from 'mammoth';

export async function createJiraStoryFromLLD(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    fileUri?: vscode.Uri
): Promise<void> {
    const startTime = Date.now();

    try {
        // Step 1: Get LLD file
        let lldFile: vscode.Uri | undefined = fileUri;

        if (!lldFile) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.toLowerCase().includes('lld')) {
                lldFile = editor.document.uri;
            } else {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'Documents': ['md', 'docx', 'txt']
                    },
                    title: 'Select LLD Document'
                });

                if (!files || files.length === 0) {
                    vscode.window.showWarningMessage('No LLD file selected');
                    return;
                }

                lldFile = files[0];
            }
        }

        // Step 2: Parse LLD content
        const lldContent = await parseLLDFile(lldFile);

        if (!lldContent) {
            vscode.window.showErrorMessage('Failed to parse LLD document');
            return;
        }

        // Step 3: Get Jira configuration
        const config = vscode.workspace.getConfiguration('devex');
        const jiraBaseUrl = config.get<string>('jiraBaseUrl');
        const jiraEmail = config.get<string>('jiraEmail');
        const jiraApiToken = config.get<string>('jiraApiToken');
        const jiraProjectKey = config.get<string>('jiraProjectKey');

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

        // Step 4: Collect story metadata
        let projectKey = jiraProjectKey;
        if (!projectKey) {
            projectKey = await vscode.window.showInputBox({
                prompt: 'Enter Jira Project Key (e.g., SWIFT, PROJ)',
                placeHolder: 'PROJECT',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Project key is required';
                    }
                    if (!/^[A-Z][A-Z0-9]*$/.test(value)) {
                        return 'Project key must start with a letter and contain only uppercase letters and numbers';
                    }
                    return null;
                }
            });

            if (!projectKey) {
                return;
            }
        }

        // Ask for priority
        const priority = await vscode.window.showQuickPick(
            ['High', 'Medium', 'Low', 'Blocker', 'Critical'],
            {
                placeHolder: 'Select story priority',
                title: 'Story Priority'
            }
        );

        if (!priority) {
            return;
        }

        // Ask for assignee (optional)
        const assigneeEmail = await vscode.window.showInputBox({
            prompt: 'Enter assignee email (leave empty for unassigned)',
            placeHolder: 'developer@company.com (optional)',
            validateInput: (value) => {
                if (value && !value.includes('@')) {
                    return 'Please enter a valid email address';
                }
                return null;
            }
        });

        // Ask for sprint/epic (optional)
        const epicKey = await vscode.window.showInputBox({
            prompt: 'Enter Epic key to link to (optional, e.g., PROJ-100)',
            placeHolder: 'PROJ-100 (optional)',
            validateInput: (value) => {
                if (value && !/^[A-Z]+-\d+$/.test(value)) {
                    return 'Please enter a valid Jira issue key (e.g., PROJ-100)';
                }
                return null;
            }
        });

        // Ask for labels (optional)
        const labelsInput = await vscode.window.showInputBox({
            prompt: 'Enter labels (comma-separated, optional)',
            placeHolder: 'backend, api, migration (optional)'
        });

        const labels = labelsInput 
            ? labelsInput.split(',').map(l => l.trim()).filter(l => l.length > 0)
            : [];

        // Step 5: Generate story details using AI
        const storyDetails = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing LLD...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 50, message: 'Generating story details with AI...' });

            const details = await generateStoryDetails(lldContent, progress);

            progress.report({ increment: 50, message: 'Story details generated' });
            
            return details;
        });

        // Step 6: Show preview and ask for confirmation
        const previewMessage = `📋 **Story Preview**\n\n**Summary:** ${storyDetails.summary}\n\n**Project:** ${projectKey}\n**Priority:** ${priority}\n**Story Points:** ${storyDetails.storyPoints}\n**Assignee:** ${assigneeEmail || 'Unassigned'}\n${epicKey ? `**Epic:** ${epicKey}\n` : ''}${labels.length > 0 ? `**Labels:** ${labels.join(', ')}\n` : ''}\n**Subtasks:** ${storyDetails.subtasks.length}\n\n**Description:**\n${storyDetails.description.substring(0, 200)}...\n\n**Acceptance Criteria:**\n${storyDetails.acceptanceCriteria.split('\\n').slice(0, 3).join('\\n')}...\n\nProceed with story creation?`;

        const confirmCreate = await vscode.window.showInformationMessage(
            previewMessage,
            { modal: true },
            'Create Story',
            'Cancel'
        );

        if (confirmCreate !== 'Create Story') {
            vscode.window.showInformationMessage('Story creation cancelled');
            return;
        }

        // Step 7: Create Jira story
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating Jira Story...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 20, message: 'Creating Jira story...' });

            // Step 6: Create Jira story
            const jiraService = new JiraService(jiraBaseUrl, jiraEmail, jiraApiToken);
            
            const issueData: any = {
                fields: {
                    project: {
                        key: projectKey
                    },
                    summary: storyDetails.summary,
                    description: storyDetails.description,
                    issuetype: {
                        name: 'Story'
                    },
                    priority: {
                        name: priority
                    },
                    ...(storyDetails.storyPoints && {
                        customfield_10016: storyDetails.storyPoints // Story Points (adjust field ID as needed)
                    }),
                    ...(assigneeEmail && {
                        assignee: {
                            emailAddress: assigneeEmail
                        }
                    }),
                    ...(labels.length > 0 && {
                        labels: labels
                    })
                }
            };

            // Add epic link if provided
            if (epicKey) {
                issueData.fields.customfield_10014 = epicKey; // Epic Link (adjust field ID as needed)
            }

            const createdIssue = await jiraService.createIssue(issueData);

            if (!createdIssue || !createdIssue.key) {
                throw new Error('Failed to create Jira story');
            }

            progress.report({ increment: 20, message: 'Creating subtasks...' });

            // Step 7: Create subtasks
            for (const subtask of storyDetails.subtasks) {
                await jiraService.createSubtask(createdIssue.key, subtask.summary, subtask.description);
            }

            progress.report({ increment: 20, message: 'Adding LLD as attachment...' });

            // Step 8: Add comment with acceptance criteria and LLD reference
            const comment = `**Acceptance Criteria:**\n${storyDetails.acceptanceCriteria}\n\n**LLD Document:** ${path.basename(lldFile!.fsPath)}\n\n**Implementation Notes:**\n${storyDetails.implementationNotes}`;
            await jiraService.addComment(createdIssue.key, comment);

            // Step 9: Try to attach LLD file if it's not too large
            try {
                const stats = fs.statSync(lldFile!.fsPath);
                if (stats.size < 10 * 1024 * 1024) { // Less than 10MB
                    await jiraService.addAttachment(createdIssue.key, lldFile!.fsPath);
                }
            } catch (attachError) {
                console.error('Failed to attach LLD file:', attachError);
            }

            progress.report({ increment: 10, message: 'Story created successfully!' });

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('jira.story.created.from.lld', {
                duration: duration.toString(),
                subtaskCount: storyDetails.subtasks.length.toString(),
                storyPoints: storyDetails.storyPoints?.toString() || '0',
                priority: priority,
                hasAssignee: (!!assigneeEmail).toString(),
                hasEpic: (!!epicKey).toString(),
                labelCount: labels.length.toString()
            });

            // Show success message with link to Jira
            const issueUrl = `${jiraBaseUrl}/browse/${createdIssue.key}`;
            const openInBrowser = await vscode.window.showInformationMessage(
                `✅ Jira Story ${createdIssue.key} created successfully!`,
                'Open in Browser',
                'Copy Link'
            );

            if (openInBrowser === 'Open in Browser') {
                await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
            } else if (openInBrowser === 'Copy Link') {
                await vscode.env.clipboard.writeText(issueUrl);
                vscode.window.showInformationMessage('Link copied to clipboard');
            }
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create Jira story: ${error.message}`);
        telemetryService.trackEvent('jira.story.creation.error', {
            error: error.message
        });
    }
}

async function parseLLDFile(fileUri: vscode.Uri): Promise<string | null> {
    const filePath = fileUri.fsPath;
    const ext = path.extname(filePath).toLowerCase();

    try {
        if (ext === '.md' || ext === '.txt') {
            return fs.readFileSync(filePath, 'utf-8');
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else {
            vscode.window.showErrorMessage('Unsupported file format. Please use .md, .txt, or .docx');
            return null;
        }
    } catch (error: any) {
        console.error('Error parsing LLD file:', error);
        return null;
    }
}

interface StoryDetails {
    summary: string;
    description: string;
    acceptanceCriteria: string;
    implementationNotes: string;
    storyPoints: number;
    subtasks: Array<{
        summary: string;
        description: string;
    }>;
}

async function generateStoryDetails(lldContent: string, progress: vscode.Progress<{ increment?: number; message?: string }>): Promise<StoryDetails> {
    progress.report({ increment: 10, message: 'Generating story details...' });

    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    if (models.length === 0) {
        throw new Error('No AI models available');
    }

    const model = models[0];

    // Truncate LLD if too long
    const maxLength = 15000;
    const truncatedLLD = lldContent.length > maxLength 
        ? lldContent.substring(0, maxLength) + '\n\n[Content truncated...]'
        : lldContent;

    const prompt = `You are a technical lead creating a Jira story from a Low-Level Design (LLD) document.

**LLD Document:**
${truncatedLLD}

Generate a comprehensive Jira story with the following components:

1. **Summary** (50-100 characters): A concise story title that captures the main feature/functionality

2. **Description** (2-3 paragraphs): Clear explanation of what needs to be built, why it's important, and the expected outcome

3. **Acceptance Criteria** (5-8 bullet points): Specific, testable criteria that define when the story is complete. Use Given-When-Then format where appropriate.

4. **Implementation Notes** (3-5 bullet points): Key technical considerations, dependencies, or constraints from the LLD

5. **Story Points** (1, 2, 3, 5, 8, 13): Estimate based on complexity, unknowns, and effort

6. **Subtasks** (5-8 subtasks): Break down the work into specific tasks:
   - API endpoint implementation (specific endpoints)
   - Database schema changes (tables/migrations)
   - Service layer implementation
   - Unit tests
   - Integration tests
   - API documentation
   - Error handling
   - Code review

Format as JSON:
{
    "summary": "Implement ACB calculation service with REST API",
    "description": "...",
    "acceptanceCriteria": "- Given a valid employee ID, when the ACB endpoint is called, then it returns calculated ACB value\\n- Given invalid input, when the endpoint is called, then it returns 400 with error details\\n...",
    "implementationNotes": "- Use Spring Boot 3.2 with Java 21\\n- PostgreSQL database with Flyway migrations\\n- JWT authentication required\\n...",
    "storyPoints": 8,
    "subtasks": [
        {
            "summary": "Create ACB calculation REST endpoints",
            "description": "Implement GET /api/acb/{employeeId} and POST /api/acb/batch endpoints with request validation and error handling"
        },
        {
            "summary": "Design and implement database schema",
            "description": "Create acb_calculations table with Flyway migration, add indexes on employee_id and calculation_date"
        },
        {
            "summary": "Implement ACB calculation service logic",
            "description": "Create ACBService with calculation algorithms, business rules validation, and error handling"
        },
        {
            "summary": "Add unit tests for ACB service",
            "description": "Write comprehensive unit tests covering all calculation scenarios, edge cases, and error conditions (target 90% coverage)"
        },
        {
            "summary": "Add integration tests for ACB API",
            "description": "Create integration tests for REST endpoints with TestContainers, validate request/response formats and status codes"
        },
        {
            "summary": "Implement security and authorization",
            "description": "Add JWT validation, implement role-based access control, ensure users can only access their own ACB data"
        },
        {
            "summary": "Add monitoring and logging",
            "description": "Implement structured logging, add metrics for response times and error rates, create alerts for failures"
        },
        {
            "summary": "Update API documentation",
            "description": "Document endpoints in OpenAPI spec, add usage examples, update README with deployment instructions"
        }
    ]
}`;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    progress.report({ increment: 30, message: 'AI analyzing LLD...' });

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullResponse = '';
    for await (const fragment of response.text) {
        fullResponse += fragment;
    }

    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }

    const storyDetails: StoryDetails = JSON.parse(jsonMatch[0]);

    progress.report({ increment: 10, message: 'Story details generated' });

    return storyDetails;
}
