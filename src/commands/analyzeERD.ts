import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Analyzes an ERD PNG file using vision AI
 */
export async function analyzeERDImage(imagePath: string): Promise<string> {
    try {
        // Read the image file
        const imageBuffer = fs.readFileSync(imagePath);
        
        // Find a suitable vision model
        const models = await vscode.lm.selectChatModels({ 
            vendor: 'copilot'
        });

        const visionModel = models.find(m => 
            m.family.includes('gpt-4') || 
            m.family.includes('claude') ||
            m.id.includes('vision')
        );

        if (!visionModel) {
            throw new Error('No vision-capable model available');
        }

        const prompt = `Analyze this Entity Relationship Diagram (ERD) for a database schema.

Extract the following information in a structured format:

**1. Entity Names**: List all entities/tables shown in the diagram

**2. For EACH entity, extract:**
   - **Entity name** (exact name from diagram)
   - **All field names** with their data types (e.g., VARCHAR, INT, DECIMAL, TIMESTAMP, UUID, etc.)
   - **Primary key** field(s) marked with (PK)
   - **Foreign key** field(s) marked with (FK) and what entity they reference
   - **Nullable fields** (if indicated)
   - **Any constraints** (UNIQUE, CHECK, NOT NULL, etc.)

**3. Relationships**:
   - Between which entities
   - Cardinality (1:1, 1:N, M:N)
   - Relationship names (if shown)

**4. Additional Details**:
   - Any indexes shown
   - Any business rules or constraints visible
   - Any enum values or lookup tables

Please provide the information in this exact format:

## Entity: [EntityName]
### Fields:
- field_name (DATA_TYPE, PK/FK, constraints)
- ...

### Relationships:
- [relationship description]

Focus on ACCURACY - extract EXACTLY what you see in the diagram. Use the exact field names and data types shown.`;

        const imageDataPart = new vscode.LanguageModelDataPart(imageBuffer, 'image/png');
        
        const messages = [
            vscode.LanguageModelChatMessage.User([
                prompt,
                imageDataPart
            ] as any)
        ];

        const response = await visionModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let fullResponse = '';
        for await (const chunk of response.text) {
            fullResponse += chunk;
        }

        return fullResponse;
    } catch (error: any) {
        throw new Error(`Failed to analyze ERD image: ${error.message}`);
    }
}

/**
 * Command to analyze an ERD PNG file
 */
export async function analyzeERDCommand(fileUri?: vscode.Uri): Promise<void> {
    try {
        let imagePath: string;

        if (fileUri) {
            imagePath = fileUri.fsPath;
        } else {
            // Prompt user to select a PNG file
            const fileUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Images': ['png', 'jpg', 'jpeg']
                },
                title: 'Select ERD Diagram'
            });

            if (!fileUris || fileUris.length === 0) {
                return;
            }

            imagePath = fileUris[0].fsPath;
        }

        // Check if file is an image
        const ext = path.extname(imagePath).toLowerCase();
        if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
            vscode.window.showErrorMessage('Please select a PNG or JPEG image file.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing ERD Diagram...',
            cancellable: false
        }, async () => {
            const analysis = await analyzeERDImage(imagePath);

            // Save analysis to a text file
            const outputPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, '-analysis.txt');
            fs.writeFileSync(outputPath, analysis);

            // Open the analysis file
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`ERD analysis saved to: ${path.basename(outputPath)}`);
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to analyze ERD: ${error.message}`);
    }
}
