import * as vscode from 'vscode';
import { JiraService, JiraIssue } from '../services/jiraService';
import { AIService } from '../services/aiService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';

/**
 * Analyze a Jira ticket: summarize story and create TODO list
 */
export async function analyzeJiraTicketCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();

    try {
        telemetryService.trackEvent('command.analyzeJiraTicket.started');

        const jiraService = new JiraService();
        const aiService = new AIService();

        // Initialize Jira service
        const initialized = await jiraService.initialize();
        if (!initialized) {
            vscode.window.showWarningMessage('Jira configuration not completed. Please try again.');
            return;
        }

        // Get issue key if not provided
        if (!issueKey) {
            issueKey = await jiraService.promptForIssueKey();
            if (!issueKey) {
                return;
            }
        }

        // Fetch and analyze issue
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${issueKey}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Fetching ticket details...' });
            
            // Fetch issue
            const issue = await jiraService.fetchIssue(issueKey!);
            if (!issue) {
                vscode.window.showErrorMessage(`Failed to fetch ticket: ${issueKey}`);
                return;
            }

            progress.report({ increment: 30, message: 'Analyzing story with AI...' });

            // Generate summary and TODO list
            const analysis = await generateTicketAnalysis(issue, aiService, progress);

            progress.report({ increment: 90, message: 'Creating analysis document...' });

            // Create and display analysis document
            await displayAnalysis(issue, analysis);

            progress.report({ increment: 100, message: 'Analysis complete!' });
        });

        // Track telemetry
        const duration = Date.now() - startTime;
        telemetryService.trackEvent('command.analyzeJiraTicket.completed', {
            duration: duration.toString()
        });

        // Track time saved (estimated 10-15 min to manually analyze and create TODO)
        await telemetryService.trackProductivityMetric(
            'analyzeJiraTicket',
            750, // 12.5 minutes in seconds
            duration / 1000
        );

    } catch (error: any) {
        logger.error('Failed to analyze Jira ticket', error);
        vscode.window.showErrorMessage(`Failed to analyze ticket: ${error.message}`);
        
        telemetryService.trackEvent('command.analyzeJiraTicket.failed', {
            error: error.message
        });
    }
}

interface TicketAnalysis {
    summary: string;
    keyPoints: string[];
    technicalRequirements: string[];
    acceptanceCriteriaList: string[];
    todoList: string[];
    estimatedEffort: string;
    risks: string[];
    dependencies: string[];
}

/**
 * Generate comprehensive ticket analysis using AI
 */
async function generateTicketAnalysis(
    issue: JiraIssue,
    aiService: AIService,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<TicketAnalysis> {
    
    const systemPrompt = `You are a principal engineer analyzing a Jira story to help engineers understand requirements and plan their work.

Provide a comprehensive analysis with:
1. Executive summary (2-3 sentences)
2. Key points (bullet list of main requirements)
3. Technical requirements (specific technical details needed)
4. Acceptance criteria (broken down into testable items)
5. TODO list (step-by-step implementation tasks)
6. Estimated effort (T-shirt size: S/M/L/XL with reasoning)
7. Potential risks (technical challenges or blockers)
8. Dependencies (other tickets, teams, or systems)

Format your response as JSON with these keys: summary, keyPoints, technicalRequirements, acceptanceCriteriaList, todoList, estimatedEffort, risks, dependencies`;

    const prompt = `Analyze this Jira ticket and create a comprehensive implementation plan:

**Ticket:** ${issue.key}
**Type:** ${issue.issueType}
**Priority:** ${issue.priority}
**Status:** ${issue.status}

**Summary:** ${issue.summary}

**Description:**
${issue.description || 'No description provided'}

${issue.acceptanceCriteria ? `\n**Acceptance Criteria:**\n${issue.acceptanceCriteria}` : ''}

Provide detailed analysis to help the engineer understand what needs to be built and how to approach it.`;

    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        
        // Try to parse JSON response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                summary: parsed.summary || 'Analysis summary not available',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                technicalRequirements: Array.isArray(parsed.technicalRequirements) ? parsed.technicalRequirements : [],
                acceptanceCriteriaList: Array.isArray(parsed.acceptanceCriteriaList) ? parsed.acceptanceCriteriaList : [],
                todoList: Array.isArray(parsed.todoList) ? parsed.todoList : [],
                estimatedEffort: parsed.estimatedEffort || 'Not estimated',
                risks: Array.isArray(parsed.risks) ? parsed.risks : [],
                dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : []
            };
        }
    } catch (error) {
        logger.warn('Could not parse AI response as JSON, using fallback analysis');
    }

    // Fallback: basic analysis
    return {
        summary: `Implementation of ${issue.summary}`,
        keyPoints: [
            issue.summary,
            `Type: ${issue.issueType}`,
            `Priority: ${issue.priority}`
        ],
        technicalRequirements: issue.description ? [issue.description.substring(0, 200)] : ['See ticket description'],
        acceptanceCriteriaList: issue.acceptanceCriteria ? issue.acceptanceCriteria.split('\n').filter(Boolean) : ['Review acceptance criteria in ticket'],
        todoList: [
            'Review ticket requirements',
            'Design solution approach',
            'Implement functionality',
            'Write tests',
            'Update documentation'
        ],
        estimatedEffort: 'Medium (M)',
        risks: ['Requires detailed requirement review'],
        dependencies: ['Review with team before starting']
    };
}

