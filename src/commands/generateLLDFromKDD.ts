import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx';
import { TelemetryService } from '../services/telemetryService';

export async function generateLLDFromKDD(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    fileUri?: vscode.Uri
): Promise<void> {
    const startTime = Date.now();

    try {
        // Step 1: Get KDD file
        let kddFile: vscode.Uri | undefined = fileUri;

        if (!kddFile) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.toLowerCase().includes('kdd')) {
                kddFile = editor.document.uri;
            } else {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'Markdown': ['md']
                    },
                    title: 'Select KDD Document'
                });

                if (!files || files.length === 0) {
                    vscode.window.showWarningMessage('No KDD file selected');
                    return;
                }

                kddFile = files[0];
            }
        }

        // Step 2: Parse KDD content
        const kddContent = fs.readFileSync(kddFile.fsPath, 'utf-8');
        const kddData = parseKDD(kddContent);

        if (!kddData.selectedOption) {
            vscode.window.showErrorMessage('Could not find selected option in KDD. Please ensure the KDD has a "Recommended Approach" section.');
            return;
        }

        // Step 3: Generate LLD using AI
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating LLD from KDD...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Analyzing KDD...' });

            const lldContent = await generateLLDContent(kddData, progress);

            progress.report({ increment: 20, message: 'Creating LLD document...' });

            // Step 4: Create DOCX document
            const doc = await createLLDDocument(lldContent);

            progress.report({ increment: 10, message: 'Saving document...' });

            // Step 5: Save and open document
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const lldFileName = `LLD-${kddData.problemStatement.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.docx`;
            const lldPath = path.join(workspaceFolder.uri.fsPath, lldFileName);

            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(lldPath, buffer);

            const docUri = vscode.Uri.file(lldPath);
            await vscode.commands.executeCommand('vscode.open', docUri);

            vscode.window.showInformationMessage(`✅ LLD generated successfully: ${lldFileName}`);

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('lld.generated.from.kdd', {
                duration: duration.toString(),
                hasEnrichment: (!!kddData.implementationDetails).toString()
            });
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to generate LLD: ${error.message}`);
        telemetryService.trackEvent('lld.generation.error', {
            error: error.message
        });
    }
}

interface KDDData {
    problemStatement: string;
    businessContext: string;
    technicalChallenge: string;
    currentState: string;
    desiredOutcome: string;
    selectedOption: string;
    justification: string;
    implementationDetails?: string;
    technologyStack?: string[];
    securityConsiderations?: string;
    testingStrategy?: string;
    dependencies?: string[];
}

function parseKDD(content: string): KDDData {
    const data: KDDData = {
        problemStatement: '',
        businessContext: '',
        technicalChallenge: '',
        currentState: '',
        desiredOutcome: '',
        selectedOption: '',
        justification: ''
    };

    // Extract problem statement
    const problemMatch = content.match(/##\s+1\.\s+Problem Statement([\s\S]*?)(?=##\s+\d+\.|$)/i);
    if (problemMatch) {
        const businessContextMatch = problemMatch[1].match(/###\s+\d+\.\d+\s+Business Context\s*([\s\S]*?)(?=###|$)/i);
        if (businessContextMatch) {
            data.businessContext = businessContextMatch[1].trim();
        }

        const technicalMatch = problemMatch[1].match(/###\s+\d+\.\d+\s+Technical Challenge\s*([\s\S]*?)(?=###|$)/i);
        if (technicalMatch) {
            data.technicalChallenge = technicalMatch[1].trim();
        }

        const currentStateMatch = problemMatch[1].match(/###\s+\d+\.\d+\s+Current State\s*([\s\S]*?)(?=###|$)/i);
        if (currentStateMatch) {
            data.currentState = currentStateMatch[1].trim();
        }

        const desiredMatch = problemMatch[1].match(/###\s+\d+\.\d+\s+Desired Outcome\s*([\s\S]*?)(?=###|$)/i);
        if (desiredMatch) {
            data.desiredOutcome = desiredMatch[1].trim();
        }
    }

    data.problemStatement = data.technicalChallenge || 'Design Implementation';

    // Extract selected option
    const selectedMatch = content.match(/##\s+\d+\.\s+Recommended Approach[\s\S]*?\*\*Selected Option:\*\*\s*(.+)/i);
    if (selectedMatch) {
        data.selectedOption = selectedMatch[1].trim();
    }

    // Extract justification
    const justificationMatch = content.match(/\*\*Justification:\*\*\s*([\s\S]*?)(?=\*\*|##)/i);
    if (justificationMatch) {
        data.justification = justificationMatch[1].trim();
    }

    // Extract enrichment data if available
    const implMatch = content.match(/###\s+\d+\.\d+\s+Implementation Details\s*([\s\S]*?)(?=###|##|$)/i);
    if (implMatch) {
        data.implementationDetails = implMatch[1].trim();
    }

    const techStackMatch = content.match(/###\s+\d+\.\d+\s+Technology Stack\s*([\s\S]*?)(?=###|##|$)/i);
    if (techStackMatch) {
        data.technologyStack = techStackMatch[1].split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.replace(/^-\s*/, '').trim());
    }

    const securityMatch = content.match(/###\s+\d+\.\d+\s+Security Considerations\s*([\s\S]*?)(?=###|##|$)/i);
    if (securityMatch) {
        data.securityConsiderations = securityMatch[1].trim();
    }

    const testingMatch = content.match(/###\s+\d+\.\d+\s+Testing Strategy\s*([\s\S]*?)(?=###|##|$)/i);
    if (testingMatch) {
        data.testingStrategy = testingMatch[1].trim();
    }

    const depsMatch = content.match(/###\s+\d+\.\d+\s+Dependencies\s*([\s\S]*?)(?=###|##|$)/i);
    if (depsMatch) {
        data.dependencies = depsMatch[1].split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.replace(/^-\s*/, '').trim());
    }

    return data;
}

async function generateLLDContent(kddData: KDDData, progress: vscode.Progress<{ increment?: number; message?: string }>): Promise<any> {
    progress.report({ increment: 10, message: 'Generating architecture design...' });

    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    if (models.length === 0) {
        throw new Error('No AI models available');
    }

    const model = models[0];

    const prompt = `You are a principal software architect creating a comprehensive Low-Level Design (LLD) document from an approved Key Design Document (KDD).

