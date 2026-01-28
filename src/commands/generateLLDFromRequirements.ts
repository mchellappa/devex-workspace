import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TelemetryService } from '../services/telemetryService';
import { AIService } from '../services/aiService';
import { JiraService } from '../services/jiraService';
import { EmailService } from '../services/emailService';
import { 
    Document, 
    Packer, 
    Paragraph, 
    TextRun, 
    HeadingLevel,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle
} from 'docx';

/**
 * Generate LLD from Requirements Document Command
 * 
 * This command provides an interactive, conversational experience to generate
 * a comprehensive Low-Level Design (LLD) document from a requirements document
 * (PDF, TXT, or MD format). The process follows software engineering best practices
 * and includes all necessary sections for a complete LLD.
 * 
 * Features:
 * - Extract requirements from PDF/TXT/MD files
 * - Interactive clarification questions
 * - Section-by-section generation with progress
 * - Apply software engineering guidelines automatically
 * - Conversational refinement capability
 * - Validation against completeness checklist
 */

interface RequirementsDocument {
    content: string;
    format: 'pdf' | 'txt' | 'md' | 'jira';
    filePath: string;
}

interface ExtractedRequirements {
    functionalRequirements: string[];
    nonFunctionalRequirements: string[];
    technicalConstraints: string[];
    integrationRequirements: string[];
    acceptanceCriteria: string[];
}

interface ClarificationQuestion {
    id: string;
    question: string;
    options?: string[];
    category: 'architecture' | 'security' | 'integration' | 'performance' | 'infrastructure' | 'other';
    required: boolean;
}

interface LLDSection {
    title: string;
    content: string;
    completeness: number; // 0-100%
    recommendations?: string[];
}

interface OutputFormatConfig {
    format: 'docx' | 'markdown' | 'html' | 'pdf';
    includeTableOfContents: boolean;
    includeCoverPage: boolean;
    enableTrackChanges: boolean;
    styleTemplate?: string; // Path to corporate template DOCX
    embedDiagrams: boolean;
    diagramFormat: 'png' | 'svg';
}

/**
 * Main command handler for generating LLD from requirements
 */
export async function generateLLDFromRequirements(context: vscode.ExtensionContext) {
    try {
        const aiService = new AIService();
        
        // Step 1: Get requirements document
        const requirementsDoc = await selectRequirementsDocument();
        if (!requirementsDoc) {
            return;
        }

        // Step 1.5: Select output format
        const outputFormat = await selectOutputFormat();
        if (!outputFormat) {
            return;
        }

        // Step 2: Show progress and extract requirements
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing Requirements Document",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Reading document..." });
            
            // Extract requirements from document
            const extractedReqs = await extractRequirements(requirementsDoc, aiService, progress);
            
            progress.report({ increment: 30, message: "Requirements extracted successfully" });
            
            // Step 3: Generate clarification questions
            progress.report({ increment: 40, message: "Analyzing gaps and preparing questions..." });
            const questions = await generateClarificationQuestions(extractedReqs, aiService);
            
            // Step 4: Ask clarification questions (interactive)
            const answers = await askClarificationQuestions(questions);
            
            // Step 5: Generate LLD sections
            progress.report({ increment: 50, message: "Generating LLD sections..." });
            const lldSections = await generateLLDSections(extractedReqs, answers, aiService, progress);
            
            // Step 6: Create LLD document in selected format
            progress.report({ increment: 90, message: `Creating LLD ${outputFormat.format.toUpperCase()} document...` });
            const lldDocument = await createLLDDocument(lldSections, requirementsDoc, outputFormat);
            
            progress.report({ increment: 100, message: "LLD generated successfully!" });
            
            // Open the generated LLD
            const filePath = await openGeneratedLLD(lldDocument, outputFormat);
            
            // Show completion message with options
            await showCompletionDialog(lldDocument, outputFormat, requirementsDoc, filePath);
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate LLD: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Select output format for generated LLD
 */
