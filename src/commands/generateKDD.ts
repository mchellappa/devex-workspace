import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface KDDContext {
    problemStatement: string;
    businessContext?: string;
    technicalChallenge?: string;
    currentState?: string;
    desiredOutcome?: string;
    functionalRequirements?: string[];
    nonFunctionalRequirements?: {
        performance?: string;
        scalability?: string;
        security?: string;
        maintainability?: string;
        reliability?: string;
    };
    constraints?: string[];
    assumptions?: string[];
    options: DesignOption[];
    selectedOption?: number;
    justification?: string;
}

interface DesignOption {
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    effortEstimate?: string;
    scores?: {
        performance: number;
        scalability: number;
        cost: number;
        complexity: number;
        timeToMarket: number;
    };
    // Enrichment fields
    implementationDetails?: string;
    technologyStack?: string[];
    resourceRequirements?: string;
    timelineBreakdown?: string;
    securityConsiderations?: string;
    testingStrategy?: string;
    successMetrics?: string[];
    dependencies?: string[];
    riskMitigation?: string;
}

export async function generateKDD(context: vscode.ExtensionContext): Promise<void> {
    const kddContext: KDDContext = {
        problemStatement: '',
        options: []
    };

    // Step 1: Get problem statement
    const problemStatement = await vscode.window.showInputBox({
        prompt: 'Enter the problem statement or technical challenge',
        placeHolder: 'e.g., We need to migrate our monolithic application to a microservices architecture',
        ignoreFocusOut: true,
        validateInput: (value) => {
            return value.trim().length < 10 ? 'Problem statement must be at least 10 characters' : null;
        }
    });

    if (!problemStatement) {
        vscode.window.showWarningMessage('KDD generation cancelled - no problem statement provided');
        return;
    }

    kddContext.problemStatement = problemStatement;

    // Step 2: Conversational context gathering
    await gatherContext(kddContext);

    // Step 3: Generate design options using AI
    await generateDesignOptions(kddContext);

    // Step 4: Allow user to refine options
    await refineOptions(kddContext);

    // Step 5: Evaluate and recommend
    await evaluateOptions(kddContext);

    // Step 6: Enrich the selected option with detailed implementation guidance
    await enrichSelectedOption(kddContext);

    // Step 7: Generate KDD document
    await generateKDDDocument(kddContext);
}

async function gatherContext(kddContext: KDDContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'kddContextGathering',
        'KDD Context Gathering',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getContextGatheringWebview();

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'submitContext':
                        kddContext.businessContext = message.data.businessContext;
                        kddContext.technicalChallenge = message.data.technicalChallenge;
                        kddContext.currentState = message.data.currentState;
                        kddContext.desiredOutcome = message.data.desiredOutcome;
                        kddContext.functionalRequirements = message.data.functionalRequirements.split('\n').filter((r: string) => r.trim());
                        kddContext.nonFunctionalRequirements = {
                            performance: message.data.performance,
                            scalability: message.data.scalability,
                            security: message.data.security,
                            maintainability: message.data.maintainability,
                            reliability: message.data.reliability
                        };
                        kddContext.constraints = message.data.constraints.split('\n').filter((c: string) => c.trim());
                        kddContext.assumptions = message.data.assumptions.split('\n').filter((a: string) => a.trim());
                        panel.dispose();
                        resolve();
                        break;
                }
            }
        );
    });
}