**Problem Statement:**
${kddData.problemStatement}

**Business Context:**
${kddData.businessContext}

**Technical Challenge:**
${kddData.technicalChallenge}

**Current State:**
${kddData.currentState}

**Desired Outcome:**
${kddData.desiredOutcome}

**Selected Design Option:**
${kddData.selectedOption}

**Justification:**
${kddData.justification}

${kddData.implementationDetails ? `**Implementation Guidance:**\n${kddData.implementationDetails}` : ''}

${kddData.technologyStack ? `**Technology Stack:**\n${kddData.technologyStack.join(', ')}` : ''}

Generate a comprehensive Low-Level Design document with the following sections:

1. **System Architecture Overview** (2-3 paragraphs)
   - High-level architecture diagram description
   - Component breakdown
   - Communication patterns

2. **API Specifications**
   - REST endpoints (path, method, auth, request/response)
   - At least 5 key endpoints with full details
   - Include ACB calculation endpoint if relevant

3. **Database Schema**
   - Tables with columns (name, type, nullable, constraints)
   - Indexes and relationships
   - Migration strategy

4. **Service Components**
   - List of microservices/services
   - Responsibilities of each
   - Technology stack for each

5. **Sequence Diagrams** (text descriptions for key flows)
   - User authentication flow
   - Main business logic flow
   - Error handling flow

6. **Error Handling Strategy**
   - Error types and HTTP status codes
   - Logging approach
   - Retry mechanisms

7. **Security Implementation**
   ${kddData.securityConsiderations ? `Based on: ${kddData.securityConsiderations}` : 'Include: Authentication, Authorization, Data encryption, Input validation'}

8. **Performance Considerations**
   - Caching strategy
   - Database optimization
   - Rate limiting

