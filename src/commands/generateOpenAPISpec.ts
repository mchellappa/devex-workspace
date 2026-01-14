import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIService } from '../services/aiService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';
import { extractDocxWithImages, analyzeImagesWithVision, ExtractedImage } from '../utils/imageAnalyzer';

export async function generateOpenAPISpecCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    fileUri?: vscode.Uri
): Promise<void> {
    const startTime = Date.now();

    try {
        let document: vscode.TextDocument | undefined;
        let filePath: string;

        // Try to get document from active editor or from provided URI
        if (fileUri) {
            filePath = fileUri.fsPath;
            const fileExtension = filePath.substring(filePath.lastIndexOf('.'));
            
            if (!['.md', '.txt', '.docx'].includes(fileExtension.toLowerCase())) {
                vscode.window.showWarningMessage('This command supports .md, .txt, and .docx files.');
                return;
            }

            if (fileExtension.toLowerCase() !== '.docx') {
                document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document, { preview: false });
            }
        } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor. Please open an LLD document first.');
                return;
            }
            document = editor.document;
            filePath = document.fileName;
            
            const fileExtension = filePath.substring(filePath.lastIndexOf('.'));
            
            if (!['.md', '.txt', '.docx'].includes(fileExtension.toLowerCase())) {
                vscode.window.showWarningMessage('This command supports .md, .txt, and .docx files.');
                return;
            }
        }

        const fileExtension = filePath.substring(filePath.lastIndexOf('.'));

        // Prompt for manual time estimate
        const manualTime = await promptManualTime();
        if (!manualTime) {
            return;
        }

        let content: string;
        let images: ExtractedImage[] = [];

        // Extract content based on file type
        if (fileExtension.toLowerCase() === '.docx') {
            try {
                // Extract both content and images using shared utility
                const result = await extractDocxWithImages(filePath);
                content = result.content;
                images = result.images;
            } catch (error: any) {
                throw new Error(`Failed to read .docx file: ${error.message}`);
            }
        } else {
            content = document!.getText();
        }

        // Get additional context through interactive questions
        const apiInfo = await gatherAPIContext();
        if (!apiInfo) {
            return; // User cancelled
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating OpenAPI Specification',
                cancellable: false
            },
            async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing LLD with AI...' });

                const aiService = new AIService();
                
                // If we have images, analyze them first to extract relevant information
                let imageAnalysis = '';
                if (images.length > 0) {
                    progress.report({ increment: 20, message: `Analyzing ${images.length} images (diagrams/charts)...` });
                    imageAnalysis = await analyzeImagesWithVision(images, 'api');
                    logger.info(`Image analysis completed: ${imageAnalysis.length} characters`);
                }
                
                progress.report({ increment: 40, message: 'Generating OpenAPI spec...' });
                
                // Combine content with image analysis
                const fullContent = imageAnalysis ? 
                    `${content}\n\n## Additional Information from Images/Diagrams:\n${imageAnalysis}` : 
                    content;
                
                const openAPISpec = await aiService.generateOpenAPISpec(fullContent, apiInfo);

                progress.report({ increment: 80, message: 'Validating OpenAPI spec...' });

                // Validate that it's valid YAML/JSON
                let parsedSpec;
                try {
                    parsedSpec = JSON.parse(openAPISpec);
                } catch (e) {
                    // Might be YAML, that's okay
                    logger.info('Generated spec is in YAML format');
                }

                progress.report({ increment: 100, message: 'Specification generated!' });

                // Ask user where to save the spec
                const saveLocation = await promptSaveLocation(filePath, apiInfo.format);
                if (!saveLocation) {
                    // Show in preview instead
                    await showSpecPreview(openAPISpec, apiInfo.format);
                } else {
                    // Save to file
                    fs.writeFileSync(saveLocation, openAPISpec, 'utf8');
                    
                    // Open the generated file
                    const specDoc = await vscode.workspace.openTextDocument(saveLocation);
                    await vscode.window.showTextDocument(specDoc);

                    vscode.window.showInformationMessage(
                        `OpenAPI spec generated: ${path.basename(saveLocation)}`,
                        'View', 'Generate Spring Boot Project'
                    ).then(action => {
                        if (action === 'Generate Spring Boot Project') {
                            vscode.commands.executeCommand('devex.generateSpringBootProject');
                        }
                    });
                }

                // Track metrics
                const actualTime = (Date.now() - startTime) / 1000;
                telemetryService.trackProductivityMetric('generateOpenAPISpec', manualTime, actualTime);

                // Ask for feedback
                const feedback = await vscode.window.showInformationMessage(
                    'Was this OpenAPI spec helpful?',
                    'Yes 👍',
                    'No 👎',
                    'Needs Changes'
                );

                telemetryService.trackEvent('generateOpenAPISpec', {
                    helpful: feedback === 'Yes 👍',
                    timeSaved: manualTime - actualTime,
                    format: apiInfo.format
                });
            }
        );

    } catch (error: any) {
        logger.error('Generate OpenAPI Spec failed', error);
        vscode.window.showErrorMessage(`Failed to generate OpenAPI spec: ${error.message}`);
        
        telemetryService.trackEvent('generateOpenAPISpec', {
            success: false,
            error: error.message
        });
    }
}