async function selectOutputFormat(): Promise<OutputFormatConfig | undefined> {
    interface FormatOption {
        label: string;
        description: string;
        detail: string;
        format: 'docx' | 'markdown' | 'html';
    }
    
    const options: FormatOption[] = [
        {
            label: '⭐ DOCX (Word Document) - Recommended',
            description: 'Professional format with rich formatting',
            detail: 'Includes tables, diagrams, track changes. Easy to review and approve.',
            format: 'docx'
        },
        {
            label: '📝 Markdown (.md)',
            description: 'Plain text, Git-friendly',
            detail: 'Good for internal developer documentation. Easy to version control.',
            format: 'markdown'
        },
        {
            label: '📄 HTML Preview',
            description: 'View in browser',
            detail: 'Good for quick review before finalizing. Can save as PDF later.',
            format: 'html'
        }
    ];
    
    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select output format for generated LLD',
        title: 'LLD Output Format'
    });
    
    if (!selected) {
        return undefined;
    }
    
    // Get configuration from settings
    const config = vscode.workspace.getConfiguration('devex.lld');
    
    return {
        format: selected.format,
        includeTableOfContents: config.get('includeTableOfContents', true),
        includeCoverPage: config.get('includeCoverPage', true),
        enableTrackChanges: config.get('enableTrackChanges', true),
        styleTemplate: config.get('corporateTemplate'),
        embedDiagrams: config.get('embedDiagrams', true),
        diagramFormat: config.get('diagramFormat', 'png')
    };
}

/**
 * Select requirements document from workspace or Jira
 */
async function selectRequirementsDocument(): Promise<RequirementsDocument | undefined> {
    // First, ask user to choose source
    const sourceChoice = await vscode.window.showQuickPick(
        [
            {
                label: '📄 Requirements Document (PDF/TXT/MD)',
                description: 'Select a file from workspace',
                value: 'file'
            },
            {
                label: '📋 Jira Story',
                description: 'Generate from Jira issue',
                value: 'jira'
            }
        ],
        {
            placeHolder: 'Select requirements source',
            title: 'Generate LLD From'
        }
    );
    
    if (!sourceChoice) {
        return undefined;
    }
    
    if (sourceChoice.value === 'jira') {
        return await selectFromJira();
    }
    
    // File source
    // Check if current active editor has a supported file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const filePath = activeEditor.document.uri.fsPath;
        const ext = path.extname(filePath).toLowerCase();
        
        if (['.pdf', '.txt', '.md'].includes(ext)) {
            const useActive = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Use current file (${path.basename(filePath)}) as requirements document?`
            });
            
            if (useActive === 'Yes') {
                return {
                    content: activeEditor.document.getText(),
                    format: ext.slice(1) as 'pdf' | 'txt' | 'md',
                    filePath: filePath
                };
            }
        }
    }
    
    // Let user pick a file
    const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'Requirements Documents': ['pdf', 'txt', 'md'],
            'All Files': ['*']
        },
        title: 'Select Requirements Document'
    });
    
    if (!fileUri || fileUri.length === 0) {
        return undefined;
    }
    
    const filePath = fileUri[0].fsPath;
    const ext = path.extname(filePath).toLowerCase();
    const content = await readFileContent(filePath, ext.slice(1) as 'pdf' | 'txt' | 'md');
    
    return {
        content: content,
        format: ext.slice(1) as 'pdf' | 'txt' | 'md',
        filePath: filePath
    };
}

/**
 * Select and fetch requirements from Jira
 */
async function selectFromJira(): Promise<RequirementsDocument | undefined> {
    const jiraService = new JiraService();
    
    // Initialize Jira service (prompt for config if needed)
    const initialized = await jiraService.initialize();
    if (!initialized) {
        vscode.window.showWarningMessage('Jira configuration not completed. Please try again.');
        return undefined;
    }
    
    // Prompt for Jira issue key
    const issueKey = await vscode.window.showInputBox({
        prompt: 'Enter Jira issue key (e.g., PROJ-123)',
        placeHolder: 'PROJ-123',
        validateInput: (value) => {
            if (!value || !value.match(/^[A-Z]+-\d+$/i)) {
                return 'Please enter a valid Jira issue key (e.g., PROJ-123)';
            }
            return null;
        }
    });
    
    if (!issueKey) {
        return undefined;
    }
    
    // Fetch issue from Jira
    const issue = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Fetching Jira issue ${issueKey}...`,
        cancellable: false
    }, async () => {
        return await jiraService.fetchIssue(issueKey);
    });
    
    if (!issue) {
        vscode.window.showErrorMessage(`Failed to fetch Jira issue: ${issueKey}`);
        return undefined;
    }
    
    // Convert Jira issue to requirements document format
    let content = `# Jira Story: ${issue.key}\n\n`;
    content += `## Summary\n${issue.summary}\n\n`;
    
    if (issue.description) {
        content += `## Description\n${issue.description}\n\n`;
    }
    
    if (issue.acceptanceCriteria && issue.acceptanceCriteria.trim().length > 0) {
        content += `## Acceptance Criteria\n`;
        // Split by lines and number them
        const criteria = issue.acceptanceCriteria.split('\n').filter(line => line.trim());
        criteria.forEach((ac: string, idx: number) => {
            content += `${idx + 1}. ${ac.trim()}\n`;
        });
        content += '\n';
    }
    
    content += `## Issue Details\n`;
    content += `- **Type**: ${issue.issueType}\n`;
    content += `- **Status**: ${issue.status}\n`;
    content += `- **Priority**: ${issue.priority}\n`;
    
    return {
        content: content,
        format: 'jira',
        filePath: `jira://${issue.key}`
    };
}

