import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface AIResponse {
    content: string;
    model: string;
}

export class AIService {
    async callLanguageModel(prompt: string, systemPrompt?: string): Promise<AIResponse> {
        try {
            // Select Claude Sonnet 4.5 model
            const [model] = await vscode.lm.selectChatModels({ 
                vendor: 'copilot', 
                family: 'claude-sonnet' 
            });

            if (!model) {
                throw new Error('No Copilot model available. Please ensure GitHub Copilot is installed and activated.');
            }

            const messages = [
                vscode.LanguageModelChatMessage.User(systemPrompt || ''),
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let content = '';
            for await (const fragment of response.text) {
                content += fragment;
            }

            logger.info(`AI response received (${content.length} chars)`);

            return {
                content,
                model: model.id
            };
        } catch (error: any) {
            logger.error('AI service error', error);
            
            if (error instanceof vscode.LanguageModelError) {
                vscode.window.showErrorMessage(
                    `AI model error: ${error.message}. Please check your GitHub Copilot subscription.`
                );
            } else {
                vscode.window.showErrorMessage(
                    'Failed to communicate with AI model. Please ensure GitHub Copilot is active.'
                );
            }
            
            throw error;
        }
    }

    async summarizeLLD(lldContent: string): Promise<string> {
        const systemPrompt = `You are an expert software architect. Analyze the following Low-Level Design (LLD) document and provide a concise summary including:
- Main components and their responsibilities
- Key design patterns used
- Integration points and dependencies
- Important technical decisions

Keep the summary clear and actionable for engineers.`;

        const prompt = `Please summarize this LLD document:\n\n${lldContent}`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async parseOpenAPISpec(specContent: string): Promise<string> {
        const systemPrompt = `You are an API design expert. Analyze the following OpenAPI specification and provide a structured summary including:
- API endpoints with HTTP methods
- Request/response schemas
- Authentication requirements
- Key data models

Format the output as markdown for easy reading.`;

        const prompt = `Please analyze this OpenAPI specification:\n\n${specContent}`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async generateSpringBootCode(
        projectName: string,
        packageName: string,
        openApiSpec: string,
        lldSummary?: string
    ): Promise<string> {
        const systemPrompt = `You are a Principal Engineer expert in Spring Boot development. Generate production-ready Spring Boot code following best practices including:
- Clean architecture with proper layering (Controller, Service, Repository)
- Proper validation and error handling
- DTOs with MapStruct
- Comprehensive documentation
- Unit test examples`;

        const prompt = `Generate Spring Boot project structure for:
Project: ${projectName}
Package: ${packageName}
${lldSummary ? `\nLLD Summary:\n${lldSummary}\n` : ''}
OpenAPI Specification:
${openApiSpec}

Provide the main class names, package structure, and key code snippets.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }
}