/**
 * Display analysis in new document
 */
async function displayAnalysis(issue: JiraIssue, analysis: TicketAnalysis): Promise<void> {
    const content = `# Jira Ticket Analysis: ${issue.key}

**Generated:** ${new Date().toLocaleString()}  
**Ticket:** ${issue.key}  
**Summary:** ${issue.summary}  
**Type:** ${issue.issueType} | **Priority:** ${issue.priority} | **Status:** ${issue.status}

---

## 📋 Executive Summary

${analysis.summary}

---

## 🎯 Key Points

${analysis.keyPoints.map((point, idx) => `${idx + 1}. ${point}`).join('\n')}

---

## 🔧 Technical Requirements

${analysis.technicalRequirements.map((req, idx) => `- ${req}`).join('\n')}

---

## ✅ Acceptance Criteria

${analysis.acceptanceCriteriaList.map((ac, idx) => `- [ ] ${ac}`).join('\n')}

---

## 📝 TODO List

${analysis.todoList.map((task, idx) => `- [ ] **Task ${idx + 1}:** ${task}`).join('\n')}

---

## ⏱️ Estimated Effort

**${analysis.estimatedEffort}**

---

## ⚠️ Potential Risks

${analysis.risks.length > 0 ? analysis.risks.map(risk => `- ${risk}`).join('\n') : '- No significant risks identified'}

---

## 🔗 Dependencies

${analysis.dependencies.length > 0 ? analysis.dependencies.map(dep => `- ${dep}`).join('\n') : '- No dependencies identified'}

---

## 📎 Original Ticket Details

**Description:**
${issue.description || 'No description provided'}

${issue.acceptanceCriteria ? `\n**Acceptance Criteria:**\n${issue.acceptanceCriteria}` : ''}

---

**Assignee:** ${issue.assignee || 'Unassigned'}  
**Reporter:** ${issue.reporter || 'Unknown'}

---

*Generated by DevEx AI Assistant - Jira Ticket Analyzer*
*Use this analysis to plan your implementation and track progress with the TODO list*
`;

    // Create new document
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });

    // Show document
    await vscode.window.showTextDocument(doc, { preview: false });

    // Show completion message with actions
    const action = await vscode.window.showInformationMessage(
        `✅ Ticket Analysis Complete for ${issue.key}!`,
        'Copy TODO List',
        'Open in Jira',
        'Save Analysis'
    );

    if (action === 'Copy TODO List') {
        const todoText = analysis.todoList.map((task, idx) => `${idx + 1}. ${task}`).join('\n');
        await vscode.env.clipboard.writeText(todoText);
        vscode.window.showInformationMessage('TODO list copied to clipboard!');
    } else if (action === 'Open in Jira') {
        // Get Jira base URL from config
        const config = vscode.workspace.getConfiguration('devex.jira');
        const baseUrl = config.get<string>('baseUrl');
        if (baseUrl) {
            const ticketUrl = `${baseUrl}/browse/${issue.key}`;
            await vscode.env.openExternal(vscode.Uri.parse(ticketUrl));
        }
    } else if (action === 'Save Analysis') {
        const fileName = `${issue.key}_Analysis.md`;
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(fileName),
            filters: {
                'Markdown': ['md'],
                'All Files': ['*']
            }
        });
        
        if (saveUri) {
            const edit = new vscode.WorkspaceEdit();
            edit.createFile(saveUri, { overwrite: true });
            await vscode.workspace.applyEdit(edit);
            
            const savedDoc = await vscode.workspace.openTextDocument(saveUri);
            const fullEdit = new vscode.WorkspaceEdit();
            fullEdit.insert(saveUri, new vscode.Position(0, 0), content);
            await vscode.workspace.applyEdit(fullEdit);
            await savedDoc.save();
            
            vscode.window.showInformationMessage(`Analysis saved to ${fileName}`);
        }
    }
}