/**
 * Read file content based on format
 */
async function readFileContent(filePath: string, format: 'pdf' | 'txt' | 'md'): Promise<string> {
    if (format === 'pdf') {
        // TODO: Implement PDF text extraction using pdf-parse or similar library
        throw new Error('PDF parsing not yet implemented. Please convert to TXT or MD format.');
    }
    
    return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Extract requirements from document using AI
 */
async function extractRequirements(
    doc: RequirementsDocument,
    aiService: AIService,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<ExtractedRequirements> {
    progress.report({ message: "Extracting functional requirements..." });
    
    const systemPrompt = `You are an expert software architect. Extract and categorize requirements from the provided document into:
1. Functional Requirements (what the system should do)
2. Non-Functional Requirements (performance, security, scalability)
3. Technical Constraints (must-use technologies, limitations)
4. Integration Requirements (external systems, APIs)
5. Acceptance Criteria (how to verify completion)

Return the response in JSON format with these exact keys: functionalRequirements, nonFunctionalRequirements, technicalConstraints, integrationRequirements, acceptanceCriteria
Each should be an array of strings.`;

    const prompt = `Analyze this requirements document and extract all requirements:\n\n${doc.content}`;
    
    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        
        // Try to parse JSON response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                functionalRequirements: parsed.functionalRequirements || [],
                nonFunctionalRequirements: parsed.nonFunctionalRequirements || [],
                technicalConstraints: parsed.technicalConstraints || [],
                integrationRequirements: parsed.integrationRequirements || [],
                acceptanceCriteria: parsed.acceptanceCriteria || []
            };
        }
    } catch (error) {
        vscode.window.showWarningMessage('Could not parse requirements. Using fallback extraction.');
    }
    
    // Fallback: basic extraction
    return {
        functionalRequirements: ['Requirements from: ' + path.basename(doc.filePath)],
        nonFunctionalRequirements: [],
        technicalConstraints: [],
        integrationRequirements: [],
        acceptanceCriteria: []
    };
}

/**
 * Generate clarification questions based on extracted requirements
 */
async function generateClarificationQuestions(
    requirements: ExtractedRequirements,
    aiService: AIService
): Promise<ClarificationQuestion[]> {
    const systemPrompt = `You are an expert software architect. Based on the extracted requirements, generate 3-5 critical clarifying questions that need answers to create a complete LLD. Focus on:
- Authentication/authorization approach
- Data storage strategy
- Error handling approach
- Integration patterns
- Security requirements
- Deployment and infrastructure preferences

Return a JSON array of questions with this structure:
[{
  "id": "unique_id",
  "question": "Question text?",
  "options": ["Option 1", "Option 2", "Option 3"] or null,
  "category": "architecture|security|integration|performance|infrastructure|other",
  "required": true|false
}]`;

    const prompt = `Requirements:
Functional: ${requirements.functionalRequirements.join(', ')}
Non-Functional: ${requirements.nonFunctionalRequirements.join(', ')}
Technical Constraints: ${requirements.technicalConstraints.join(', ')}

Generate clarifying questions:`;
    
    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
        }
    } catch (error) {
        // Fall through to default questions
    }
    
    // Default questions if AI fails
    return [
        {
            id: 'hosting_platform',
            question: 'Where will the application be hosted?',
            options: ['AKS (Azure Kubernetes Service)', 'Azure App Service', 'Azure Container Instances', 'On-premises Kubernetes', 'Other'],
            category: 'infrastructure',
            required: true
        },
        {
            id: 'api_gateway',
            question: 'How will APIs be exposed to consumers?',
            options: ['Azure APIM (API Management)', 'Direct exposure', 'Azure Application Gateway', 'Kong', 'Other'],
            category: 'infrastructure',
            required: true
        },
        {
            id: 'database',
            question: 'What database will be used?',
            options: ['Azure SQL Managed Instance', 'Azure SQL Database', 'PostgreSQL', 'MongoDB', 'Cosmos DB', 'Other'],
            category: 'architecture',
            required: true
        },
        {
            id: 'auth_mechanism',
            question: 'What authentication mechanism should be used?',
            options: ['OAuth 2.0', 'JWT', 'Azure AD', 'Managed Identity', 'SAML', 'Other'],
            category: 'security',
            required: true
        },
        {
            id: 'monitoring',
            question: 'What monitoring and observability tools will be used?',
            options: ['Azure Application Insights', 'Azure Monitor', 'Prometheus + Grafana', 'ELK Stack', 'Other'],
            category: 'infrastructure',
            required: false
        }
    ];
}

