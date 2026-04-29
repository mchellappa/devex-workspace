import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { JiraService, JiraIssue, JiraComment, JiraAttachment } from '../services/jiraService';
import { AIService } from '../services/aiService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';
import { analyzeImagesWithVision, ExtractedImage } from '../utils/imageAnalyzer';

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

            // Fetch comments and attachments for diagram analysis
            progress.report({ increment: 10, message: 'Checking for diagrams...' });
            const [comments, attachments] = await Promise.all([
                jiraService.fetchComments(issueKey!),
                jiraService.fetchAttachments(issueKey!)
            ]);

            // Detect Lucidchart links in description and comments
            const diagramLinks = detectDiagramLinks(issue.description, comments);
            
            // Analyze attached diagrams
            let diagramAnalysis = '';
            const imageAttachments = attachments.filter(a => 
                a.mimeType.startsWith('image/') && 
                (a.filename.toLowerCase().includes('diagram') || 
                 a.filename.toLowerCase().includes('architecture') ||
                 a.filename.toLowerCase().includes('lucid') ||
                 a.filename.toLowerCase().includes('flow') ||
                 a.mimeType.includes('png') || 
                 a.mimeType.includes('jpg') || 
                 a.mimeType.includes('jpeg'))
            );

            if (imageAttachments.length > 0) {
                progress.report({ increment: 15, message: `Analyzing ${imageAttachments.length} diagram(s)...` });
                diagramAnalysis = await analyzeDiagramsFromJira(imageAttachments, jiraService);
            } else if (diagramLinks.length > 0) {
                // Show helpful message about exporting Lucidchart (fire and forget - don't wait for user action)
                vscode.window.showInformationMessage(
                    `📊 Found ${diagramLinks.length} Lucidchart link(s)! Attach exported PNG/JPG to Jira for AI analysis.`,
                    'How to Export'
                ).then(action => {
                    if (action === 'How to Export') {
                        // Show second message with instructions (don't await)
                        vscode.window.showInformationMessage(
                            'In Lucidchart: File → Export → PNG/JPEG → Download → Attach to Jira ticket'
                        );
                    }
                });
            }

            progress.report({ increment: 30, message: 'Analyzing story with AI...' });

            // Detect if multi-repo scenario
            progress.report({ message: 'Detecting affected services...' });
            const affectedServices = await detectAffectedServices(issue, aiService, diagramAnalysis);

            let analysis: TicketAnalysis;
            if (affectedServices.length > 1) {
                // Multi-repo scenario
                progress.report({ increment: 40, message: 'Mapping repositories...' });
                const mappedServices = await mapRepositories(affectedServices, progress);
                
                progress.report({ increment: 60, message: 'Generating multi-repo plan...' });
                analysis = await generateMultiRepoAnalysis(issue, mappedServices, aiService, diagramAnalysis);
            } else {
                // Single repo - existing flow
                progress.report({ increment: 60, message: 'Generating TODO list...' });
                analysis = await generateTicketAnalysis(issue, aiService, progress, diagramAnalysis);
            }

            progress.report({ increment: 90, message: 'Creating analysis document...' });

            // Create and display analysis document
            await displayAnalysis(issue, analysis, diagramLinks);

            // Mark as complete to dismiss progress notification
            progress.report({ increment: 100, message: 'Complete!' });
        });

        // Show completion message immediately after progress dismisses
        // This replaces the progress notification
        setTimeout(async () => {
            const action = await vscode.window.showInformationMessage(
                `✅ ${issueKey!} analyzed successfully!`,
                'View Analysis',
                'Copy TODO',
                'Open in Jira'
            );
            
            // Handle actions if user clicks
            if (action === 'Copy TODO') {
                // Find the analysis document and extract TODO
                const visibleEditors = vscode.window.visibleTextEditors;
                const analysisEditor = visibleEditors.find(e => e.document.fileName.includes(issueKey!));
                if (analysisEditor) {
                    const content = analysisEditor.document.getText();
                    const todoMatch = content.match(/## 📋 TODO List[\s\S]*?(?=\n## |$)/);
                    if (todoMatch) {
                        await vscode.env.clipboard.writeText(todoMatch[0]);
                        vscode.window.showInformationMessage('TODO list copied!');
                    }
                }
            } else if (action === 'Open in Jira') {
                const config = vscode.workspace.getConfiguration('devex.jira');
                const baseUrl = config.get<string>('baseUrl');
                if (baseUrl) {
                    await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/browse/${issueKey!}`));
                }
            }
        }, 100); // Small delay to let progress notification dismiss first

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
    isMultiRepo?: boolean;
    affectedServices?: AffectedService[];
    diagramAnalysis?: string;
}

interface AffectedService {
    serviceName: string;
    changes: string[];
    reason: string;
    techStack?: string;
    repoUrl?: string;
    phase?: number;
    dependsOn?: string[];
}

interface RepoMapping {
    serviceName: string;
    repoUrl: string;
    tech: string;
    lastUsed: string;
    usageCount: number;
}

interface DevExConfig {
    version: string;
    lastUpdated: string;
    mappings: { [serviceName: string]: RepoMapping };
}

/**
 * Detect Lucidchart or diagram links in description and comments
 */
function detectDiagramLinks(description: string, comments: JiraComment[]): string[] {
    const links: string[] = [];
    const diagramPatterns = [
        /https?:\/\/lucid\.app\/[^\s)]+/gi,
        /https?:\/\/lucidchart\.com\/[^\s)]+/gi,
        /https?:\/\/[^\s]+diagram[^\s)]+/gi,
        /https?:\/\/[^\s]+architecture[^\s)]+/gi
    ];

    // Check description
    for (const pattern of diagramPatterns) {
        const matches = description.match(pattern);
        if (matches) {
            links.push(...matches);
        }
    }

    // Check comments
    for (const comment of comments) {
        for (const pattern of diagramPatterns) {
            const matches = comment.body.match(pattern);
            if (matches) {
                links.push(...matches);
            }
        }
    }

    return [...new Set(links)]; // Remove duplicates
}

/**
 * Analyze diagram attachments from Jira using vision AI
 */
async function analyzeDiagramsFromJira(
    attachments: JiraAttachment[],
    jiraService: JiraService
): Promise<string> {
    const images: ExtractedImage[] = [];

    for (const attachment of attachments) {
        try {
            logger.info(`Downloading diagram: ${attachment.filename}`);
            const buffer = await jiraService.downloadAttachment(attachment);
            
            if (buffer) {
                images.push({
                    base64: buffer.toString('base64'),
                    contentType: attachment.mimeType,
                    description: attachment.filename
                });
            }
        } catch (error: any) {
            logger.error(`Failed to download ${attachment.filename}: ${error.message}`);
        }
    }

    if (images.length === 0) {
        return '';
    }

    // Use architecture context for diagram analysis
    const analysis = await analyzeImagesWithVision(images, 'architecture');
    return analysis;
}

/**
 * Detect affected services from story description using AI
 */
async function detectAffectedServices(
    issue: JiraIssue,
    aiService: AIService,
    diagramAnalysis?: string
): Promise<AffectedService[]> {
    const systemPrompt = `You are a microservices architect analyzing a Jira story to identify which services/repositories are affected.

Identify:
1. Each service/component that needs changes
2. What changes are needed in each service
3. Why those changes are necessary
4. Likely tech stack (if mentioned or can be inferred)
5. Dependencies between services

Format response as JSON array with: serviceName, changes (array), reason, techStack (optional), dependsOn (array of service names, optional)

If story only affects ONE service/component, return array with single item.
If unclear or seems to be single-component work, return array with single "Current Service" item.`;

    const diagramContext = diagramAnalysis ? `\n\n**Architecture Diagram Analysis:**\n${diagramAnalysis}` : '';

    const prompt = `Analyze this Jira story and identify all affected services/repositories:

**Story:** ${issue.key} - ${issue.summary}

**Description:**
${issue.description || 'No description provided'}

${issue.acceptanceCriteria ? `\n**Acceptance Criteria:**\n${issue.acceptanceCriteria}` : ''}${diagramContext}

Return JSON array of affected services.`;

    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        const jsonMatch = response.content.match(/\[\s*\{\s*[\s\S]*\}\s*\]/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                return parsed.map(s => ({
                    serviceName: s.serviceName || 'Unknown Service',
                    changes: Array.isArray(s.changes) ? s.changes : [s.changes || 'Implement requirements'],
                    reason: s.reason || 'As per story requirements',
                    techStack: s.techStack,
                    dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : []
                }));
            }
        }
    } catch (error) {
        logger.warn('Could not parse service detection response, assuming single service');
    }

    // Fallback: assume single service
    return [{
        serviceName: 'Current Service',
        changes: ['Implement story requirements'],
        reason: 'Single service implementation',
        dependsOn: []
    }];
}

/**
 * Map services to repositories using interactive questionnaire
 */
async function mapRepositories(
    services: AffectedService[],
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<AffectedService[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace open. Skipping repository mapping.');
        return services;
    }

    // Load existing mappings from .devex folder
    const devexPath = path.join(workspaceFolder.uri.fsPath, '.devex');
    const mappingsPath = path.join(devexPath, 'repo-mappings.json');
    
    let config: DevExConfig = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        mappings: {}
    };

    if (fs.existsSync(mappingsPath)) {
        try {
            const data = fs.readFileSync(mappingsPath, 'utf-8');
            config = JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load existing repo mappings, starting fresh');
        }
    }

    // Get current workspace git remote as suggestion
    let currentRepoUrl = '';
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (gitExtension) {
            const git = gitExtension.getAPI(1);
            if (git.repositories.length > 0) {
                const repo = git.repositories[0];
                const remotes = repo.state.remotes;
                if (remotes && remotes.length > 0) {
                    currentRepoUrl = remotes[0].fetchUrl || '';
                }
            }
        }
    } catch (error) {
        logger.warn('Could not detect git remote');
    }

    // Interactive mapping for each service
    const mappedServices: AffectedService[] = [];
    
    for (const service of services) {
        progress.report({ message: `Mapping: ${service.serviceName}...` });

        // Check if we have existing mapping
        const existingMapping = config.mappings[service.serviceName];
        
        let repoUrl = '';
        let tech = service.techStack || 'unknown';

        if (existingMapping) {
            // Suggest from history
            const useExisting = await vscode.window.showQuickPick(
                ['Yes', 'No, enter different URL', 'Skip for now'],
                {
                    placeHolder: `Use existing mapping for "${service.serviceName}"?`,
                    title: `Repository: ${existingMapping.repoUrl} (${existingMapping.tech})`
                }
            );

            if (useExisting === 'Yes') {
                repoUrl = existingMapping.repoUrl;
                tech = existingMapping.tech;
            } else if (useExisting === 'Skip for now') {
                mappedServices.push({ ...service, repoUrl: 'TBD', techStack: tech });
                continue;
            }
        }

        if (!repoUrl) {
            // Ask user for repo location
            const repoChoice = await vscode.window.showQuickPick(
                [
                    { label: '$(folder) Current Workspace', description: currentRepoUrl || 'Detected from git remote' },
                    { label: '$(link) Enter URL', description: 'Paste repository URL' },
                    { label: '$(circle-slash) Skip', description: 'Add to plan as TBD' }
                ],
                {
                    placeHolder: `Where is "${service.serviceName}" code located?`,
                    title: `Map Repository for ${service.serviceName}`
                }
            );

            if (!repoChoice || repoChoice.label.includes('Skip')) {
                mappedServices.push({ ...service, repoUrl: 'TBD', techStack: tech });
                continue;
            }

            if (repoChoice.label.includes('Current Workspace')) {
                repoUrl = currentRepoUrl;
            } else {
                // Enter URL
                const urlInput = await vscode.window.showInputBox({
                    prompt: `Enter repository URL for "${service.serviceName}"`,
                    placeHolder: 'https://dev.azure.com/org/project/_git/repo OR org/project/repo',
                    validateInput: (value) => {
                        if (!value) {
                            return 'Repository URL is required';
                        }
                        return null;
                    }
                });

                if (!urlInput) {
                    mappedServices.push({ ...service, repoUrl: 'TBD', techStack: tech });
                    continue;
                }

                repoUrl = urlInput;
            }

            // Ask for tech stack if not already known
            if (!service.techStack) {
                const techChoice = await vscode.window.showQuickPick(
                    ['Spring Boot', '.NET Core', 'Node.js', 'Python', 'Unknown'],
                    {
                        placeHolder: `Tech stack for "${service.serviceName}"?`,
                        title: 'Select Technology'
                    }
                );
                tech = techChoice?.toLowerCase().replace(/\s+/g, '-') || 'unknown';
            }
        }

        // Save mapping
        config.mappings[service.serviceName] = {
            serviceName: service.serviceName,
            repoUrl,
            tech,
            lastUsed: new Date().toISOString(),
            usageCount: (existingMapping?.usageCount || 0) + 1
        };

        mappedServices.push({
            ...service,
            repoUrl,
            techStack: tech
        });
    }

    // Save updated mappings to .devex folder
    try {
        if (!fs.existsSync(devexPath)) {
            fs.mkdirSync(devexPath, { recursive: true });
        }

        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(mappingsPath, JSON.stringify(config, null, 2), 'utf-8');

        // Create README if it doesn't exist
        const readmePath = path.join(devexPath, 'README.md');
        if (!fs.existsSync(readmePath)) {
            const readmeContent = `# .devex Knowledge Folder

This folder stores DevEx extension knowledge and configuration.

## Files

- **repo-mappings.json**: Service name → repository URL mappings
- **story-plans/**: Generated multi-repo story plans

## Purpose

The extension learns from your input over time:
- First time: You manually map services to repositories
- Next time: Extension suggests from history
- Gets smarter with each story

## Sharing

Commit this folder to git so your team benefits from shared knowledge!
`;
            fs.writeFileSync(readmePath, readmeContent, 'utf-8');
        }

        logger.info(`Saved repository mappings to ${mappingsPath}`);
    } catch (error) {
        logger.error('Failed to save repository mappings', error);
    }

    return mappedServices;
}

/**
 * Generate multi-repo analysis with phases and dependencies
 */
async function generateMultiRepoAnalysis(
    issue: JiraIssue,
    services: AffectedService[],
    aiService: AIService,
    diagramAnalysis?: string
): Promise<TicketAnalysis> {
    const systemPrompt = `You are a technical lead planning a multi-repository story implementation.

Given the affected services and their changes, create:
1. Implementation phases (which services can be done in parallel, which are sequential)
2. Estimated effort per service
3. Overall risks
4. Suggested Jira subtasks

Format as JSON with: phases (array of {phaseName, services: array of service names, canStartImmediately: boolean}), effortEstimates (object with service names as keys), risks (array), suggestedSubtasks (array of {title, service})`;

    const servicesDesc = services.map(s => 
        `**${s.serviceName}** (${s.techStack || 'unknown'}):\n- Repo: ${s.repoUrl || 'TBD'}\n- Changes: ${s.changes.join(', ')}\n- Reason: ${s.reason}\n- Depends on: ${s.dependsOn?.join(', ') || 'None'}`
    ).join('\n\n');

    const prompt = `Plan implementation for this multi-repo story:

**Story:** ${issue.key} - ${issue.summary}

**Affected Services:**
${servicesDesc}

Create implementation plan with phases and dependencies.`;

    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Assign phases based on AI analysis
            const phasesData = parsed.phases || [];
            services.forEach(service => {
                const phaseIndex = phasesData.findIndex((p: any) => 
                    p.services?.includes(service.serviceName)
                );
                service.phase = phaseIndex >= 0 ? phaseIndex + 1 : 1;
            });

            return {
                summary: `Multi-repo implementation across ${services.length} services`,
                keyPoints: services.map(s => `${s.serviceName}: ${s.reason}`),
                technicalRequirements: services.flatMap(s => s.changes),
                acceptanceCriteriaList: issue.acceptanceCriteria?.split('\n').filter(Boolean) || ['All services updated and integrated'],
                todoList: parsed.suggestedSubtasks?.map((t: any) => t.title) || services.map(s => `Implement ${s.serviceName}`),
                estimatedEffort: `${services.length} services - coordinate with teams`,
                risks: Array.isArray(parsed.risks) ? parsed.risks : ['Service integration complexity', 'Deployment coordination'],
                dependencies: services.filter(s => s.dependsOn && s.dependsOn.length > 0).map(s => `${s.serviceName} depends on ${s.dependsOn?.join(', ')}`),
                isMultiRepo: true,
                affectedServices: services,
                diagramAnalysis
            };
        }
    } catch (error) {
        logger.warn('Could not parse multi-repo analysis, using fallback');
    }

    // Fallback: basic multi-repo analysis
    return {
        summary: `Multi-repo implementation across ${services.length} services`,
        keyPoints: services.map(s => `${s.serviceName}: ${s.reason}`),
        technicalRequirements: services.flatMap(s => s.changes),
        acceptanceCriteriaList: ['All services updated successfully', 'Integration tests pass', 'Changes deployed to all environments'],
        todoList: services.map(s => `Implement changes in ${s.serviceName}`),
        estimatedEffort: `${services.length} repositories - Large (L)`,
        risks: ['Multi-repo coordination', 'Service dependencies', 'Deployment synchronization'],
        dependencies: services.map(s => s.serviceName),
        isMultiRepo: true,
        affectedServices: services,
        diagramAnalysis
    };
}

/**
 * Generate comprehensive ticket analysis using AI
 */
async function generateTicketAnalysis(
    issue: JiraIssue,
    aiService: AIService,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    diagramAnalysis?: string
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
async function displayAnalysis(issue: JiraIssue, analysis: TicketAnalysis, diagramLinks?: string[]): Promise<void> {
    let content: string;

    if (analysis.isMultiRepo && analysis.affectedServices && analysis.affectedServices.length > 1) {
        // Multi-repo plan format
        content = generateMultiRepoPlan(issue, analysis);
    } else {
        // Single-repo TODO format
        content = generateSingleRepoPlan(issue, analysis);
    }

    // Create new document
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });

    // Show document
    await vscode.window.showTextDocument(doc, { preview: false });

    // Save to .devex/story-plans if multi-repo
    if (analysis.isMultiRepo && analysis.affectedServices && analysis.affectedServices.length > 1) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            try {
                const planDir = path.join(workspaceFolder.uri.fsPath, '.devex', 'story-plans');
                if (!fs.existsSync(planDir)) {
                    fs.mkdirSync(planDir, { recursive: true });
                }
                const planPath = path.join(planDir, `${issue.key}-plan.md`);
                fs.writeFileSync(planPath, content, 'utf-8');
                logger.info(`Saved multi-repo plan to ${planPath}`);
            } catch (error) {
                logger.error('Failed to save plan to .devex folder', error);
            }
        }
    }

    // Note: Completion message is now shown by the main command function
    // to allow progress notification to dismiss properly
}