async function generateDesignOptions(kddContext: KDDContext): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating design options using AI...',
        cancellable: false
    }, async () => {
        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o'
            });

            if (models.length === 0) {
                throw new Error('No AI models available');
            }

            const model = models[0];

            const prompt = `You are an experienced software architect. Based on the following context, generate 3 distinct design options to solve the problem.

Problem Statement: ${kddContext.problemStatement}

Business Context: ${kddContext.businessContext || 'Not provided'}

Technical Challenge: ${kddContext.technicalChallenge || 'Not provided'}

Current State: ${kddContext.currentState || 'Not provided'}

Desired Outcome: ${kddContext.desiredOutcome || 'Not provided'}

Functional Requirements:
${kddContext.functionalRequirements?.map(r => `- ${r}`).join('\n') || 'Not provided'}

Non-Functional Requirements:
- Performance: ${kddContext.nonFunctionalRequirements?.performance || 'Not specified'}
- Scalability: ${kddContext.nonFunctionalRequirements?.scalability || 'Not specified'}
- Security: ${kddContext.nonFunctionalRequirements?.security || 'Not specified'}
- Maintainability: ${kddContext.nonFunctionalRequirements?.maintainability || 'Not specified'}
- Reliability: ${kddContext.nonFunctionalRequirements?.reliability || 'Not specified'}

Constraints:
${kddContext.constraints?.map(c => `- ${c}`).join('\n') || 'Not provided'}

Assumptions:
${kddContext.assumptions?.map(a => `- ${a}`).join('\n') || 'Not provided'}

For each of the 3 design options, provide:
1. A clear, descriptive title
2. A detailed description (2-3 paragraphs)
3. At least 4 pros (advantages)
4. At least 4 cons (disadvantages)
5. An effort estimate (Small/Medium/Large/XLarge)

Format your response as JSON:
{
    "options": [
        {
            "title": "Option title",
            "description": "Detailed description",
            "pros": ["Pro 1", "Pro 2", ...],
            "cons": ["Con 1", "Con 2", ...],
            "effortEstimate": "Medium"
        }
    ]
}`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const fragment of response.text) {
                fullResponse += fragment;
            }

            // Extract JSON from response
            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsedResponse = JSON.parse(jsonMatch[0]);
                kddContext.options = parsedResponse.options;
            } else {
                throw new Error('Failed to parse AI response');
            }

        } catch (error) {
            console.error('Error generating design options:', error);
            vscode.window.showErrorMessage(`Failed to generate design options: ${error}`);
            
            // Provide default options as fallback
            kddContext.options = [
                {
                    title: 'Option 1: [Manual Input Required]',
                    description: 'AI generation failed. Please manually enter design options.',
                    pros: ['Pro 1'],
                    cons: ['Con 1'],
                    effortEstimate: 'Medium'
                },
                {
                    title: 'Option 2: [Manual Input Required]',
                    description: 'AI generation failed. Please manually enter design options.',
                    pros: ['Pro 1'],
                    cons: ['Con 1'],
                    effortEstimate: 'Medium'
                },
                {
                    title: 'Option 3: [Manual Input Required]',
                    description: 'AI generation failed. Please manually enter design options.',
                    pros: ['Pro 1'],
                    cons: ['Con 1'],
                    effortEstimate: 'Medium'
                }
            ];
        }
    });
}

async function refineOptions(kddContext: KDDContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'kddRefineOptions',
        'Refine Design Options',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getRefineOptionsWebview(kddContext.options);

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'submitOptions':
                        kddContext.options = message.data.options;
                        panel.dispose();
                        resolve();
                        break;
                    case 'regenerateOption':
                        await regenerateOption(kddContext, message.data.optionIndex, panel);
                        break;
                }
            }
        );
    });
}

