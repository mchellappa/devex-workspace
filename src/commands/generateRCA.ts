import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface RCAContext {
    incidentId?: string;
    incidentTitle: string;
    incidentDate: string;
    severity: string;
    incidentType: string;
    analyst: string;
    
    // Incident details
    description: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    systemsAffected?: string;
    
    // Timeline
    startTime: string;
    detectionTime: string;
    mitigationTime?: string;
    resolutionTime: string;
    
    // Calculated metrics
    ttdMinutes?: number;
    ttmMinutes?: number;
    ttrMinutes?: number;
    totalDowntime?: number;
    
    // Notes
    startNotes?: string;
    detectionNotes?: string;
    mitigationNotes?: string;
    resolutionNotes?: string;
    
    // Impact
    technicalImpact?: string;
    businessImpact?: string;
    usersAffected?: string;
    transactionsLost?: string;
    revenueImpact?: string;
    slaImpact?: string;
    
    // RCA
    rcaMethodology?: string;
    rcaAnalysisContent?: string;
    immediateCause?: string;
    rootCause?: string;
    contributingFactors?: string;
    
    // Resolution
    resolutionActions?: string;
    temporaryWorkarounds?: string;
    
    // Action items
    shortTermActions?: string;
    longTermActions?: string;
    
    // Lessons learned
    whatWentWell?: string;
    whatWentPoorly?: string;
    whatShouldChange?: string;
    technicalInsights?: string;
    
    // References
    relatedDocs?: string;
    logsEvidence?: string;
    externalRefs?: string;
}

export async function generateRCA(context: vscode.ExtensionContext): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Root Cause Analysis...',
            cancellable: false
        }, async (progress) => {
            const rcaContext: RCAContext = {
                incidentTitle: '',
                incidentDate: new Date().toISOString().split('T')[0],
                severity: 'P2',
                incidentType: 'Production',
                analyst: '',
                description: '',
                startTime: '',
                detectionTime: '',
                resolutionTime: ''
            };

            // Step 1: Gather incident basics
            progress.report({ increment: 10, message: 'Gathering incident details...' });
            await gatherIncidentBasics(rcaContext);

            // Step 2: Gather timeline
            progress.report({ increment: 20, message: 'Building incident timeline...' });
            await gatherTimeline(rcaContext);
            calculateMetrics(rcaContext);

            // Step 3: Gather impact assessment
            progress.report({ increment: 30, message: 'Assessing impact...' });
            await gatherImpactAssessment(rcaContext);

            // Step 4: AI-assisted root cause analysis
            progress.report({ increment: 40, message: 'Performing root cause analysis...' });
            await performRootCauseAnalysis(rcaContext);

            // Step 5: Gather resolution actions
            progress.report({ increment: 60, message: 'Documenting resolution...' });
            await gatherResolutionActions(rcaContext);

            // Step 6: Gather action items
            progress.report({ increment: 70, message: 'Creating action items...' });
            await gatherActionItems(rcaContext);

            // Step 7: Gather lessons learned
            progress.report({ increment: 80, message: 'Documenting lessons learned...' });
            await gatherLessonsLearned(rcaContext);

            // Step 8: Generate RCA document
            progress.report({ increment: 90, message: 'Generating RCA document...' });
            await generateRCADocument(rcaContext, context);

            progress.report({ increment: 100, message: 'Complete!' });
        });

        vscode.window.showInformationMessage('✅ RCA document generated successfully!');
    } catch (error) {
        console.error('Error generating RCA:', error);
        vscode.window.showErrorMessage(`Failed to generate RCA: ${error}`);
    }
}

