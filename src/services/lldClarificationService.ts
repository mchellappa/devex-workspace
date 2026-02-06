import * as vscode from 'vscode';
import { AIService } from './aiService';

/**
 * Represents a clarification question for LLD generation
 */
export interface ClarificationQuestion {
    id: string;
    question: string;
    options?: string[];
    category: 'architecture' | 'security' | 'integration' | 'performance' | 'infrastructure' | 'other';
    required: boolean;
}

/**
 * Output format options for LLD generation
 */
export interface OutputFormatOption {
    format: 'docx' | 'markdown';
    label: string;
    description: string;
}

/**
 * Reusable service for LLD clarification workflows
 * Used by both generateLLDFromRequirements and generateLLDFromKDD commands
 */
export class LLDClarificationService {
    
    /**
     * Select output format for the LLD document
     */
    async selectOutputFormat(): Promise<{ format: 'docx' | 'markdown' } | undefined> {
        const config = vscode.workspace.getConfiguration('devex.lld');
        const defaultFormat = config.get<string>('outputFormat', 'docx');
        
        const formatOptions: OutputFormatOption[] = [
            {
                format: 'docx',
                label: 'DOCX (Word Document)',
                description: defaultFormat === 'docx' ? '✓ Recommended - Professional format with track changes' : 'Professional format with track changes'
            },
            {
                format: 'markdown',
                label: 'Markdown',
                description: defaultFormat === 'markdown' ? '✓ Recommended - Simple format for GitHub/GitLab' : 'Simple format for GitHub/GitLab'
            }
        ];

        const selected = await vscode.window.showQuickPick(
            formatOptions.map(opt => ({
                label: opt.label,
                description: opt.description,
                value: opt.format
            })),
            {
                placeHolder: 'Select output format for the LLD document',
                title: 'Output Format'
            }
        );

        if (!selected) {
            return undefined;
        }

        return { format: selected.value };
    }

    /**
     * Generate default clarification questions with infrastructure defaults
     */
    getDefaultQuestions(): ClarificationQuestion[] {
        return [
            {
                id: 'technology_stack',
                question: 'What is the primary technology stack for this application?',
                options: ['Java (Spring Boot)', '.NET (C#)', 'Node.js', 'Python', 'Other'],
                category: 'architecture',
                required: true
            },
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
     * Generate AI-driven clarification questions or fall back to defaults
     */
    async generateClarificationQuestions(
        context: string,
        aiService: AIService
    ): Promise<ClarificationQuestion[]> {
        const systemPrompt = `You are an expert software architect. Based on the provided context, generate 3-5 critical clarifying questions that need answers to create a complete LLD. Focus on:
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

        const prompt = `Context:\n${context}\n\nGenerate clarifying questions:`;
        
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
        
        // Return default questions if AI fails
        return this.getDefaultQuestions();
    }

    /**
     * Ask clarification questions interactively with defaults from settings
     */
    async askClarificationQuestions(
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
     * Format clarification answers for AI prompt context
     */
    formatAnswersForPrompt(answers: Map<string, string>): string {
        if (answers.size === 0) {
            return '';
        }

        const lines: string[] = ['Infrastructure Decisions:'];
        
        const labels = new Map<string, string>([
            ['technology_stack', 'Technology Stack'],
            ['hosting_platform', 'Hosting Platform'],
            ['api_gateway', 'API Gateway'],
            ['database', 'Database'],
            ['auth_mechanism', 'Authentication'],
            ['monitoring', 'Monitoring']
        ]);

        for (const [key, value] of answers.entries()) {
            const label = labels.get(key) || key;
            lines.push(`- ${label}: ${value}`);
        }

        return lines.join('\n');
    }
}
