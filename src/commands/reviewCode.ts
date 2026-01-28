import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AIService } from '../services/aiService';
import { TelemetryService } from '../services/telemetryService';
import { EmailService } from '../services/emailService';
import { logger } from '../utils/logger';

interface CodeFile {
    path: string;
    content: string;
    language: string;
}

export async function reviewCodeCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    folderUri?: vscode.Uri
): Promise<void> {
    const startTime = Date.now();

    try {
        let targetFolder: string;

        // Get the folder to review
        if (folderUri) {
            // Called from context menu on a folder in Explorer
            targetFolder = folderUri.fsPath;
        } else {
            // Called from command palette - prompt for folder
            const folderOptions = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Folder to Review'
            });

            if (!folderOptions || folderOptions.length === 0) {
                return;
            }

            targetFolder = folderOptions[0].fsPath;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Principal Engineer Code Review',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Analyzing codebase...' });

            // Detect project type
            const projectType = detectProjectType(targetFolder);
            logger.info(`Detected project type: ${projectType}`);

            progress.report({ message: `Scanning ${projectType} project...` });

            // Collect code files
            const codeFiles = await collectCodeFiles(targetFolder, projectType);
            logger.info(`Found ${codeFiles.length} code files`);

            if (codeFiles.length === 0) {
                vscode.window.showWarningMessage('No code files found in the selected folder.');
                return;
            }

            // Limit the number of files to review (to avoid token limits)
            const maxFiles = 50;
            const filesToReview = codeFiles.slice(0, maxFiles);
            
            if (codeFiles.length > maxFiles) {
                vscode.window.showInformationMessage(`Reviewing first ${maxFiles} of ${codeFiles.length} files.`);
            }

            progress.report({ message: 'Performing principal engineer review...' });

            // Perform AI-powered code review
            const aiService = new AIService();
            const reviewSummary = await aiService.reviewCode(filesToReview, projectType, targetFolder);

            progress.report({ message: 'Generating review document...' });

            // Create review document
            const reviewFilePath = await createReviewDocument(reviewSummary, targetFolder, projectType);

            // Track telemetry
            const duration = Date.now() - startTime;
            telemetryService.trackEvent('reviewCode', {
                projectType,
                fileCount: filesToReview.length,
                duration
            });

            // Show completion dialog with sharing options
            await showReviewCompletionDialog(reviewSummary, reviewFilePath, path.basename(targetFolder), projectType, filesToReview.length);
        });

    } catch (error: any) {
        logger.error('Code review failed', error);
        vscode.window.showErrorMessage(`Code review failed: ${error.message}`);
        
        telemetryService.trackEvent('reviewCode.error', { error: error.message });
    }
}

function detectProjectType(folderPath: string): string {
    // Check for Spring Boot (Java)
    if (fs.existsSync(path.join(folderPath, 'pom.xml')) || 
        fs.existsSync(path.join(folderPath, 'build.gradle'))) {
        return 'Spring Boot (Java)';
    }

    // Check for Node.js
    if (fs.existsSync(path.join(folderPath, 'package.json'))) {
        const packageJsonPath = path.join(folderPath, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        
        // Check for common Node.js frameworks
        if (packageJson.dependencies) {
            if (packageJson.dependencies.express || packageJson.devDependencies?.express) {
                return 'Node.js (Express)';
            }
            if (packageJson.dependencies.nestjs || packageJson.dependencies['@nestjs/core']) {
                return 'Node.js (NestJS)';
            }
        }
        return 'Node.js';
    }

    // Check for .NET
    if (fs.existsSync(path.join(folderPath, '*.csproj')) || 
        fs.existsSync(path.join(folderPath, '*.sln'))) {
        return '.NET';
    }

    // Check for .csproj files in subdirectories
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
        if (file.endsWith('.csproj') || file.endsWith('.sln')) {
            return '.NET';
        }
    }

    return 'Unknown';
}

async function collectCodeFiles(folderPath: string, projectType: string): Promise<CodeFile[]> {
    const codeFiles: CodeFile[] = [];
    const extensions = getRelevantExtensions(projectType);

    async function scanDirectory(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip common directories to ignore
            if (entry.isDirectory()) {
                const dirName = entry.name;
                if (['node_modules', 'target', 'build', 'bin', 'obj', 'dist', '.git', '.vscode'].includes(dirName)) {
                    continue;
                }
                await scanDirectory(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.includes(ext)) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        codeFiles.push({
                            path: path.relative(folderPath, fullPath),
                            content,
                            language: getLanguageFromExtension(ext)
                        });
                    } catch (error) {
                        logger.warn(`Failed to read file: ${fullPath}`);
                    }
                }
            }
        }
    }

    await scanDirectory(folderPath);
    return codeFiles;
}

function getRelevantExtensions(projectType: string): string[] {
    if (projectType.includes('Java') || projectType.includes('Spring Boot')) {
        return ['.java', '.xml', '.properties', '.yml', '.yaml'];
    } else if (projectType.includes('Node.js')) {
        return ['.js', '.ts', '.jsx', '.tsx', '.json'];
    } else if (projectType.includes('.NET')) {
        return ['.cs', '.csproj', '.sln', '.config', '.json'];
    }
    // Default: common code file extensions
    return ['.java', '.js', '.ts', '.cs', '.py', '.go', '.rb', '.php'];
}

function getLanguageFromExtension(ext: string): string {
    const languageMap: { [key: string]: string } = {
        '.java': 'java',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascriptreact',
        '.tsx': 'typescriptreact',
        '.cs': 'csharp',
        '.py': 'python',
        '.go': 'go',
        '.rb': 'ruby',
        '.php': 'php',
        '.xml': 'xml',
        '.json': 'json',
        '.yml': 'yaml',
        '.yaml': 'yaml'
    };
    return languageMap[ext] || 'plaintext';
}