async function gatherIncidentBasics(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaIncidentBasics',
        'RCA: Incident Basics',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getIncidentBasicsWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitBasics') {
                    rcaContext.incidentId = message.data.incidentId;
                    rcaContext.incidentTitle = message.data.incidentTitle;
                    rcaContext.incidentDate = message.data.incidentDate;
                    rcaContext.severity = message.data.severity;
                    rcaContext.incidentType = message.data.incidentType;
                    rcaContext.analyst = message.data.analyst;
                    rcaContext.description = message.data.description;
                    rcaContext.expectedBehavior = message.data.expectedBehavior;
                    rcaContext.actualBehavior = message.data.actualBehavior;
                    rcaContext.systemsAffected = message.data.systemsAffected;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

async function gatherTimeline(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaTimeline',
        'RCA: Incident Timeline',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getTimelineWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitTimeline') {
                    rcaContext.startTime = message.data.startTime;
                    rcaContext.detectionTime = message.data.detectionTime;
                    rcaContext.mitigationTime = message.data.mitigationTime;
                    rcaContext.resolutionTime = message.data.resolutionTime;
                    rcaContext.startNotes = message.data.startNotes;
                    rcaContext.detectionNotes = message.data.detectionNotes;
                    rcaContext.mitigationNotes = message.data.mitigationNotes;
                    rcaContext.resolutionNotes = message.data.resolutionNotes;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

function calculateMetrics(rcaContext: RCAContext): void {
    try {
        const start = new Date(rcaContext.startTime);
        const detection = new Date(rcaContext.detectionTime);
        const resolution = new Date(rcaContext.resolutionTime);

        rcaContext.ttdMinutes = Math.round((detection.getTime() - start.getTime()) / 60000);
        rcaContext.ttrMinutes = Math.round((resolution.getTime() - start.getTime()) / 60000);
        rcaContext.totalDowntime = rcaContext.ttrMinutes;

        if (rcaContext.mitigationTime) {
            const mitigation = new Date(rcaContext.mitigationTime);
            rcaContext.ttmMinutes = Math.round((mitigation.getTime() - start.getTime()) / 60000);
        }
    } catch (error) {
        console.error('Error calculating metrics:', error);
    }
}

async function gatherImpactAssessment(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaImpact',
        'RCA: Impact Assessment',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getImpactWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitImpact') {
                    rcaContext.technicalImpact = message.data.technicalImpact;
                    rcaContext.businessImpact = message.data.businessImpact;
                    rcaContext.usersAffected = message.data.usersAffected;
                    rcaContext.transactionsLost = message.data.transactionsLost;
                    rcaContext.revenueImpact = message.data.revenueImpact;
                    rcaContext.slaImpact = message.data.slaImpact;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

async function performRootCauseAnalysis(rcaContext: RCAContext): Promise<void> {
    // Determine methodology based on AI assessment of complexity
    const methodology = await determineRCAMethodology(rcaContext);
    rcaContext.rcaMethodology = methodology;

    if (methodology === '5 Whys') {
        await perform5WhysAnalysis(rcaContext);
    } else {
        await performFishboneAnalysis(rcaContext);
    }
}

async function determineRCAMethodology(rcaContext: RCAContext): Promise<string> {
    try {
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        if (models.length === 0) {
            return '5 Whys'; // Default fallback
        }

        const model = models[0];
        const prompt = `You are an incident analysis expert. Based on this incident description, determine if this is a SIMPLE incident (use 5 Whys) or COMPLEX incident (use Fishbone Diagram).

Incident: ${rcaContext.incidentTitle}
Description: ${rcaContext.description}
Systems Affected: ${rcaContext.systemsAffected}

Respond with ONLY "5 Whys" or "Fishbone" based on complexity.

Simple incidents (use 5 Whys):
- Single system failure
- Configuration error
- Simple bug or code issue
- Clear single cause

Complex incidents (use Fishbone):
- Multiple systems involved
- Multiple contributing factors
- People/process/technology issues
- Cascading failures`;

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let fullResponse = '';
        for await (const fragment of response.text) {
            fullResponse += fragment;
        }

        return fullResponse.toLowerCase().includes('fishbone') ? 'Fishbone Diagram' : '5 Whys';
    } catch (error) {
        console.error('Error determining methodology:', error);
        return '5 Whys'; // Default fallback
    }
}

async function perform5WhysAnalysis(rcaContext: RCAContext): Promise<void> {
    try {
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        if (models.length === 0) {
            throw new Error('No AI models available');
        }

        const model = models[0];
        const prompt = `You are an expert in root cause analysis using the 5 Whys technique.

Incident: ${rcaContext.incidentTitle}
Description: ${rcaContext.description}
What happened: ${rcaContext.actualBehavior}
Expected: ${rcaContext.expectedBehavior}

Perform a 5 Whys analysis. Start with the problem statement and ask "Why?" 5 times to reach the root cause.

Format your response as:
**Problem**: [The initial problem]

**Why 1**: Why did [problem] happen?
**Answer**: [Immediate cause]

**Why 2**: Why did [immediate cause] happen?
**Answer**: [Contributing factor 1]

**Why 3**: Why did [contributing factor 1] happen?
**Answer**: [Contributing factor 2]

**Why 4**: Why did [contributing factor 2] happen?
**Answer**: [Underlying issue]

**Why 5**: Why did [underlying issue] happen?
**Answer**: [ROOT CAUSE]

Then summarize:
- **Immediate Cause**: [Direct trigger]
- **Root Cause**: [Fundamental issue to fix]
- **Contributing Factors**: [List other factors that made it worse]`;

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let fullResponse = '';
        for await (const fragment of response.text) {
            fullResponse += fragment;
        }

        rcaContext.rcaAnalysisContent = fullResponse;

        // Extract immediate cause, root cause, and contributing factors
        const immediateCauseMatch = fullResponse.match(/\*\*Immediate Cause\*\*:\s*(.+?)(?=\n\*\*|$)/s);
        const rootCauseMatch = fullResponse.match(/\*\*Root Cause\*\*:\s*(.+?)(?=\n\*\*|$)/s);
        const contributingFactorsMatch = fullResponse.match(/\*\*Contributing Factors\*\*:\s*(.+?)$/s);

        if (immediateCauseMatch) {rcaContext.immediateCause = immediateCauseMatch[1].trim();
        }
        if (rootCauseMatch) {
            rcaContext.rootCause = rootCauseMatch[1].trim();
        }
        if (contributingFactorsMatch) {
            rcaContext.contributingFactors = contributingFactorsMatch[1].trim();
        }
    } catch (error) {
        console.error('Error performing 5 Whys analysis:', error);
        rcaContext.rcaAnalysisContent = '[AI analysis failed. Please manually document root cause analysis.]';
    }
}

async function performFishboneAnalysis(rcaContext: RCAContext): Promise<void> {
    try {
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        if (models.length === 0) {
            throw new Error('No AI models available');
        }

        const model = models[0];
        const prompt = `You are an expert in root cause analysis using Fishbone (Ishikawa) Diagrams.

Incident: ${rcaContext.incidentTitle}
Description: ${rcaContext.description}
What happened: ${rcaContext.actualBehavior}
Expected: ${rcaContext.expectedBehavior}

Perform a Fishbone Diagram analysis categorizing causes into: People, Process, Technology, and Environment.

Format your response as:

### Fishbone Diagram Analysis

**Problem Statement**: [What went wrong]

#### 👥 People Factors
- [Contributing factor related to people/training/communication]
- [Another people factor]

#### 📋 Process Factors
- [Contributing factor related to procedures/documentation/workflows]
- [Another process factor]

#### 💻 Technology Factors
- [Contributing factor related to systems/tools/infrastructure]
- [Another technology factor]

#### 🌍 Environment Factors
- [Contributing factor related to external dependencies/timing/conditions]
- [Another environment factor]

Then summarize:
- **Immediate Cause**: [Direct trigger]
- **Root Cause**: [Most significant underlying issue]
- **Contributing Factors**: [Bullet list of all factors from categories above]`;

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let fullResponse = '';
        for await (const fragment of response.text) {
            fullResponse += fragment;
        }

        rcaContext.rcaAnalysisContent = fullResponse;

        // Extract causes
        const immediateCauseMatch = fullResponse.match(/\*\*Immediate Cause\*\*:\s*(.+?)(?=\n\*\*|$)/s);
        const rootCauseMatch = fullResponse.match(/\*\*Root Cause\*\*:\s*(.+?)(?=\n\*\*|$)/s);
        const contributingFactorsMatch = fullResponse.match(/\*\*Contributing Factors\*\*:\s*(.+?)$/s);

        if (immediateCauseMatch) {
            rcaContext.immediateCause = immediateCauseMatch[1].trim();
        }
        if (rootCauseMatch) {
            rcaContext.rootCause = rootCauseMatch[1].trim();
        }
        if (contributingFactorsMatch) {
            rcaContext.contributingFactors = contributingFactorsMatch[1].trim();
        }
    } catch (error) {
        console.error('Error performing Fishbone analysis:', error);
        rcaContext.rcaAnalysisContent = '[AI analysis failed. Please manually document root cause analysis.]';
    }
}

async function gatherResolutionActions(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaResolution',
        'RCA: Resolution Actions',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getResolutionWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitResolution') {
                    rcaContext.resolutionActions = message.data.resolutionActions;
                    rcaContext.temporaryWorkarounds = message.data.temporaryWorkarounds;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

async function gatherActionItems(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaActionItems',
        'RCA: Action Items',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getActionItemsWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitActionItems') {
                    rcaContext.shortTermActions = message.data.shortTermActions;
                    rcaContext.longTermActions = message.data.longTermActions;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

async function gatherLessonsLearned(rcaContext: RCAContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'rcaLessons',
        'RCA: Lessons Learned',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getLessonsLearnedWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submitLessons') {
                    rcaContext.whatWentWell = message.data.whatWentWell;
                    rcaContext.whatWentPoorly = message.data.whatWentPoorly;
                    rcaContext.whatShouldChange = message.data.whatShouldChange;
                    rcaContext.technicalInsights = message.data.technicalInsights;
                    rcaContext.relatedDocs = message.data.relatedDocs;
                    rcaContext.logsEvidence = message.data.logsEvidence;
                    rcaContext.externalRefs = message.data.externalRefs;
                    panel.dispose();
                    resolve();
                }
            }
        );
    });
}

