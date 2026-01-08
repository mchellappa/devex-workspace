import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface AIResponse {
    content: string;
    model: string;
}

export class AIService {
    async callLanguageModel(prompt: string, systemPrompt?: string): Promise<AIResponse> {
        try {
            // Try to get available Copilot models
            const models = await vscode.lm.selectChatModels({ 
                vendor: 'copilot'
            });

            if (models.length === 0) {
                throw new Error('No Copilot model available. Please ensure GitHub Copilot is installed and activated.');
            }

            // Prefer Claude Sonnet if available, otherwise use first available model
            const model = models.find(m => m.family.includes('claude')) || models[0];
            
            logger.info(`Using model: ${model.id} (family: ${model.family})`);

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

    async reviewLLDAsArchitect(lldContent: string, focusArea: string): Promise<string> {
        const systemPrompt = `You are a Principal Architect with 20+ years of experience reviewing system designs. Your role is to provide constructive, actionable feedback on Low-Level Design documents to help engineering teams deliver production-ready systems.

Focus on:
- Architectural concerns and anti-patterns
- Complexity assessment and simplification opportunities
- Risk identification and mitigation strategies
- Alignment with best practices and industry standards
- Practical recommendations for improvement

Provide feedback that is:
- Specific and actionable
- Balanced (acknowledge strengths, highlight concerns)
- Prioritized (critical issues first)
- Ready to share with engineering teams`;

        const prompt = `Please review this Low-Level Design document from a Principal Architect perspective.

**Focus Area:** ${focusArea}

**LLD Content:**
${lldContent}

Provide a comprehensive architectural review with the following sections:

## 1. Executive Summary
Brief overview of the design and key concerns

## 2. Architectural Assessment
- Strengths of the current design
- Areas of concern
- Complexity analysis

## 3. Key Recommendations
Prioritized list of actionable improvements (Critical, High, Medium priority)

## 4. Risk Analysis
Potential risks and mitigation strategies

## 5. Focus Area Deep Dive: ${focusArea}
Detailed review specific to the focus area

## 6. Questions for the Team
Clarifying questions to address before implementation

Format the review in clear markdown suitable for sharing with the engineering team.`;

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