9. **Monitoring & Observability**
   - Logging strategy
   - Metrics to track
   - Alerting rules

10. **Deployment Architecture**
    - Container configuration
    - Kubernetes/orchestration setup
    - CI/CD pipeline overview

${kddData.dependencies ? `11. **External Dependencies**\n${kddData.dependencies.map(d => `- ${d}`).join('\n')}` : ''}

${kddData.testingStrategy ? `12. **Testing Strategy**\n${kddData.testingStrategy}` : ''}

Format as JSON with these exact keys:
{
    "systemArchitecture": "...",
    "apiEndpoints": [
        {
            "path": "/api/...",
            "method": "GET|POST|PUT|DELETE",
            "authentication": "JWT Bearer",
            "authorization": "User must own resource",
            "requestBody": { "schema": "..." },
            "responseBody": { "schema": "..." },
            "errorResponses": ["400 Bad Request", "401 Unauthorized", "404 Not Found"]
        }
    ],
    "databaseSchema": [
        {
            "tableName": "...",
            "columns": [
                { "name": "id", "type": "UUID", "nullable": false, "primaryKey": true },
                { "name": "...", "type": "...", "nullable": false }
            ],
            "indexes": ["idx_employee_id"],
            "foreignKeys": [{ "column": "employee_id", "references": "employees(id)" }]
        }
    ],
    "serviceComponents": [
        {
            "name": "PayrollService",
            "responsibility": "...",
            "technology": "ASP.NET Core 8",
            "apis": ["GET /api/payroll/..."]
        }
    ],
    "sequenceFlows": [
        {
            "name": "User Authentication",
            "steps": ["1. User clicks login", "2. Redirect to Azure AD", "..."]
        }
    ],
    "errorHandling": {
        "strategy": "...",
        "errorTypes": ["ValidationError", "AuthorizationError", "..."],
        "logging": "..."
    },
    "security": {
        "authentication": "...",
        "authorization": "...",
        "dataEncryption": "...",
        "inputValidation": "..."
    },
    "performance": {
        "caching": "...",
        "databaseOptimization": "...",
        "rateLimiting": "..."
    },
    "monitoring": {
        "logging": "...",
        "metrics": ["response_time", "error_rate", "..."],
        "alerts": ["..."]
    },
    "deployment": {
        "containerization": "...",
        "orchestration": "...",
        "cicd": "..."
    }
}`;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    progress.report({ increment: 30, message: 'AI generating LLD content...' });

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullResponse = '';
    for await (const fragment of response.text) {
        fullResponse += fragment;
    }

    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }

    const lldData = JSON.parse(jsonMatch[0]);
    lldData.problemStatement = kddData.problemStatement;
    lldData.selectedOption = kddData.selectedOption;

    progress.report({ increment: 10, message: 'LLD content generated' });

    return lldData;
}

async function createLLDDocument(lldData: any): Promise<Document> {
    const sections: Paragraph[] = [];

    // Title
    sections.push(new Paragraph({
        text: 'Low-Level Design Document',
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 }
    }));

    // Metadata
    sections.push(new Paragraph({
        children: [
            new TextRun({ text: 'Document ID: ', bold: true }),
            new TextRun(`LLD-${Date.now()}`)
        ]
    }));
    sections.push(new Paragraph({
        children: [
            new TextRun({ text: 'Problem Statement: ', bold: true }),
            new TextRun(lldData.problemStatement)
        ]
    }));
    sections.push(new Paragraph({
        children: [
            new TextRun({ text: 'Selected Design: ', bold: true }),
            new TextRun(lldData.selectedOption)
        ]
    }));
    sections.push(new Paragraph({
        children: [
            new TextRun({ text: 'Date: ', bold: true }),
            new TextRun(new Date().toISOString().split('T')[0])
        ],
        spacing: { after: 400 }
    }));

    // 1. System Architecture
    sections.push(new Paragraph({
        text: '1. System Architecture Overview',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));
    sections.push(new Paragraph({
        text: lldData.systemArchitecture,
        spacing: { after: 200 }
    }));

    // 2. API Specifications
    sections.push(new Paragraph({
        text: '2. API Specifications',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));

    for (const endpoint of lldData.apiEndpoints || []) {
        sections.push(new Paragraph({
            text: `${endpoint.method} ${endpoint.path}`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
        }));
        sections.push(new Paragraph({
            children: [
                new TextRun({ text: 'Authentication: ', bold: true }),
                new TextRun(endpoint.authentication || 'Not specified')
            ]
        }));
        sections.push(new Paragraph({
            children: [
                new TextRun({ text: 'Authorization: ', bold: true }),
                new TextRun(endpoint.authorization || 'Not specified')
            ]
        }));
        if (endpoint.requestBody) {
            sections.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Request: ', bold: true }),
                    new TextRun(JSON.stringify(endpoint.requestBody, null, 2))
                ]
            }));
        }
        if (endpoint.responseBody) {
            sections.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Response: ', bold: true }),
                    new TextRun(JSON.stringify(endpoint.responseBody, null, 2))
                ],
                spacing: { after: 200 }
            }));
        }
    }

    // 3. Database Schema
    sections.push(new Paragraph({
        text: '3. Database Schema',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));

    for (const table of lldData.databaseSchema || []) {
        sections.push(new Paragraph({
            text: `Table: ${table.tableName}`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
        }));

        for (const column of table.columns || []) {
            sections.push(new Paragraph({
                text: `  • ${column.name}: ${column.type}${column.primaryKey ? ' (PK)' : ''}${!column.nullable ? ' NOT NULL' : ''}`,
                spacing: { after: 50 }
            }));
        }

        if (table.indexes && table.indexes.length > 0) {
            sections.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Indexes: ', bold: true }),
                    new TextRun(table.indexes.join(', '))
                ],
                spacing: { after: 200 }
            }));
        }
    }

    // 4. Service Components
    sections.push(new Paragraph({
        text: '4. Service Components',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));

    for (const service of lldData.serviceComponents || []) {
        sections.push(new Paragraph({
            text: service.name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
        }));
        sections.push(new Paragraph({
            children: [
                new TextRun({ text: 'Responsibility: ', bold: true }),
                new TextRun(service.responsibility)
            ]
        }));
        sections.push(new Paragraph({
            children: [
                new TextRun({ text: 'Technology: ', bold: true }),
                new TextRun(service.technology)
            ],
            spacing: { after: 200 }
        }));
    }

    // 5. Security Implementation
    sections.push(new Paragraph({
        text: '5. Security Implementation',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));

    if (lldData.security) {
        sections.push(new Paragraph({
            text: 'Authentication',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
        }));
        sections.push(new Paragraph({
            text: lldData.security.authentication,
            spacing: { after: 200 }
        }));

        sections.push(new Paragraph({
            text: 'Authorization',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
        }));
        sections.push(new Paragraph({
            text: lldData.security.authorization,
            spacing: { after: 200 }
        }));
    }

    // 6. Error Handling
    sections.push(new Paragraph({
        text: '6. Error Handling Strategy',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));
    sections.push(new Paragraph({
        text: lldData.errorHandling?.strategy || 'Standard error handling approach',
        spacing: { after: 200 }
    }));

    // 7. Monitoring & Observability
    sections.push(new Paragraph({
        text: '7. Monitoring & Observability',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));
    sections.push(new Paragraph({
        text: lldData.monitoring?.logging || 'Comprehensive logging and monitoring strategy',
        spacing: { after: 200 }
    }));

    // 8. Deployment Architecture
    sections.push(new Paragraph({
        text: '8. Deployment Architecture',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
    }));
    sections.push(new Paragraph({
        text: lldData.deployment?.containerization || 'Docker containerization with Kubernetes orchestration',
        spacing: { after: 200 }
    }));

    // Footer
    sections.push(new Paragraph({
        text: 'Generated by DevEx AI Assistant',
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 }
    }));

    return new Document({
        sections: [{
            properties: {},
            children: sections
        }]
    });
}