async function generateRCADocument(rcaContext: RCAContext, context: vscode.ExtensionContext): Promise<void> {
    const templatePath = path.join(context.extensionPath, 'templates', 'rca', 'RCA_Template.md');
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace all placeholders
    const replacements: { [key: string]: string } = {
        '{INCIDENT_ID}': rcaContext.incidentId || 'N/A',
        '{INCIDENT_TITLE}': rcaContext.incidentTitle,
        '{INCIDENT_DATE}': rcaContext.incidentDate,
        '{SEVERITY}': rcaContext.severity,
        '{INCIDENT_TYPE}': rcaContext.incidentType,
        '{STATUS}': 'Resolved',
        '{ANALYST}': rcaContext.analyst,
        '{INCIDENT_DESCRIPTION}': rcaContext.description,
        '{EXPECTED_BEHAVIOR}': rcaContext.expectedBehavior || 'N/A',
        '{ACTUAL_BEHAVIOR}': rcaContext.actualBehavior || 'N/A',
        '{SYSTEMS_AFFECTED}': rcaContext.systemsAffected || 'N/A',
        '{START_TIME}': rcaContext.startTime,
        '{DETECTION_TIME}': rcaContext.detectionTime,
        '{MITIGATION_TIME}': rcaContext.mitigationTime || 'N/A',
        '{RESOLUTION_TIME}': rcaContext.resolutionTime,
        '{START_NOTES}': rcaContext.startNotes || '-',
        '{DETECTION_NOTES}': rcaContext.detectionNotes || '-',
        '{MITIGATION_NOTES}': rcaContext.mitigationNotes || '-',
        '{RESOLUTION_NOTES}': rcaContext.resolutionNotes || '-',
        '{TTD_MINUTES}': rcaContext.ttdMinutes?.toString() || '0',
        '{TTM_MINUTES}': rcaContext.ttmMinutes?.toString() || '0',
        '{TTR_MINUTES}': rcaContext.ttrMinutes?.toString() || '0',
        '{TOTAL_DOWNTIME}': rcaContext.totalDowntime?.toString() || '0',
        '{TECHNICAL_IMPACT}': rcaContext.technicalImpact || 'N/A',
        '{BUSINESS_IMPACT}': rcaContext.businessImpact || 'N/A',
        '{USERS_AFFECTED}': rcaContext.usersAffected || '0',
        '{TRANSACTIONS_LOST}': rcaContext.transactionsLost || '0',
        '{REVENUE_IMPACT}': rcaContext.revenueImpact || '$0',
        '{SLA_IMPACT}': rcaContext.slaImpact || 'None',
        '{RCA_METHODOLOGY}': `**${rcaContext.rcaMethodology}**`,
        '{RCA_ANALYSIS_CONTENT}': rcaContext.rcaAnalysisContent || '',
        '{IMMEDIATE_CAUSE}': rcaContext.immediateCause || '[Not identified]',
        '{ROOT_CAUSE}': rcaContext.rootCause || '[Not identified]',
        '{CONTRIBUTING_FACTORS}': rcaContext.contributingFactors || 'None identified',
        '{RESOLUTION_ACTIONS}': rcaContext.resolutionActions || 'None documented',
        '{TEMPORARY_WORKAROUNDS}': rcaContext.temporaryWorkarounds || 'None applied',
        '{SHORT_TERM_ACTIONS}': rcaContext.shortTermActions || 'None defined',
        '{LONG_TERM_ACTIONS}': rcaContext.longTermActions || 'None defined',
        '{WHAT_WENT_WELL}': rcaContext.whatWentWell || 'To be determined',
        '{WHAT_WENT_POORLY}': rcaContext.whatWentPoorly || 'To be determined',
        '{WHAT_SHOULD_CHANGE}': rcaContext.whatShouldChange || 'To be determined',
        '{TECHNICAL_INSIGHTS}': rcaContext.technicalInsights || 'None documented',
        '{RELATED_DOCS}': rcaContext.relatedDocs || 'None',
        '{LOGS_EVIDENCE}': rcaContext.logsEvidence || 'None attached',
        '{EXTERNAL_REFS}': rcaContext.externalRefs || 'None',
        '{INCIDENT_LEAD}': rcaContext.analyst,
        '{TECH_REVIEWER}': '[To be assigned]',
        '{MANAGER}': '[To be assigned]',
        '{SIGNOFF_DATE}': new Date().toISOString().split('T')[0],
        '{REVIEW_DATE}': '[Pending]',
        '{APPROVAL_DATE}': '[Pending]',
        '{GENERATION_DATE}': new Date().toLocaleString()
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }

    // Save RCA document
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    const rcaFolderPath = path.join(workspaceFolder.uri.fsPath, 'rca');
    if (!fs.existsSync(rcaFolderPath)) {
        fs.mkdirSync(rcaFolderPath, { recursive: true });
    }

    const sanitizedTitle = rcaContext.incidentTitle.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const fileName = `RCA-${rcaContext.incidentDate}-${sanitizedTitle}.md`;
    const filePath = path.join(rcaFolderPath, fileName);

    fs.writeFileSync(filePath, template, 'utf-8');

    // Open the document
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

// Webview HTML generators
function getIncidentBasicsWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            input, select, textarea { 
                width: 100%; 
                padding: 8px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            textarea { 
                min-height: 80px; 
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .required::after { content: " *"; color: red; }
        </style>
    </head>
    <body>
        <h2>📋 Incident Basics</h2>
        <p>Please provide the basic details about the incident.</p>
        
        <div class="form-group">
            <label for="incidentId">Incident ID (Optional):</label>
            <input type="text" id="incidentId" placeholder="e.g., INC-12345, PROD-001">
        </div>

        <div class="form-group">
            <label for="incidentTitle" class="required">Incident Title:</label>
            <input type="text" id="incidentTitle" placeholder="e.g., Database connection pool exhaustion" required>
        </div>

        <div class="form-group">
            <label for="incidentDate" class="required">Incident Date:</label>
            <input type="date" id="incidentDate" required>
        </div>

        <div class="form-group">
            <label for="severity" class="required">Severity:</label>
            <select id="severity" required>
                <option value="P0">P0 - Critical (Complete outage)</option>
                <option value="P1">P1 - High (Major functionality impaired)</option>
                <option value="P2" selected>P2 - Medium (Moderate impact)</option>
                <option value="P3">P3 - Low (Minor impact)</option>
                <option value="P4">P4 - Informational</option>
            </select>
        </div>

        <div class="form-group">
            <label for="incidentType" class="required">Incident Type:</label>
            <select id="incidentType" required>
                <option value="Production" selected>Production</option>
                <option value="Development">Development / Testing</option>
                <option value="Data">Data Incident</option>
            </select>
        </div>

        <div class="form-group">
            <label for="analyst" class="required">Your Name (RCA Lead):</label>
            <input type="text" id="analyst" placeholder="e.g., John Doe" required>
        </div>

        <div class="form-group">
            <label for="description" class="required">What Happened? (Brief Description):</label>
            <textarea id="description" placeholder="Describe the incident in 2-3 sentences..." required></textarea>
        </div>

        <div class="form-group">
            <label for="expectedBehavior">Expected Behavior:</label>
            <textarea id="expectedBehavior" placeholder="What should have happened?"></textarea>
        </div>

        <div class="form-group">
            <label for="actualBehavior">Actual Behavior:</label>
            <textarea id="actualBehavior" placeholder="What actually happened?"></textarea>
        </div>

        <div class="form-group">
            <label for="systemsAffected">Systems/Services Affected:</label>
            <textarea id="systemsAffected" placeholder="e.g., Payment Service, User Database, API Gateway"></textarea>
        </div>

        <button onclick="submitBasics()">Next: Timeline ➡️</button>

        <script>
            const vscode = acquireVsCodeApi();

            // Set today's date as default
            document.getElementById('incidentDate').valueAsDate = new Date();

            function submitBasics() {
                const incidentTitle = document.getElementById('incidentTitle').value;
                if (!incidentTitle) {
                    alert('Please provide an incident title');
                    return;
                }

                vscode.postMessage({
                    command: 'submitBasics',
                    data: {
                        incidentId: document.getElementById('incidentId').value,
                        incidentTitle: incidentTitle,
                        incidentDate: document.getElementById('incidentDate').value,
                        severity: document.getElementById('severity').value,
                        incidentType: document.getElementById('incidentType').value,
                        analyst: document.getElementById('analyst').value,
                        description: document.getElementById('description').value,
                        expectedBehavior: document.getElementById('expectedBehavior').value,
                        actualBehavior: document.getElementById('actualBehavior').value,
                        systemsAffected: document.getElementById('systemsAffected').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}

function getTimelineWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            input, textarea { 
                width: 100%; 
                padding: 8px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            textarea { 
                min-height: 60px; 
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .info-box {
                background-color: var(--vscode-textBlockQuote-background);
                border-left: 4px solid var(--vscode-textBlockQuote-border);
                padding: 10px;
                margin-bottom: 20px;
            }
            .timeline-item {
                margin-bottom: 25px;
                padding: 15px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
            }
            .required::after { content: " *"; color: red; }
        </style>
    </head>
    <body>
        <h2>📅 Incident Timeline</h2>
        <div class="info-box">
            💡 Provide timestamps for key events. We'll automatically calculate TTD, TTM, and TTR metrics.
        </div>
        
        <div class="timeline-item">
            <div class="form-group">
                <label for="startTime" class="required">Incident Started:</label>
                <input type="datetime-local" id="startTime" required>
            </div>
            <div class="form-group">
                <label for="startNotes">Notes:</label>
                <textarea id="startNotes" placeholder="When did the incident actually occur?"></textarea>
            </div>
        </div>

        <div class="timeline-item">
            <div class="form-group">
                <label for="detectionTime" class="required">Detected:</label>
                <input type="datetime-local" id="detectionTime" required>
            </div>
            <div class="form-group">
                <label for="detectionNotes">Notes:</label>
                <textarea id="detectionNotes" placeholder="How was it detected? (Alert, customer report, monitoring?)"></textarea>
            </div>
        </div>

        <div class="timeline-item">
            <div class="form-group">
                <label for="mitigationTime">Mitigation Started (Optional):</label>
                <input type="datetime-local" id="mitigationTime">
            </div>
            <div class="form-group">
                <label for="mitigationNotes">Notes:</label>
                <textarea id="mitigationNotes" placeholder="When did impact reduction begin?"></textarea>
            </div>
        </div>

        <div class="timeline-item">
            <div class="form-group">
                <label for="resolutionTime" class="required">Resolved:</label>
                <input type="datetime-local" id="resolutionTime" required>
            </div>
            <div class="form-group">
                <label for="resolutionNotes">Notes:</label>
                <textarea id="resolutionNotes" placeholder="When was the incident fully resolved?"></textarea>
            </div>
        </div>

        <button onclick="submitTimeline()">Next: Impact Assessment ➡️</button>

        <script>
            const vscode = acquireVsCodeApi();

            function submitTimeline() {
                const startTime = document.getElementById('startTime').value;
                const detectionTime = document.getElementById('detectionTime').value;
                const resolutionTime = document.getElementById('resolutionTime').value;

                if (!startTime || !detectionTime || !resolutionTime) {
                    alert('Please provide start, detection, and resolution times');
                    return;
                }

                vscode.postMessage({
                    command: 'submitTimeline',
                    data: {
                        startTime: startTime,
                        detectionTime: detectionTime,
                        mitigationTime: document.getElementById('mitigationTime').value,
                        resolutionTime: resolutionTime,
                        startNotes: document.getElementById('startNotes').value,
                        detectionNotes: document.getElementById('detectionNotes').value,
                        mitigationNotes: document.getElementById('mitigationNotes').value,
                        resolutionNotes: document.getElementById('resolutionNotes').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}

function getImpactWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            input, textarea { 
                width: 100%; 
                padding: 8px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            textarea { 
                min-height: 80px; 
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <h2>💥 Impact Assessment</h2>
        <p>Describe the impact of this incident.</p>
        
        <div class="form-group">
            <label for="technicalImpact">Technical Impact:</label>
            <textarea id="technicalImpact" placeholder="e.g., Database connection pool exhausted, API gateway returned 503 errors"></textarea>
        </div>

        <div class="form-group">
            <label for="businessImpact">Business Impact:</label>
            <textarea id="businessImpact" placeholder="e.g., Customers unable to complete checkouts, order processing delayed"></textarea>
        </div>

        <div class="form-group">
            <label for="usersAffected">Users/Customers Affected:</label>
            <input type="text" id="usersAffected" placeholder="e.g., ~500 users">
        </div>

        <div class="form-group">
            <label for="transactionsLost">Transactions Lost/Failed:</label>
            <input type="text" id="transactionsLost" placeholder="e.g., ~75 transactions">
        </div>

        <div class="form-group">
            <label for="revenueImpact">Revenue Impact:</label>
            <input type="text" id="revenueImpact" placeholder="e.g., ~$5,000 estimated">
        </div>

        <div class="form-group">
            <label for="slaImpact">SLA Violations:</label>
            <textarea id="slaImpact" placeholder="e.g., Breached 99.9% uptime SLA for April"></textarea>
        </div>

        <button onclick="submitImpact()">Next: Root Cause Analysis ➡️</button>

        <script>
            const vscode = acquireVsCodeApi();

            function submitImpact() {
                vscode.postMessage({
                    command: 'submitImpact',
                    data: {
                        technicalImpact: document.getElementById('technicalImpact').value,
                        businessImpact: document.getElementById('businessImpact').value,
                        usersAffected: document.getElementById('usersAffected').value,
                        transactionsLost: document.getElementById('transactionsLost').value,
                        revenueImpact: document.getElementById('revenueImpact').value,
                        slaImpact: document.getElementById('slaImpact').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}

function getResolutionWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            textarea { 
                width: 100%; 
                padding: 8px;
                min-height: 100px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <h2>🛠️ Resolution Actions</h2>
        <p>Document what was done to resolve the incident.</p>
        
        <div class="form-group">
            <label for="resolutionActions">Actions Taken During Incident:</label>
            <textarea id="resolutionActions" placeholder="e.g.,&#10;- Restarted database connection pool&#10;- Scaled up API gateway instances&#10;- Applied hotfix for memory leak"></textarea>
        </div>

        <div class="form-group">
            <label for="temporaryWorkarounds">Temporary Workarounds Applied:</label>
            <textarea id="temporaryWorkarounds" placeholder="e.g., Manually routed traffic to backup datacenter"></textarea>
        </div>

        <button onclick="submitResolution()">Next: Action Items ➡️</button>

        <script>
            const vscode = acquireVsCodeApi();

            function submitResolution() {
                vscode.postMessage({
                    command: 'submitResolution',
                    data: {
                        resolutionActions: document.getElementById('resolutionActions').value,
                        temporaryWorkarounds: document.getElementById('temporaryWorkarounds').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}

function getActionItemsWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            textarea { 
                width: 100%; 
                padding: 8px;
                min-height: 120px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .info-box {
                background-color: var(--vscode-textBlockQuote-background);
                border-left: 4px solid var(--vscode-textBlockQuote-border);
                padding: 10px;
                margin-bottom: 20px;
                font-size: 13px;
            }
        </style>
    </head>
    <body>
        <h2>✅ Action Items</h2>
        <div class="info-box">
            💡 Format each action as: <code>- [ ] Action description - @owner - P# - Due: YYYY-MM-DD</code>
        </div>
        
        <div class="form-group">
            <label for="shortTermActions">Short-term Actions (1-2 weeks):</label>
            <textarea id="shortTermActions" placeholder="e.g.,&#10;- [ ] Add database timeout configuration - @john - P1 - Due: 2026-04-21&#10;- [ ] Update monitoring alerts - @sarah - P2 - Due: 2026-04-28"></textarea>
        </div>

        <div class="form-group">
            <label for="longTermActions">Long-term Prevention (1-3 months):</label>
            <textarea id="longTermActions" placeholder="e.g.,&#10;- [ ] Implement chaos engineering tests - @team - P2 - Due: 2026-06-01&#10;- [ ] Add automated rollback capability - @devops - P1 - Due: 2026-05-15"></textarea>
        </div>

        <button onclick="submitActionItems()">Next: Lessons Learned ➡️</button>

        <script>
            const vscode = acquireVsCodeApi();

            function submitActionItems() {
                vscode.postMessage({
                    command: 'submitActionItems',
                    data: {
                        shortTermActions: document.getElementById('shortTermActions').value,
                        longTermActions: document.getElementById('longTermActions').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}

function getLessonsLearnedWebview(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            h2 { color: var(--vscode-titleBar-activeForeground); }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 5px;
                font-weight: 600;
            }
            textarea { 
                width: 100%; 
                padding: 8px;
                min-height: 80px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                font-family: var(--vscode-font-family);
            }
            button { 
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <h2>📚 Lessons Learned & References</h2>
        
        <div class="form-group">
            <label for="whatWentWell">What Went Well ✅:</label>
            <textarea id="whatWentWell" placeholder="e.g.,&#10;- Fast detection (3 minutes)&#10;- Good communication between teams&#10;- Effective rollback procedure"></textarea>
        </div>

        <div class="form-group">
            <label for="whatWentPoorly">What Went Poorly ❌:</label>
            <textarea id="whatWentPoorly" placeholder="e.g.,&#10;- No runbook for this scenario&#10;- Manual rollback process took too long&#10;- Unclear escalation path"></textarea>
        </div>

        <div class="form-group">
            <label for="whatShouldChange">What Should Change 🔄:</label>
            <textarea id="whatShouldChange" placeholder="e.g.,&#10;- Automate rollback procedures&#10;- Create runbook for database issues&#10;- Improve monitoring coverage"></textarea>
        </div>

        <div class="form-group">
            <label for="technicalInsights">Technical Insights 💡:</label>
            <textarea id="technicalInsights" placeholder="e.g.,&#10;- Connection pool settings must account for spike traffic&#10;- Always set timeouts on external dependencies"></textarea>
        </div>

        <div class="form-group">
            <label for="relatedDocs">Related Documentation:</label>
            <textarea id="relatedDocs" placeholder="Links to runbooks, architecture docs, similar incidents"></textarea>
        </div>

        <div class="form-group">
            <label for="logsEvidence">Logs & Evidence:</label>
            <textarea id="logsEvidence" placeholder="Links to log files, screenshots, monitoring dashboards"></textarea>
        </div>

        <div class="form-group">
            <label for="externalRefs">External References:</label>
            <textarea id="externalRefs" placeholder="Links to vendor docs, Stack Overflow, similar case studies"></textarea>
        </div>

        <button onclick="submitLessons()">Generate RCA Document 🚀</button>

        <script>
            const vscode = acquireVsCodeApi();

            function submitLessons() {
                vscode.postMessage({
                    command: 'submitLessons',
                    data: {
                        whatWentWell: document.getElementById('whatWentWell').value,
                        whatWentPoorly: document.getElementById('whatWentPoorly').value,
                        whatShouldChange: document.getElementById('whatShouldChange').value,
                        technicalInsights: document.getElementById('technicalInsights').value,
                        relatedDocs: document.getElementById('relatedDocs').value,
                        logsEvidence: document.getElementById('logsEvidence').value,
                        externalRefs: document.getElementById('externalRefs').value
                    }
                });
            }
        </script>
    </body>
    </html>`;
}
