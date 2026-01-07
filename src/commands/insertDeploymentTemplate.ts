import * as vscode from 'vscode';
import { TemplateProvider } from '../services/templateProvider';
import { TelemetryService } from '../services/telemetryService';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export async function insertDeploymentTemplateCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const startTime = Date.now();

    try {
        const config = getConfig();
        const templateProvider = new TemplateProvider(context.extensionPath, config.customTemplatesPath);

        // Get available templates
        const templates = await templateProvider.getDeploymentTemplates();

        if (templates.length === 0) {
            vscode.window.showInformationMessage(
                'No deployment templates found. Please add your YAML files to the templates/ folder.',
                'Open Templates Folder'
            ).then(selection => {
                if (selection === 'Open Templates Folder') {
                    const templatesPath = templateProvider.getTemplatesBasePath();
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(templatesPath));
                }
            });
            return;
        }

        // Show quick pick
        const items = templates.map(t => ({
            label: t.name,
            description: t.category,
            detail: t.description,
            template: t
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a deployment template to insert',
            matchOnDescription: true
        });

        if (!selected) {
            return;
        }

        // Read template content
        const templateContent = await templateProvider.readTemplate(selected.template.path);

        // Insert into active editor or create new file
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, templateContent);
            });
            vscode.window.showInformationMessage(`Template "${selected.label}" inserted successfully!`);
        } else {
            // Create new file
            const doc = await vscode.workspace.openTextDocument({
                content: templateContent,
                language: selected.label.endsWith('.yaml') || selected.label.endsWith('.yml') ? 'yaml' : undefined
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`Template "${selected.label}" opened in new file!`);
        }

        const actualTimeSeconds = (Date.now() - startTime) / 1000;
        await telemetryService.trackProductivityMetric('insert-deployment-template', 10, actualTimeSeconds);

        logger.info(`Template inserted: ${selected.label}`);
    } catch (error: any) {
        logger.error('Failed to insert deployment template', error);
        vscode.window.showErrorMessage(`Failed to insert template: ${error.message}`);
    }
}