async function createReviewDocument(reviewContent: string, folderPath: string, projectType: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = path.basename(folderPath);
    const reviewFileName = `CODE_REVIEW_${folderName}_${timestamp}.md`;
    const reviewFilePath = path.join(folderPath, reviewFileName);

    const header = `# Principal Engineer Code Review
## Project: ${folderName}
## Type: ${projectType}
## Date: ${new Date().toLocaleString()}

---

`;

    const fullContent = header + reviewContent;

    fs.writeFileSync(reviewFilePath, fullContent, 'utf-8');

    // Open the review document
    const doc = await vscode.workspace.openTextDocument(reviewFilePath);
    await vscode.window.showTextDocument(doc, { preview: false });
    
    return reviewFilePath;
}

/**
 * Show completion dialog with sharing options
 */
async function showReviewCompletionDialog(
    reviewContent: string,
    reviewFilePath: string,
    projectName: string,
    projectType: string,
    fileCount: number
): Promise<void> {
    const fileName = path.basename(reviewFilePath);
    
    const action = await vscode.window.showInformationMessage(
        `✅ Code Review Completed!\n\n` +
        `📊 Project: ${projectName}\n` +
        `📝 Files Reviewed: ${fileCount}\n` +
        `⏱️ Time Saved: ~2 hours`,
        'Open Review',
        'Share via Email',
        'Copy Summary'
    );
    
    switch (action) {
        case 'Open Review':
            const doc = await vscode.workspace.openTextDocument(reviewFilePath);
            await vscode.window.showTextDocument(doc);
            break;
            
        case 'Share via Email':
            await shareReviewViaEmail(reviewContent, reviewFilePath, projectName, projectType, fileCount);
            break;
            
        case 'Copy Summary':
            const summary = extractReviewSummary(reviewContent);
            await vscode.env.clipboard.writeText(summary);
            vscode.window.showInformationMessage('Review summary copied to clipboard!');
            break;
    }
}

/**
 * Share code review via email with review content in body
 */
async function shareReviewViaEmail(
    reviewContent: string,
    reviewFilePath: string,
    projectName: string,
    projectType: string,
    fileCount: number
): Promise<void> {
    // Extract key sections from review
    const summary = extractReviewSummary(reviewContent);
    const issues = extractIssuesSection(reviewContent);
    const recommendations = extractRecommendationsSection(reviewContent);
    
    // Build email body with review content
    let emailBody = `Hi Team,\n\n`;
    emailBody += `I've completed a Principal Engineer code review for the ${projectName} project.\n\n`;
    
    emailBody += `📊 Review Summary:\n`;
    emailBody += `- Project: ${projectName}\n`;
    emailBody += `- Type: ${projectType}\n`;
    emailBody += `- Files Reviewed: ${fileCount}\n`;
    emailBody += `- Date: ${new Date().toLocaleDateString()}\n\n`;
    
    // Add summary section
    if (summary) {
        emailBody += `🎯 Executive Summary:\n`;
        emailBody += summary + '\n\n';
    }
    
    // Add critical issues (if any)
    if (issues) {
        emailBody += `⚠️ Key Issues Found:\n`;
        emailBody += issues + '\n\n';
    }
    
    // Add top recommendations
    if (recommendations) {
        emailBody += `💡 Top Recommendations:\n`;
        emailBody += recommendations + '\n\n';
    }
    
    emailBody += `📎 Complete review document attached.\n\n`;
    emailBody += `Please review the detailed findings and let me know if you have any questions.\n\n`;
    emailBody += `Best regards`;
    
    await EmailService.composeEmail({
        subject: `Code Review Report: ${projectName}`,
        body: emailBody,
        attachmentPath: reviewFilePath,
        includeMetrics: true
    });
}

/**
 * Extract summary section from review content
 */
function extractReviewSummary(reviewContent: string): string {
    // Look for summary section
    const summaryMatch = reviewContent.match(/## Summary[\s\S]*?(?=\n## |$)/i);
    if (summaryMatch) {
        return summaryMatch[0].replace(/## Summary\s*/i, '').trim();
    }
    
    // Fallback: first paragraph
    const lines = reviewContent.split('\n').filter(line => line.trim());
    const firstParagraph = lines.slice(0, 3).join('\n');
    return firstParagraph;
}

/**
 * Extract critical issues from review
 */
function extractIssuesSection(reviewContent: string): string {
    // Look for issues/problems section
    const issuesMatch = reviewContent.match(/## (Critical Issues|Issues Found|Problems)[\s\S]*?(?=\n## |$)/i);
    if (issuesMatch) {
        const section = issuesMatch[0].replace(/## (Critical Issues|Issues Found|Problems)\s*/i, '').trim();
        // Take first 5 items
        const items = section.split('\n').filter(line => line.trim().match(/^[-*]\s/)).slice(0, 5);
        return items.join('\n');
    }
    return '';
}

/**
 * Extract recommendations from review
 */
function extractRecommendationsSection(reviewContent: string): string {
    // Look for recommendations section
    const recsMatch = reviewContent.match(/## Recommendations[\s\S]*?(?=\n## |$)/i);
    if (recsMatch) {
        const section = recsMatch[0].replace(/## Recommendations\s*/i, '').trim();
        // Take first 5 items
        const items = section.split('\n').filter(line => line.trim().match(/^[-*]\s/)).slice(0, 5);
        return items.join('\n');
    }
    return '';
}