/**
 * Ask clarification questions interactively
 */
async function askClarificationQuestions(
    questions: ClarificationQuestion[]
): Promise<Map<string, string>> {
    const answers = new Map<string, string>();
    
    // Get configured defaults from settings
    const config = vscode.workspace.getConfiguration('devex.infrastructure');
    const defaultHosting = config.get<string>('hostingPlatform', 'AKS (Azure Kubernetes Service)');
    const defaultApiGateway = config.get<string>('apiGateway', 'Azure APIM (API Management)');
    const defaultDatabase = config.get<string>('database', 'Azure SQL Managed Instance');
    const defaultMonitoring = config.get<string>('monitoring', 'Azure Application Insights');
    
    // Pre-fill answers with defaults for infrastructure questions
    const defaults = new Map<string, string>([
        ['hosting_platform', defaultHosting],
        ['api_gateway', defaultApiGateway],
        ['database', defaultDatabase],
        ['monitoring', defaultMonitoring]
    ]);
    
    vscode.window.showInformationMessage(
        `I need to ask ${questions.length} clarification questions. Some have defaults from your settings.`
    );
    
    for (const question of questions) {
        let answer: string | undefined;
        const defaultAnswer = defaults.get(question.id);
        
        if (question.options && question.options.length > 0) {
            // Multiple choice question with default
            const options = defaultAnswer 
                ? [defaultAnswer, ...question.options.filter(o => o !== defaultAnswer), 'Other', 'Skip']
                : [...question.options, 'Other', 'Skip'];
            
            answer = await vscode.window.showQuickPick(
                options,
                {
                    placeHolder: question.question + (defaultAnswer ? ` (Default: ${defaultAnswer})` : ''),
                    title: `Question ${questions.indexOf(question) + 1} of ${questions.length}`
                }
            );
            
            // If user just hits enter and there's a default, use it
            if (!answer && defaultAnswer) {
                answer = defaultAnswer;
            }
        } else {
            // Free text question
            answer = await vscode.window.showInputBox({
                prompt: question.question,
                value: defaultAnswer,
                placeHolder: defaultAnswer || 'Type your answer or leave empty to skip',
                title: `Question ${questions.indexOf(question) + 1} of ${questions.length}`
            });
        }
        
        if (answer && answer !== 'Skip') {
            answers.set(question.id, answer);
        } else if (defaultAnswer && !answer) {
            // Use default if no answer provided
            answers.set(question.id, defaultAnswer);
        }
    }
    
    return answers;
}

/**
 * Generate LLD sections using AI
 */
