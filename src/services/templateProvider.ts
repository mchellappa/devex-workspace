import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { logger } from '../utils/logger';

export interface DeploymentTemplate {
    name: string;
    path: string;
    category: 'kubernetes' | 'docker' | 'ci-cd';
    description: string;
}

export class TemplateProvider {
    private extensionPath: string;
    private customTemplatesPath: string;

    constructor(extensionPath: string, customTemplatesPath?: string) {
        this.extensionPath = extensionPath;
        this.customTemplatesPath = customTemplatesPath || '';
    }

    getTemplatesBasePath(): string {
        // Use custom path if provided, otherwise use extension's templates
        if (this.customTemplatesPath && fs.existsSync(this.customTemplatesPath)) {
            return this.customTemplatesPath;
        }
        return path.join(this.extensionPath, 'templates');
    }

    async getDeploymentTemplates(): Promise<DeploymentTemplate[]> {
        const basePath = this.getTemplatesBasePath();
        const templates: DeploymentTemplate[] = [];

        const categories: Array<'kubernetes' | 'docker' | 'ci-cd'> = ['kubernetes', 'docker', 'ci-cd'];

        for (const category of categories) {
            const categoryPath = path.join(basePath, category);
            if (fs.existsSync(categoryPath)) {
                const files = await fs.promises.readdir(categoryPath);
                for (const file of files) {
                    if (file.endsWith('.yaml') || file.endsWith('.yml') || file === 'Dockerfile') {
                        const filePath = path.join(categoryPath, file);
                        templates.push({
                            name: file,
                            path: filePath,
                            category,
                            description: `${category} template: ${file}`
                        });
                    }
                }
            }
        }

        return templates;
    }

    async readTemplate(templatePath: string): Promise<string> {
        return await fs.promises.readFile(templatePath, 'utf-8');
    }

    getSpringBootTemplatePath(templateName: string): string {
        return path.join(this.extensionPath, 'templates', 'springboot', templateName);
    }

    async readSpringBootTemplate(templateName: string): Promise<string> {
        const templatePath = this.getSpringBootTemplatePath(templateName);
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template not found: ${templateName}`);
        }
        return await fs.promises.readFile(templatePath, 'utf-8');
    }

    async copyDeploymentTemplates(targetDir: string): Promise<void> {
        const templates = await this.getDeploymentTemplates();
        
        for (const template of templates) {
            const targetCategoryDir = path.join(targetDir, template.category);
            if (!fs.existsSync(targetCategoryDir)) {
                await fs.promises.mkdir(targetCategoryDir, { recursive: true });
            }

            const targetPath = path.join(targetCategoryDir, template.name);
            const content = await this.readTemplate(template.path);
            await fs.promises.writeFile(targetPath, content, 'utf-8');
            logger.info(`Copied template: ${template.name} to ${targetPath}`);
        }
    }
}