/**
 * Generate multi-repo plan markdown
 */
function generateMultiRepoPlan(issue: JiraIssue, analysis: TicketAnalysis): string {
    const services = analysis.affectedServices || [];
    
    // Group services by phase
    const phases = new Map<number, AffectedService[]>();
    services.forEach(service => {
        const phase = service.phase || 1;
        if (!phases.has(phase)) {
            phases.set(phase, []);
        }
        phases.get(phase)!.push(service);
    });

    // Generate repositories section
    const reposSection = services.map((service, idx) => {
        const changes = service.changes.map(c => `    - [ ] ${c}`).join('\n');
        const deps = service.dependsOn && service.dependsOn.length > 0 
            ? `\n  - **Dependencies:** ⚠️ Requires ${service.dependsOn.join(', ')} completed first`
            : '\n  - **Dependencies:** None (can start immediately)';
        
        return `### ${idx + 1}. ${service.serviceName}
  - **Repository:** ${service.repoUrl || 'TBD'}
  - **Tech Stack:** ${service.techStack || 'Unknown'}
  - **Changes:**
${changes}
  - **Reason:** ${service.reason}${deps}`;
    }).join('\n\n');

    // Generate implementation order section
    const phasesSorted = Array.from(phases.entries()).sort((a, b) => a[0] - b[0]);
    const orderSection = phasesSorted.map(([phaseNum, phaseServices]) => {
        const canStart = phaseServices.every(s => !s.dependsOn || s.dependsOn.length === 0);
        const phaseType = canStart ? 'Parallel' : 'Sequential';
        const phaseIcon = canStart ? '✅' : '⏸️';
        const serviceList = phaseServices.map(s => 
            `  ${phaseNum}. ${s.serviceName} ${canStart ? '✅ Can start now' : '⏸️ Wait for dependencies'}`
        ).join('\n');
        
        return `**Phase ${phaseNum} - ${phaseType}:**\n${serviceList}`;
    }).join('\n\n');

    // Generate suggested subtasks
    const subtasksSection = services.map((service, idx) => 
        `- [ ] ${issue.key}-${idx + 1}: Implement ${service.serviceName}`
    ).join('\n');

    // Add diagram analysis section if available
    const diagramSection = analysis.diagramAnalysis ? `

---

## 📊 Architecture Diagram Analysis

${analysis.diagramAnalysis}

` : '';

    return `# Multi-Repo Story Plan: ${issue.key}

**Story:** ${issue.summary}  
**Generated:** ${new Date().toLocaleString()}  
**Type:** ${issue.issueType} | **Priority:** ${issue.priority}

---

## 📋 Executive Summary

${analysis.summary}
${diagramSection}
---

## 🎯 Story Overview

${analysis.keyPoints.map((point, idx) => `${idx + 1}. ${point}`).join('\n')}

---

## 📦 Affected Repositories (${services.length})

${reposSection}

---

## 🔄 Implementation Order

${orderSection}

---

## ✅ Acceptance Criteria

${analysis.acceptanceCriteriaList.map(ac => `- [ ] ${ac}`).join('\n')}

---

## 📝 Suggested Jira Subtasks

${subtasksSection}

---

## ⏱️ Estimated Effort

**${analysis.estimatedEffort}**

${services.map(s => `- ${s.serviceName}: Medium (per service)`).join('\n')}

---

## ⚠️ Risks & Challenges

${analysis.risks.map(risk => `- ${risk}`).join('\n')}

---

## 🔗 Dependencies

${analysis.dependencies.length > 0 ? analysis.dependencies.map(dep => `- ${dep}`).join('\n') : '- No cross-service dependencies'}

---

## 📎 Original Story

**Description:**
${issue.description || 'No description provided'}

${issue.acceptanceCriteria ? `\n**Acceptance Criteria:**\n${issue.acceptanceCriteria}` : ''}

---

## 💡 Next Steps

1. Review this plan with your team
2. Create Jira subtasks (one per repository)
3. Assign subtasks to appropriate teams
4. Clone repositories and create feature branches
5. Implement changes following the phase order
6. Coordinate integration testing
7. Deploy in sequence (respect dependencies)

---

*Generated by DevEx AI Assistant - Multi-Repo Story Planner*  
*Plan saved to .devex/story-plans/${issue.key}-plan.md*
`;
}

/**
 * Generate single-repo TODO markdown
 */
function generateSingleRepoPlan(issue: JiraIssue, analysis: TicketAnalysis): string {
    return `# Jira Ticket Analysis: ${issue.key}

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
}