async function regenerateOption(kddContext: KDDContext, optionIndex: number, panel: vscode.WebviewPanel): Promise<void> {
    const feedback = await vscode.window.showInputBox({
        prompt: 'What would you like to change about this option?',
        placeHolder: 'e.g., Make it more cloud-native, reduce complexity, focus on cost optimization',
        ignoreFocusOut: true
    });

    if (!feedback) {
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Regenerating Option ${optionIndex + 1}...`,
        cancellable: false
    }, async () => {
        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o'
            });

            if (models.length === 0) {
                throw new Error('No AI models available');
            }

            const model = models[0];

            const prompt = `You are an experienced software architect. Based on the following context and feedback, regenerate the design option.

Problem Statement: ${kddContext.problemStatement}

Current Option:
Title: ${kddContext.options[optionIndex].title}
Description: ${kddContext.options[optionIndex].description}

User Feedback: ${feedback}

Generate a new design option that addresses the feedback. Provide:
1. A clear, descriptive title
2. A detailed description (2-3 paragraphs)
3. At least 4 pros (advantages)
4. At least 4 cons (disadvantages)
5. An effort estimate (Small/Medium/Large/XLarge)

Format your response as JSON:
{
    "title": "Option title",
    "description": "Detailed description",
    "pros": ["Pro 1", "Pro 2", ...],
    "cons": ["Con 1", "Con 2", ...],
    "effortEstimate": "Medium"
}`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const fragment of response.text) {
                fullResponse += fragment;
            }

            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const newOption = JSON.parse(jsonMatch[0]);
                kddContext.options[optionIndex] = newOption;
                
                // Update webview
                panel.webview.html = getRefineOptionsWebview(kddContext.options);
            }

        } catch (error) {
            console.error('Error regenerating option:', error);
            vscode.window.showErrorMessage(`Failed to regenerate option: ${error}`);
        }
    });
}

async function evaluateOptions(kddContext: KDDContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'kddEvaluate',
        'Evaluate Design Options',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getEvaluationWebview(kddContext.options);

    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'submitEvaluation':
                        // Update options with scores
                        message.data.scores.forEach((score: any, index: number) => {
                            kddContext.options[index].scores = score;
                        });
                        
                        kddContext.selectedOption = message.data.selectedOption;
                        kddContext.justification = message.data.justification;
                        
                        panel.dispose();
                        resolve();
                        break;
                    case 'getAIRecommendation':
                        await getAIRecommendation(kddContext, panel);
                        break;
                }
            }
        );
    });
}

async function getAIRecommendation(kddContext: KDDContext, panel: vscode.WebviewPanel): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Getting AI recommendation...',
        cancellable: false
    }, async () => {
        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o'
            });

            if (models.length === 0) {
                throw new Error('No AI models available');
            }

            const model = models[0];

            const optionsText = kddContext.options.map((opt, i) => `
Option ${i + 1}: ${opt.title}
Description: ${opt.description}

Pros:
${opt.pros.map(p => `- ${p}`).join('\n')}

Cons:
${opt.cons.map(c => `- ${c}`).join('\n')}

Effort: ${opt.effortEstimate}
`).join('\n---\n');

            const prompt = `You are an experienced software architect. Based on the following design options, recommend which option is best and provide a detailed justification.

Problem Statement: ${kddContext.problemStatement}

Design Options:
${optionsText}

Non-Functional Requirements:
- Performance: ${kddContext.nonFunctionalRequirements?.performance || 'Not specified'}
- Scalability: ${kddContext.nonFunctionalRequirements?.scalability || 'Not specified'}
- Security: ${kddContext.nonFunctionalRequirements?.security || 'Not specified'}
- Maintainability: ${kddContext.nonFunctionalRequirements?.maintainability || 'Not specified'}
- Reliability: ${kddContext.nonFunctionalRequirements?.reliability || 'Not specified'}

Constraints:
${kddContext.constraints?.map(c => `- ${c}`).join('\n') || 'Not provided'}

Provide:
1. Which option you recommend (1, 2, or 3)
2. A detailed justification (3-4 paragraphs)
3. Scores for each option (1-10) on: performance, scalability, cost, complexity, timeToMarket

Format your response as JSON:
{
    "recommendedOption": 1,
    "justification": "Detailed justification...",
    "scores": [
        {
            "performance": 8,
            "scalability": 7,
            "cost": 6,
            "complexity": 5,
            "timeToMarket": 9
        }
    ]
}`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const fragment of response.text) {
                fullResponse += fragment;
            }

            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const recommendation = JSON.parse(jsonMatch[0]);
                
                // Send recommendation back to webview
                panel.webview.postMessage({
                    command: 'aiRecommendation',
                    data: recommendation
                });
            }

        } catch (error) {
            console.error('Error getting AI recommendation:', error);
            vscode.window.showErrorMessage(`Failed to get AI recommendation: ${error}`);
        }
    });
}

async function enrichSelectedOption(kddContext: KDDContext): Promise<void> {
    if (kddContext.selectedOption === undefined || kddContext.selectedOption === null) {
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Enriching selected option with implementation details...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 20, message: 'Analyzing selected option...' });

            const selectedOpt = kddContext.options[kddContext.selectedOption!];

            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o'
            });

            if (models.length === 0) {
                throw new Error('No AI models available');
            }

            const model = models[0];

            progress.report({ increment: 30, message: 'Generating implementation details...' });

            const prompt = `You are a senior software architect providing detailed implementation guidance.

Problem Statement: ${kddContext.problemStatement}

Selected Design Option: ${selectedOpt.title}
Description: ${selectedOpt.description}

Business Context: ${kddContext.businessContext || 'Not provided'}
Technical Challenge: ${kddContext.technicalChallenge || 'Not provided'}

Non-Functional Requirements:
- Performance: ${kddContext.nonFunctionalRequirements?.performance || 'Not specified'}
- Scalability: ${kddContext.nonFunctionalRequirements?.scalability || 'Not specified'}
- Security: ${kddContext.nonFunctionalRequirements?.security || 'Not specified'}
- Maintainability: ${kddContext.nonFunctionalRequirements?.maintainability || 'Not specified'}
- Reliability: ${kddContext.nonFunctionalRequirements?.reliability || 'Not specified'}

Constraints:
${kddContext.constraints?.map(c => `- ${c}`).join('\n') || 'Not provided'}

Provide detailed implementation guidance:

1. **Implementation Details**: Step-by-step breakdown of how to implement this option (2-3 paragraphs)

2. **Technology Stack**: Specific technologies, frameworks, and tools recommended (array of strings)
   Example: ["ASP.NET Core 8", "PostgreSQL", "Redis", "Docker", "Kubernetes"]

3. **Resource Requirements**: Team composition and skills needed
   Example: "2 senior backend engineers, 1 DevOps engineer, 1 database specialist. Skills: .NET, Kubernetes, PostgreSQL"

4. **Timeline Breakdown**: Detailed sprint/phase breakdown
   Example: "Sprint 1: Database schema + Repository layer (2 weeks), Sprint 2: API implementation (2 weeks), Sprint 3: Testing + deployment (1 week)"

5. **Security Considerations**: Specific security measures and best practices (2-3 paragraphs)

6. **Testing Strategy**: Comprehensive testing approach (2-3 paragraphs covering unit, integration, performance, security testing)

7. **Success Metrics**: Measurable KPIs to validate success (array of strings)
   Example: ["API response time < 200ms", "99.9% uptime", "Zero security vulnerabilities"]

8. **Dependencies**: External dependencies and integration points (array of strings)
   Example: ["Azure AD for authentication", "MPS stored procedure", "Redis cluster"]

9. **Risk Mitigation**: Detailed mitigation strategies for identified risks (2-3 paragraphs)

Format your response as JSON:
{
    "implementationDetails": "...",
    "technologyStack": ["...", "..."],
    "resourceRequirements": "...",
    "timelineBreakdown": "...",
    "securityConsiderations": "...",
    "testingStrategy": "...",
    "successMetrics": ["...", "..."],
    "dependencies": ["...", "..."],
    "riskMitigation": "..."
}`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            progress.report({ increment: 30, message: 'Processing AI response...' });

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const fragment of response.text) {
                fullResponse += fragment;
            }

            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const enrichment = JSON.parse(jsonMatch[0]);
                
                // Enrich the selected option
                selectedOpt.implementationDetails = enrichment.implementationDetails;
                selectedOpt.technologyStack = enrichment.technologyStack;
                selectedOpt.resourceRequirements = enrichment.resourceRequirements;
                selectedOpt.timelineBreakdown = enrichment.timelineBreakdown;
                selectedOpt.securityConsiderations = enrichment.securityConsiderations;
                selectedOpt.testingStrategy = enrichment.testingStrategy;
                selectedOpt.successMetrics = enrichment.successMetrics;
                selectedOpt.dependencies = enrichment.dependencies;
                selectedOpt.riskMitigation = enrichment.riskMitigation;

                progress.report({ increment: 20, message: 'Enrichment complete!' });
            } else {
                throw new Error('Failed to parse AI enrichment response');
            }

        } catch (error: any) {
            console.error('Error enriching option:', error);
            vscode.window.showWarningMessage(`Failed to enrich option: ${error.message}. Continuing with basic details.`);
        }
    });
}

async function generateKDDDocument(kddContext: KDDContext): Promise<void> {
    const templatePath = path.join(__dirname, '..', '..', 'templates', 'kdd', 'GWAM_KDD_Template.md');
    
    if (!fs.existsSync(templatePath)) {
        vscode.window.showErrorMessage('KDD template not found');
        return;
    }

    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    const now = new Date();
    template = template.replace('{DOCUMENT_ID}', `KDD-${now.getTime()}`);
    template = template.replace('{PROJECT_NAME}', vscode.workspace.name || 'Project');
    template = template.replace('{COMPONENT_NAME}', 'TBD');
    template = template.replace('{AUTHOR}', 'Generated by DevEx AI Assistant');
    template = template.replace('{DATE}', now.toISOString().split('T')[0]);
    template = template.replace('{STATUS}', 'Draft');

    // Problem Statement
    template = template.replace('{BUSINESS_CONTEXT}', kddContext.businessContext || 'Not provided');
    template = template.replace('{TECHNICAL_CHALLENGE}', kddContext.technicalChallenge || kddContext.problemStatement);
    template = template.replace('{CURRENT_STATE}', kddContext.currentState || 'Not provided');
    template = template.replace('{DESIRED_OUTCOME}', kddContext.desiredOutcome || 'Not provided');

    // Design Criteria
    template = template.replace('{FUNCTIONAL_REQUIREMENTS}', 
        kddContext.functionalRequirements?.map(r => `- ${r}`).join('\n') || 'Not provided');
    template = template.replace('{PERFORMANCE_CRITERIA}', kddContext.nonFunctionalRequirements?.performance || 'Not specified');
    template = template.replace('{SCALABILITY_CRITERIA}', kddContext.nonFunctionalRequirements?.scalability || 'Not specified');
    template = template.replace('{SECURITY_CRITERIA}', kddContext.nonFunctionalRequirements?.security || 'Not specified');
    template = template.replace('{MAINTAINABILITY_CRITERIA}', kddContext.nonFunctionalRequirements?.maintainability || 'Not specified');
    template = template.replace('{RELIABILITY_CRITERIA}', kddContext.nonFunctionalRequirements?.reliability || 'Not specified');
    template = template.replace('{CONSTRAINTS}', 
        kddContext.constraints?.map(c => `- ${c}`).join('\n') || 'Not provided');
    template = template.replace('{ASSUMPTIONS}', 
        kddContext.assumptions?.map(a => `- ${a}`).join('\n') || 'Not provided');

    // Design Options
    kddContext.options.forEach((option, i) => {
        const optionNum = i + 1;
        template = template.replace(`{OPTION_${optionNum}_TITLE}`, option.title);
        template = template.replace(`{OPTION_${optionNum}_DESCRIPTION}`, option.description);
        template = template.replace(`{OPTION_${optionNum}_DIAGRAM}`, '[Diagram placeholder - add manually]');
        template = template.replace(`{OPTION_${optionNum}_PROS}`, 
            option.pros.map(p => `- ${p}`).join('\n'));
        template = template.replace(`{OPTION_${optionNum}_CONS}`, 
            option.cons.map(c => `- ${c}`).join('\n'));
        template = template.replace(`{OPTION_${optionNum}_EFFORT}`, option.effortEstimate || 'Not estimated');
    });

    // Decision Matrix (if scores are available)
    if (kddContext.options[0].scores) {
        template = template.replace('{WEIGHT_PERFORMANCE}', '25%');
        template = template.replace('{WEIGHT_SCALABILITY}', '20%');
        template = template.replace('{WEIGHT_COST}', '20%');
        template = template.replace('{WEIGHT_COMPLEXITY}', '15%');
        template = template.replace('{WEIGHT_TTM}', '20%');

        kddContext.options.forEach((option, i) => {
            if (option.scores) {
                template = template.replace(`{SCORE_O${i+1}_PERFORMANCE}`, option.scores.performance.toString());
                template = template.replace(`{SCORE_O${i+1}_SCALABILITY}`, option.scores.scalability.toString());
                template = template.replace(`{SCORE_O${i+1}_COST}`, option.scores.cost.toString());
                template = template.replace(`{SCORE_O${i+1}_COMPLEXITY}`, option.scores.complexity.toString());
                template = template.replace(`{SCORE_O${i+1}_TTM}`, option.scores.timeToMarket.toString());
                
                const total = (
                    option.scores.performance * 0.25 +
                    option.scores.scalability * 0.20 +
                    option.scores.cost * 0.20 +
                    option.scores.complexity * 0.15 +
                    option.scores.timeToMarket * 0.20
                ).toFixed(2);
                template = template.replace(`{TOTAL_O${i+1}}`, total);
            }
        });
    }

    // Recommended Approach
    if (kddContext.selectedOption !== undefined) {
        const selectedOpt = kddContext.options[kddContext.selectedOption];
        template = template.replace('{SELECTED_OPTION}', selectedOpt.title);
        template = template.replace('{JUSTIFICATION}', kddContext.justification || 'Not provided');
        template = template.replace('{KEY_BENEFITS}', 
            selectedOpt.pros.map(p => `- ${p}`).join('\n'));
        template = template.replace('{RISK_MITIGATION}', 
            selectedOpt.riskMitigation || selectedOpt.cons.map(c => `- Mitigation for: ${c}`).join('\n'));
        
        // Add enrichment sections if available
        if (selectedOpt.implementationDetails) {
            template = template.replace('{IMPLEMENTATION_DETAILS}', selectedOpt.implementationDetails);
        }
        if (selectedOpt.technologyStack) {
            template = template.replace('{TECHNOLOGY_STACK}', 
                selectedOpt.technologyStack.map(t => `- ${t}`).join('\n'));
        }
        if (selectedOpt.resourceRequirements) {
            template = template.replace('{RESOURCE_REQUIREMENTS}', selectedOpt.resourceRequirements);
        }
        if (selectedOpt.timelineBreakdown) {
            template = template.replace('{TIMELINE_BREAKDOWN}', selectedOpt.timelineBreakdown);
        }
        if (selectedOpt.securityConsiderations) {
            template = template.replace('{SECURITY_CONSIDERATIONS}', selectedOpt.securityConsiderations);
        }
        if (selectedOpt.testingStrategy) {
            template = template.replace('{TESTING_STRATEGY}', selectedOpt.testingStrategy);
        }
        if (selectedOpt.successMetrics) {
            template = template.replace('{SUCCESS_METRICS}', 
                selectedOpt.successMetrics.map(m => `- ${m}`).join('\n'));
        }
        if (selectedOpt.dependencies) {
            template = template.replace('{DEPENDENCIES_LIST}', 
                selectedOpt.dependencies.map(d => `- ${d}`).join('\n'));
        }
    }

    // Save document
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const kddFileName = `KDD-${now.getTime()}.md`;
    const kddPath = path.join(workspaceFolder.uri.fsPath, kddFileName);
    
    fs.writeFileSync(kddPath, template);

    const doc = await vscode.workspace.openTextDocument(kddPath);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(`KDD generated successfully: ${kddFileName}`);
}

function getContextGatheringWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KDD Context Gathering</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h2 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 2px solid var(--vscode-titleBar-activeBackground);
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
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
            resize: vertical;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .section {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <h2>🎯 Gather Context for KDD</h2>
    
    <div class="section">
        <h3>Problem Statement</h3>
        <div class="form-group">
            <label>Business Context</label>
            <textarea id="businessContext" placeholder="What is the business driver or context for this decision?"></textarea>
        </div>
        <div class="form-group">
            <label>Technical Challenge</label>
            <textarea id="technicalChallenge" placeholder="What is the specific technical challenge you're trying to solve?"></textarea>
        </div>
        <div class="form-group">
            <label>Current State</label>
            <textarea id="currentState" placeholder="Describe the current system/architecture state"></textarea>
        </div>
        <div class="form-group">
            <label>Desired Outcome</label>
            <textarea id="desiredOutcome" placeholder="What is the desired end state after implementing this decision?"></textarea>
        </div>
    </div>

    <div class="section">
        <h3>Requirements</h3>
        <div class="form-group">
            <label>Functional Requirements (one per line)</label>
            <textarea id="functionalRequirements" placeholder="- Must support 1000 concurrent users&#10;- Must integrate with legacy systems&#10;- Must provide real-time data processing"></textarea>
        </div>
        <div class="form-group">
            <label>Performance Requirements</label>
            <input type="text" id="performance" placeholder="e.g., Response time < 200ms, 99.9% uptime">
        </div>
        <div class="form-group">
            <label>Scalability Requirements</label>
            <input type="text" id="scalability" placeholder="e.g., Must scale to 10K users, horizontal scaling required">
        </div>
        <div class="form-group">
            <label>Security Requirements</label>
            <input type="text" id="security" placeholder="e.g., OAuth 2.0, data encryption at rest and in transit">
        </div>
        <div class="form-group">
            <label>Maintainability Requirements</label>
            <input type="text" id="maintainability" placeholder="e.g., Code coverage > 80%, automated testing">
        </div>
        <div class="form-group">
            <label>Reliability Requirements</label>
            <input type="text" id="reliability" placeholder="e.g., 99.99% availability, disaster recovery plan">
        </div>
    </div>

    <div class="section">
        <h3>Constraints & Assumptions</h3>
        <div class="form-group">
            <label>Constraints (one per line)</label>
            <textarea id="constraints" placeholder="- Must use existing Azure subscription&#10;- Budget limit: $50K&#10;- Must be completed in 3 months"></textarea>
        </div>
        <div class="form-group">
            <label>Assumptions (one per line)</label>
            <textarea id="assumptions" placeholder="- Team has Azure expertise&#10;- Legacy system APIs are documented&#10;- No major org changes during implementation"></textarea>
        </div>
    </div>

    <button onclick="submitContext()">Next: Generate Design Options</button>

    <script>
        const vscode = acquireVsCodeApi();

        function submitContext() {
            vscode.postMessage({
                command: 'submitContext',
                data: {
                    businessContext: document.getElementById('businessContext').value,
                    technicalChallenge: document.getElementById('technicalChallenge').value,
                    currentState: document.getElementById('currentState').value,
                    desiredOutcome: document.getElementById('desiredOutcome').value,
                    functionalRequirements: document.getElementById('functionalRequirements').value,
                    performance: document.getElementById('performance').value,
                    scalability: document.getElementById('scalability').value,
                    security: document.getElementById('security').value,
                    maintainability: document.getElementById('maintainability').value,
                    reliability: document.getElementById('reliability').value,
                    constraints: document.getElementById('constraints').value,
                    assumptions: document.getElementById('assumptions').value
                }
            });
        }
    </script>
</body>
</html>`;
}

function getRefineOptionsWebview(options: DesignOption[]): string {
    const optionsHtml = options.map((opt, i) => `
        <div class="option-card">
            <h3>Option ${i + 1}</h3>
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="title-${i}" value="${opt.title.replace(/"/g, '&quot;')}">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="description-${i}">${opt.description}</textarea>
            </div>
            <div class="form-group">
                <label>Pros (one per line)</label>
                <textarea id="pros-${i}">${opt.pros.join('\n')}</textarea>
            </div>
            <div class="form-group">
                <label>Cons (one per line)</label>
                <textarea id="cons-${i}">${opt.cons.join('\n')}</textarea>
            </div>
            <div class="form-group">
                <label>Effort Estimate</label>
                <select id="effort-${i}">
                    <option ${opt.effortEstimate === 'Small' ? 'selected' : ''}>Small</option>
                    <option ${opt.effortEstimate === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option ${opt.effortEstimate === 'Large' ? 'selected' : ''}>Large</option>
                    <option ${opt.effortEstimate === 'XLarge' ? 'selected' : ''}>XLarge</option>
                </select>
            </div>
            <button onclick="regenerateOption(${i})">🔄 Regenerate This Option</button>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Refine Design Options</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h2 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 2px solid var(--vscode-titleBar-activeBackground);
            padding-bottom: 10px;
        }
        .option-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, textarea, select {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        textarea {
            min-height: 80px;
            resize: vertical;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            margin-right: 10px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <h2>✏️ Refine Design Options</h2>
    <p>Review and edit the AI-generated design options below. You can regenerate any option if needed.</p>
    
    ${optionsHtml}

    <button onclick="submitOptions()">Next: Evaluate Options</button>

    <script>
        const vscode = acquireVsCodeApi();

        function submitOptions() {
            const options = [];
            for (let i = 0; i < ${options.length}; i++) {
                options.push({
                    title: document.getElementById('title-' + i).value,
                    description: document.getElementById('description-' + i).value,
                    pros: document.getElementById('pros-' + i).value.split('\\n').filter(p => p.trim()),
                    cons: document.getElementById('cons-' + i).value.split('\\n').filter(c => c.trim()),
                    effortEstimate: document.getElementById('effort-' + i).value
                });
            }

            vscode.postMessage({
                command: 'submitOptions',
                data: { options }
            });
        }

        function regenerateOption(index) {
            vscode.postMessage({
                command: 'regenerateOption',
                data: { optionIndex: index }
            });
        }
    </script>
</body>
</html>`;
}

function getEvaluationWebview(options: DesignOption[]): string {
    const optionsHtml = options.map((opt, i) => `
        <div class="option-card">
            <h3>${opt.title}</h3>
            <p>${opt.description}</p>
            <div class="scores">
                <div class="score-item">
                    <label>Performance (1-10)</label>
                    <input type="number" id="perf-${i}" min="1" max="10" value="5">
                </div>
                <div class="score-item">
                    <label>Scalability (1-10)</label>
                    <input type="number" id="scale-${i}" min="1" max="10" value="5">
                </div>
                <div class="score-item">
                    <label>Cost (1-10)</label>
                    <input type="number" id="cost-${i}" min="1" max="10" value="5">
                </div>
                <div class="score-item">
                    <label>Complexity (1-10, lower is better)</label>
                    <input type="number" id="complex-${i}" min="1" max="10" value="5">
                </div>
                <div class="score-item">
                    <label>Time to Market (1-10)</label>
                    <input type="number" id="ttm-${i}" min="1" max="10" value="5">
                </div>
            </div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Evaluate Design Options</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h2 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 2px solid var(--vscode-titleBar-activeBackground);
            padding-bottom: 10px;
        }
        .option-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .scores {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }
        .score-item {
            display: flex;
            flex-direction: column;
        }
        label {
            font-size: 12px;
            margin-bottom: 5px;
        }
        input[type="number"] {
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            margin-right: 10px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .recommendation {
            margin-top: 20px;
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        select, textarea {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            margin-top: 10px;
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
    </style>
</head>
<body>
    <h2>📊 Evaluate Design Options</h2>
    <p>Score each option on key criteria (1-10, where 10 is best)</p>
    
    <button onclick="getAIRecommendation()">🤖 Get AI Recommendation</button>
    
    <div id="recommendation" style="display:none;" class="recommendation">
        <h3>AI Recommendation</h3>
        <p id="recommendationText"></p>
    </div>
    
    ${optionsHtml}

    <h3>Final Decision</h3>
    <label>Select Recommended Option</label>
    <select id="selectedOption">
        ${options.map((opt, i) => `<option value="${i}">${opt.title}</option>`).join('')}
    </select>

    <label>Justification</label>
    <textarea id="justification" placeholder="Explain why this option was selected..."></textarea>

    <br><br>
    <button onclick="submitEvaluation()">Generate KDD Document</button>

    <script>
        const vscode = acquireVsCodeApi();

        function getAIRecommendation() {
            vscode.postMessage({
                command: 'getAIRecommendation'
            });
        }

        function submitEvaluation() {
            const scores = [];
            for (let i = 0; i < ${options.length}; i++) {
                scores.push({
                    performance: parseInt(document.getElementById('perf-' + i).value),
                    scalability: parseInt(document.getElementById('scale-' + i).value),
                    cost: parseInt(document.getElementById('cost-' + i).value),
                    complexity: parseInt(document.getElementById('complex-' + i).value),
                    timeToMarket: parseInt(document.getElementById('ttm-' + i).value)
                });
            }

            vscode.postMessage({
                command: 'submitEvaluation',
                data: {
                    scores,
                    selectedOption: parseInt(document.getElementById('selectedOption').value),
                    justification: document.getElementById('justification').value
                }
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'aiRecommendation') {
                const rec = message.data;
                document.getElementById('recommendation').style.display = 'block';
                document.getElementById('recommendationText').innerHTML = 
                    '<strong>Recommended: Option ' + rec.recommendedOption + '</strong><br><br>' + 
                    rec.justification;
                document.getElementById('selectedOption').value = rec.recommendedOption - 1;
                document.getElementById('justification').value = rec.justification;
                
                // Update scores
                rec.scores.forEach((score, i) => {
                    document.getElementById('perf-' + i).value = score.performance;
                    document.getElementById('scale-' + i).value = score.scalability;
                    document.getElementById('cost-' + i).value = score.cost;
                    document.getElementById('complex-' + i).value = score.complexity;
                    document.getElementById('ttm-' + i).value = score.timeToMarket;
                });
            }
        });
    </script>
</body>
</html>`;
}