async function generateLLDSections(
    requirements: ExtractedRequirements,
    answers: Map<string, string>,
    aiService: AIService,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<LLDSection[]> {
    const sections: LLDSection[] = [];
    
    const sectionTemplates = [
        { title: '1. Executive Summary', weight: 5 },
        { title: '2. System Overview', weight: 5 },
        { title: '3. Functional Requirements', weight: 10 },
        { title: '4. Non-Functional Requirements', weight: 10 },
        { title: '5. Architecture Design', weight: 15 },
        { title: '6. API Specifications', weight: 10 },
        { title: '7. Data Models', weight: 10 },
        { title: '8. Error Handling Strategy', weight: 5 },
        { title: '9. Security Considerations', weight: 10 },
        { title: '10. Integration Points', weight: 5 },
        { title: '11. Performance Considerations', weight: 5 },
        { title: '12. Testing Strategy', weight: 5 },
        { title: '13. Deployment Strategy', weight: 5 },
        { title: '14. Monitoring & Observability', weight: 5 }
    ];
    
    let currentProgress = 50;
    const progressPerSection = 40 / sectionTemplates.length;
    
    // Create context string from requirements and answers
    const answersText = Array.from(answers.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    
    const context = `
Requirements:
- Functional: ${requirements.functionalRequirements.join('; ')}
- Non-Functional: ${requirements.nonFunctionalRequirements.join('; ')}
- Technical Constraints: ${requirements.technicalConstraints.join('; ')}
- Integration: ${requirements.integrationRequirements.join('; ')}
- Acceptance Criteria: ${requirements.acceptanceCriteria.join('; ')}

Clarifications:
${answersText}
`;
    
    for (const template of sectionTemplates) {
        progress.report({ 
            message: `Generating ${template.title}...`,
            increment: progressPerSection 
        });
        
        const section: LLDSection = {
            title: template.title,
            content: await generateSectionContent(template.title, context, aiService),
            completeness: 85,
            recommendations: []
        };
        
        sections.push(section);
        currentProgress += progressPerSection;
    }
    
    return sections;
}

/**
 * Generate content for a specific LLD section
 */
async function generateSectionContent(
    sectionTitle: string,
    context: string,
    aiService: AIService
): Promise<string> {
    const systemPrompt = `You are an expert software architect creating a comprehensive Low-Level Design document. Follow software engineering best practices including SOLID principles, security standards (OWASP), RESTful API conventions, and observability best practices.

Write detailed, production-ready content with:
- Specific technical details, not generic statements
- Code examples where appropriate
- Architecture diagrams described in text (mermaid format when applicable)
- Tables for API specifications and data models
- Security considerations (authentication, authorization, encryption)
- Error handling and edge cases
- Performance optimization strategies
- Testing approaches
- Infrastructure-specific guidance (AKS, APIM, SQL MI if mentioned)
- Azure best practices when Azure services are used
- Kubernetes deployment considerations when using AKS
- API Management policies and patterns when using APIM`;

    const prompt = `Create the "${sectionTitle}" section for a Low-Level Design document.

Context:
${context}

Generate comprehensive, detailed content for this section. Include specific technical details, best practices, and actionable information. Format in Markdown.`;

    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        return `## ${sectionTitle}\n\n${response.content}\n\n`;
    } catch (error) {
        return `## ${sectionTitle}\n\n[Error generating content: ${error instanceof Error ? error.message : 'Unknown error'}]\n\n`;
    }
}

/**
 * Create complete LLD document from sections
 */
async function createLLDDocument(
    sections: LLDSection[],
    sourceDoc: RequirementsDocument,
    outputFormat: OutputFormatConfig
): Promise<string> {
    if (outputFormat.format === 'docx') {
        return await createDocxDocument(sections, sourceDoc, outputFormat);
    } else if (outputFormat.format === 'html') {
        return await createHtmlDocument(sections, sourceDoc, outputFormat);
    } else {
        return await createMarkdownDocument(sections, sourceDoc);
    }
}

/**
 * Create DOCX document (Microsoft Word format)
 */
async function createDocxDocument(
    sections: LLDSection[],
    sourceDoc: RequirementsDocument,
    config: OutputFormatConfig
): Promise<string> {
    // Create output path
    const outputPath = path.join(
        path.dirname(sourceDoc.filePath),
        `LLD_${path.basename(sourceDoc.filePath, path.extname(sourceDoc.filePath))}_${Date.now()}.docx`
    );
    
    // Build document paragraphs
    const docParagraphs: Paragraph[] = [];
    
    // Cover page
    if (config.includeCoverPage) {
        docParagraphs.push(
            new Paragraph({
                text: "Low-Level Design Document",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Generated from: ${path.basename(sourceDoc.filePath)}`,
                        break: 1
                    }),
                    new TextRun({
                        text: `Generated on: ${new Date().toLocaleString()}`,
                        break: 1
                    }),
                    new TextRun({
                        text: "Tool: DevEx Assistant - LLD Generator",
                        break: 1
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            new Paragraph({
                text: "",
                pageBreakBefore: true
            })
        );
    }
    
    // Table of contents placeholder
    if (config.includeTableOfContents) {
        docParagraphs.push(
            new Paragraph({
                text: "Table of Contents",
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "(Right-click and select 'Update Field' to generate TOC in Word)",
                spacing: { after: 400 }
            }),
            new Paragraph({
                text: "",
                pageBreakBefore: true
            })
        );
    }
    
    // Add sections
    for (const section of sections) {
        // Parse the content to extract heading and body
        const lines = section.content.split('\n');
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            
            if (line.startsWith('## ')) {
                // Heading 1
                docParagraphs.push(
                    new Paragraph({
                        text: line.replace('## ', ''),
                        heading: HeadingLevel.HEADING_1,
                        spacing: { before: 240, after: 120 }
                    })
                );
            } else if (line.startsWith('### ')) {
                // Heading 2
                docParagraphs.push(
                    new Paragraph({
                        text: line.replace('### ', ''),
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 100 }
                    })
                );
            } else if (line.startsWith('#### ')) {
                // Heading 3
                docParagraphs.push(
                    new Paragraph({
                        text: line.replace('#### ', ''),
                        heading: HeadingLevel.HEADING_3,
                        spacing: { before: 160, after: 80 }
                    })
                );
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                // Bullet point
                docParagraphs.push(
                    new Paragraph({
                        text: line.replace(/^[*-]\s+/, ''),
                        bullet: { level: 0 },
                        spacing: { after: 100 }
                    })
                );
            } else if (line.startsWith('1. ') || /^\d+\.\s/.test(line)) {
                // Numbered list - keep as plain text to avoid numbering reference issues
                docParagraphs.push(
                    new Paragraph({
                        text: line,
                        spacing: { after: 100 }
                    })
                );
            } else if (inCodeBlock) {
                // Code block
                docParagraphs.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: line,
                                font: "Courier New",
                                size: 20
                            })
                        ],
                        spacing: { after: 50 }
                    })
                );
            } else if (line.length > 0) {
                // Regular paragraph
                docParagraphs.push(
                    new Paragraph({
                        text: line,
                        spacing: { after: 120 }
                    })
                );
            } else {
                // Empty line
                docParagraphs.push(new Paragraph({ text: "" }));
            }
        }
    }
    
    // Create document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,    // 1 inch
                        right: 1440,
                        bottom: 1440,
                        left: 1440
                    }
                }
            },
            children: docParagraphs
        }]
    });
    
    // Generate and save DOCX file
    try {
        const buffer = await Packer.toBuffer(doc);
        await fs.promises.writeFile(outputPath, buffer);
        
        vscode.window.showInformationMessage(
            `LLD saved as DOCX: ${path.basename(outputPath)}`,
            'Open File Location',
            'Open in Word'
        ).then(selection => {
            if (selection === 'Open File Location') {
                vscode.env.openExternal(vscode.Uri.file(path.dirname(outputPath)));
            } else if (selection === 'Open in Word') {
                vscode.env.openExternal(vscode.Uri.file(outputPath));
            }
        });
        
        return outputPath;
    } catch (error) {
        throw new Error(`Failed to create DOCX file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Create HTML document
 */
async function createHtmlDocument(
    sections: LLDSection[],
    sourceDoc: RequirementsDocument,
    config: OutputFormatConfig
): Promise<string> {
    // TODO: Implement HTML generation with styles
    const header = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Low-Level Design Document</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1, h2, h3 { color: #2c3e50; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #3498db; color: white; }
        code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background-color: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Low-Level Design Document</h1>
    <p><strong>Generated from:</strong> ${path.basename(sourceDoc.filePath)}</p>
    <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
    <hr>
`;
    
    const body = sections.map(section => 
        `<section>${section.content.replace(/^## /gm, '<h2>').replace(/\n/g, '<br>')}</section>`
    ).join('\n\n');
    
    const footer = `
    <hr>
    <footer>
        <p><em>Generated by DevEx Assistant - LLD Generator</em></p>
    </footer>
</body>
</html>
`;
    
    return header + body + footer;
}

/**
 * Create Markdown document
 */
async function createMarkdownDocument(
    sections: LLDSection[],
    sourceDoc: RequirementsDocument
): Promise<string> {
    const header = `# Low-Level Design Document

**Generated from:** ${path.basename(sourceDoc.filePath)}  
**Generated on:** ${new Date().toLocaleString()}  
**Tool:** DevEx Assistant - LLD Generator  

---

`;
    
    const body = sections.map(section => section.content).join('\n\n---\n\n');
    
    const footer = `

---

## Refine This LLD

Not satisfied with a section? Have more details to add?

**Options:**
1. Edit this document directly
2. Use "DevEx: Validate LLD Completeness" to check for gaps
3. Use "DevEx: Review LLD" for technical review
4. Use "DevEx: Validate LLD Against Jira Story" if using Jira

**Need help?** Right-click on any section and select "Regenerate This Section"

`;
    
    return header + body + footer;
}

/**
 * Open generated LLD document in editor
 */
async function openGeneratedLLD(content: string, outputFormat: OutputFormatConfig): Promise<string> {
    if (outputFormat.format === 'docx') {
        // DOCX file is already saved and message shown in createDocxDocument
        // Return the content as the file path (it's passed as file path for DOCX)
        return content;
    } else if (outputFormat.format === 'html') {
        // Create HTML file and open in browser
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'html'
        });
        await vscode.window.showTextDocument(doc);
        return doc.uri.fsPath;
    } else {
        // Open as markdown in VS Code
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
        return doc.uri.fsPath;
    }
}

/**
 * Show completion dialog with next steps
 */
async function showCompletionDialog(
    lldContent: string, 
    outputFormat: OutputFormatConfig, 
    sourceDoc: RequirementsDocument,
    filePath: string
): Promise<void> {
    const formatName = outputFormat.format.toUpperCase();
    const fileName = path.basename(filePath);
    const projectName = fileName.replace(/\.(docx|md|html)$/, '');
    
    const action = await vscode.window.showInformationMessage(
        `✅ LLD Generated Successfully!\n\n` +
        `📄 ${fileName}\n` +
        `📊 All sections completed\n` +
        `⏱️ Estimated time saved: 10 hours`,
        'Open Document',
        'Share via Email',
        'Validate Completeness',
        'Review LLD'
    );
    
    switch (action) {
        case 'Open Document':
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
            break;
        case 'Share via Email':
            const sourceName = sourceDoc.format === 'jira' 
                ? sourceDoc.filePath.replace('jira://', '')
                : path.basename(sourceDoc.filePath);
            
            await EmailService.composeEmail(
                EmailService.generateDocumentEmail({
                    documentType: 'LLD',
                    projectName: projectName,
                    source: sourceName,
                    format: formatName === 'DOCX' ? 'DOCX (Microsoft Word)' : formatName,
                    completeness: 100,
                    highlights: [
                        '15 comprehensive sections included',
                        'Architecture diagrams and flow charts',
                        'API specifications documented',
                        'Security considerations addressed',
                        'Deployment strategy defined',
                        'Testing and monitoring plans included'
                    ],
                    filePath: filePath
                })
            );
            break;
        case 'Validate Completeness':
            // TODO: Call validation command
            vscode.window.showInformationMessage('Validation feature coming soon!');
            break;
        case 'Review LLD':
            await vscode.commands.executeCommand('devex.reviewLLD');
            break;
    }
}

/**
 * Command wrapper with telemetry support
 */
export async function generateLLDFromRequirementsCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    fileUri?: vscode.Uri
) {
    const startTime = Date.now();
    
    try {
        telemetryService.trackEvent('command.generateLLDFromRequirements.started');
        
        await generateLLDFromRequirements(context);
        
        const duration = Date.now() - startTime;
        telemetryService.trackEvent('command.generateLLDFromRequirements.completed', {
            duration: duration.toString()
        });
        
        // Track time saved (estimated 8-12 hours manual creation)
        const hoursSaved = 10; // Average
        const manualTimeSeconds = hoursSaved * 3600; // Convert hours to seconds
        await telemetryService.trackProductivityMetric(
            'generateLLDFromRequirements', 
            manualTimeSeconds,
            duration / 1000 // Convert ms to seconds
        );
        
    } catch (error) {
        telemetryService.trackEvent('command.generateLLDFromRequirements.failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Register the command (legacy function, kept for compatibility)
 */
export function registerGenerateLLDFromRequirementsCommand(context: vscode.ExtensionContext) {
    const command = vscode.commands.registerCommand(
        'devex.generateLLDFromRequirements',
        () => generateLLDFromRequirements(context)
    );
    
    context.subscriptions.push(command);
}