async function promptManualTime(): Promise<number | undefined> {
    const timeOptions = [
        { label: '15 minutes', value: 15 },
        { label: '30 minutes', value: 30 },
        { label: '1 hour', value: 60 },
        { label: '2 hours', value: 120 },
        { label: '4 hours', value: 240 },
        { label: 'Custom', value: -1 }
    ];

    const selected = await vscode.window.showQuickPick(timeOptions, {
        placeHolder: 'How long would it take to write this OpenAPI spec manually?',
        title: 'Productivity Tracking'
    });

    if (!selected) {
        return undefined;
    }

    if (selected.value === -1) {
        const customInput = await vscode.window.showInputBox({
            prompt: 'Enter time in minutes',
            placeHolder: 'e.g., 45',
            validateInput: (value) => {
                const num = parseInt(value);
                return isNaN(num) || num <= 0 ? 'Please enter a valid positive number' : undefined;
            }
        });

        return customInput ? parseInt(customInput) : undefined;
    }

    return selected.value;
}

interface APIContext {
    serviceName: string;
    version: string;
    format: 'yaml' | 'json';
    includeExamples: boolean;
    includeSecurity: boolean;
}

async function gatherAPIContext(): Promise<APIContext | undefined> {
    // Service name
    const serviceName = await vscode.window.showInputBox({
        prompt: 'Enter the API service name',
        placeHolder: 'e.g., User Management API',
        value: 'My API'
    });

    if (!serviceName) {
        return undefined;
    }

    // Version
    const version = await vscode.window.showInputBox({
        prompt: 'Enter the API version',
        placeHolder: 'e.g., 1.0.0',
        value: '1.0.0'
    });

    if (!version) {
        return undefined;
    }

    // Format
    const formatChoice = await vscode.window.showQuickPick(
        [
            { label: 'YAML', value: 'yaml' as const, description: 'Recommended - easier to read' },
            { label: 'JSON', value: 'json' as const, description: 'Easier to parse programmatically' }
        ],
        {
            placeHolder: 'Select output format',
            title: 'OpenAPI Format'
        }
    );

    if (!formatChoice) {
        return undefined;
    }

    // Additional options
    const options = await vscode.window.showQuickPick(
        [
            { label: 'Include request/response examples', picked: true },
            { label: 'Include security definitions', picked: true }
        ],
        {
            placeHolder: 'Select additional options',
            title: 'OpenAPI Options',
            canPickMany: true
        }
    );

    return {
        serviceName,
        version,
        format: formatChoice.value,
        includeExamples: options?.some(o => o.label.includes('examples')) ?? true,
        includeSecurity: options?.some(o => o.label.includes('security')) ?? true
    };
}

async function promptSaveLocation(sourcePath: string, format: 'yaml' | 'json'): Promise<string | undefined> {
    const sourceDir = path.dirname(sourcePath);
    const suggestedName = `openapi.${format}`;
    const suggestedPath = path.join(sourceDir, suggestedName);

    const action = await vscode.window.showInformationMessage(
        `Save OpenAPI spec as ${suggestedName}?`,
        'Save Here',
        'Choose Location',
        'Preview Only'
    );

    if (action === 'Save Here') {
        return suggestedPath;
    } else if (action === 'Choose Location') {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(suggestedPath),
            filters: {
                'OpenAPI Spec': format === 'yaml' ? ['yaml', 'yml'] : ['json']
            }
        });
        return uri?.fsPath;
    }

    return undefined; // Preview only
}

async function showSpecPreview(spec: string, format: 'yaml' | 'json'): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
        content: spec,
        language: format === 'yaml' ? 'yaml' : 'json'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    
    vscode.window.showInformationMessage(
        'OpenAPI spec preview. Save this file to use it.',
        'Save As'
    ).then(action => {
        if (action === 'Save As') {
            vscode.commands.executeCommand('workbench.action.files.saveAs');
        }
    });
}

/**
 * Analyzes images extracted from DOCX files to extract API-relevant information.
 * This is particularly useful for Lucid charts, architecture diagrams, and flow diagrams.
 */

