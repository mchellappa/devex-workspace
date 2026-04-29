import * as vscode from 'vscode';
import * as mammoth from 'mammoth';
import { logger } from './logger';

export interface ExtractedImage {
    base64: string;
    contentType: string;
    description?: string;
}

export interface DocxExtractionResult {
    content: string;
    images: ExtractedImage[];
}

/**
 * Extracts both HTML content (preserving tables) and images from a DOCX file.
 */
export async function extractDocxWithImages(filePath: string): Promise<DocxExtractionResult> {
    const extractedImages: ExtractedImage[] = [];
    
    const options = {
        path: filePath,
        convertImage: mammoth.images.imgElement(async (image: any) => {
            try {
                const buffer = await image.read();
                const base64 = buffer.toString('base64');
                const contentType = image.contentType || 'image/png';
                
                extractedImages.push({
                    base64,
                    contentType
                });
                
                return {
                    src: `data:${contentType};base64,${base64}`,
                    alt: `Image ${extractedImages.length}`
                };
            } catch (error: any) {
                logger.error(`Failed to extract image: ${error.message}`);
                return { src: '', alt: 'Failed to extract image' };
            }
        })
    } as any; // Type assertion needed due to mammoth types limitations
    
    const result = await mammoth.convertToHtml(options);
    
    if (result.messages && result.messages.length > 0) {
        logger.info(`Mammoth warnings: ${result.messages.map(m => m.message).join(', ')}`);
    }
    
    logger.info(`Extracted ${result.value.length} characters and ${extractedImages.length} images from .docx file`);
    
    return {
        content: result.value,
        images: extractedImages
    };
}

/**
 * Analyzes images to extract relevant technical information.
 * The context parameter helps tailor the analysis prompt.
 */
export async function analyzeImagesWithVision(
    images: ExtractedImage[], 
    context: 'api' | 'architecture' | 'general'
): Promise<string> {
    if (images.length === 0) {
        return '';
    }

    logger.info(`Starting analysis of ${images.length} images with context: ${context}...`);
    
    const analyses: string[] = [];
    
    for (let i = 0; i < images.length; i++) {
        try {
            const image = images[i];
            const analysis = await analyzeImageWithVision(image, context, i + 1);
            
            if (analysis && !analysis.toLowerCase().includes('no relevant information') && 
                !analysis.toLowerCase().includes('could not be analyzed')) {
                analyses.push(`### Image ${i + 1} Analysis:\n${analysis}\n`);
                logger.info(`Image ${i + 1} analyzed successfully`);
            } else {
                logger.info(`Image ${i + 1} contains no relevant information`);
            }
        } catch (error: any) {
            logger.error(`Failed to analyze image ${i + 1}: ${error.message}`);
        }
    }
    
    if (analyses.length === 0) {
        return '';
    }
    
    return analyses.join('\n');
}

/**
 * Analyzes a single image using vision-capable AI models.
 */
async function analyzeImageWithVision(
    image: ExtractedImage, 
    context: 'api' | 'architecture' | 'general',
    imageNumber: number
): Promise<string> {
    try {
        const models = await vscode.lm.selectChatModels({ 
            vendor: 'copilot'
        });

        const visionModel = models.find(m => 
            m.family.includes('gpt-4') || 
            m.family.includes('claude') ||
            m.id.includes('vision')
        );

        if (!visionModel) {
            logger.warn('No vision-capable model available, skipping image analysis');
            return 'No relevant information found.';
        }

        logger.info(`Using vision model: ${visionModel.id}`);

        const prompt = getPromptForContext(context);
        const systemPrompt = getSystemPromptForContext(context);

        const imageDataPart = new vscode.LanguageModelDataPart(
            Buffer.from(image.base64, 'base64'),
            image.contentType
        );
        
        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(prompt)
        ];
        
        try {
            const messageWithImage = vscode.LanguageModelChatMessage.User([
                new vscode.LanguageModelTextPart(prompt),
                imageDataPart
            ]);
            messages[1] = messageWithImage;
        } catch (error: any) {
            logger.warn(`Model may not support vision: ${error.message}`);
        }

        const response = await visionModel.sendRequest(
            messages, 
            {}, 
            new vscode.CancellationTokenSource().token
        );

        let content = '';
        for await (const fragment of response.text) {
            content += fragment;
        }

        return content.trim();
    } catch (error: any) {
        logger.error(`Vision API error: ${error.message}`);
        return 'Image present but could not be analyzed automatically. Please review the original document for visual diagrams.';
    }
}

function getPromptForContext(context: 'api' | 'architecture' | 'general'): string {
    switch (context) {
        case 'api':
            return `Analyze this image from an API design document. This image may contain:
- API architecture diagrams
- Flow diagrams showing API interactions
- Lucid charts showing system components
- Sequence diagrams
- Database schemas or ER diagrams
- Tables with API endpoint definitions
- Authentication/authorization flows

Extract and describe:
1. Any API endpoints, methods, or routes visible
2. Request/response flow patterns
3. Data models, entities, or schemas
4. Authentication/security mechanisms
5. Integration points or external services
6. Any other API-relevant information

If the image doesn't contain API-related information, respond with "No relevant information found."

Be specific and structured in your response. Focus on technical details.`;

        case 'architecture':
            return `Analyze this image from a technical architecture document. This image may contain:
- System architecture diagrams
- Component diagrams
- Deployment diagrams
- Network diagrams
- Data flow diagrams
- Lucid charts showing system design
- Infrastructure diagrams
- Integration patterns

Extract and describe:
1. System components and their relationships
2. Data flow and communication patterns
3. Technology stack and frameworks
4. Deployment architecture
5. Security boundaries and mechanisms
6. Scalability and performance considerations
7. Integration points
8. Any design patterns or architectural decisions

If the image doesn't contain architecture-related information, respond with "No relevant information found."

Be specific and focus on architectural decisions and technical details.`;

        case 'general':
            return `Analyze this image from a technical design document. Extract and describe all relevant technical information including:
- Architecture and system design
- Components and their interactions
- Data models and schemas
- API definitions and endpoints
- Flow diagrams and processes
- Technical specifications
- Design patterns
- Integration points

If the image doesn't contain relevant technical information, respond with "No relevant information found."

Be comprehensive and focus on technical details that would be important for understanding the system design.`;
    }
}

function getSystemPromptForContext(context: 'api' | 'architecture' | 'general'): string {
    switch (context) {
        case 'api':
            return 'You are an expert at analyzing technical diagrams and extracting API specifications from visual representations like Lucid charts, architecture diagrams, and flowcharts.';
        
        case 'architecture':
            return 'You are a principal software architect expert at analyzing system architecture diagrams, design patterns, and technical documentation to extract architectural insights.';
        
        case 'general':
            return 'You are a technical expert at analyzing diagrams, charts, and visual technical documentation to extract comprehensive design information.';
    }
}
