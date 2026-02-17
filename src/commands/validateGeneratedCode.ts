import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Validate generated Spring Boot code for common issues
 */
export async function validateGeneratedCode(context: vscode.ExtensionContext): Promise<void> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const issues: string[] = [];
        const warnings: string[] = [];
        const info: string[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Validating Generated Code...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Checking project structure...' });

            // Check for pom.xml or build.gradle
            const hasPom = fs.existsSync(path.join(workspacePath, 'pom.xml'));
            const hasGradle = fs.existsSync(path.join(workspacePath, 'build.gradle'));
            
            if (!hasPom && !hasGradle) {
                issues.push('❌ Missing build file (pom.xml or build.gradle)');
            } else {
                info.push(`✅ Found build file: ${hasPom ? 'pom.xml' : 'build.gradle'}`);
                
                // Validate pom.xml
                if (hasPom) {
                    const pomContent = fs.readFileSync(path.join(workspacePath, 'pom.xml'), 'utf-8');
                    
                    // Check artifactId
                    const artifactIdMatch = pomContent.match(/<artifactId>([^<]+)<\/artifactId>/);
                    if (artifactIdMatch) {
                        const artifactId = artifactIdMatch[1];
                        if (artifactId === 'demo' || artifactId === 'app') {
                            warnings.push(`⚠️ Generic artifactId: "${artifactId}" - should be project-specific`);
                        } else {
                            info.push(`✅ artifactId: ${artifactId}`);
                        }
                    }
                }
            }

            progress.report({ increment: 20, message: 'Checking source files...' });

            // Check src/main/java structure
            const srcMainJava = path.join(workspacePath, 'src', 'main', 'java');
            if (!fs.existsSync(srcMainJava)) {
                issues.push('❌ Missing src/main/java directory');
            } else {
                info.push('✅ Found src/main/java');

                // Find base package
                const basePackage = findBasePackage(srcMainJava);
                if (basePackage) {
                    info.push(`✅ Base package: ${basePackage}`);
                    
                    const packagePath = path.join(srcMainJava, ...basePackage.split('.'));
                    
                    // Check for key directories
                    const expectedDirs = ['controller', 'service', 'repository', 'entity', 'dto', 'mapper'];
                    const foundDirs: string[] = [];
                    const missingDirs: string[] = [];
                    
                    for (const dir of expectedDirs) {
                        if (fs.existsSync(path.join(packagePath, dir))) {
                            foundDirs.push(dir);
                        } else {
                            missingDirs.push(dir);
                        }
                    }
                    
                    if (foundDirs.length > 0) {
                        info.push(`✅ Found directories: ${foundDirs.join(', ')}`);
                    }
                    if (missingDirs.length > 0) {
                        warnings.push(`⚠️ Missing directories: ${missingDirs.join(', ')}`);
                    }

                    // Check old structure (model/entity, model/dto)
                    if (fs.existsSync(path.join(packagePath, 'model', 'entity'))) {
                        issues.push('❌ OLD STRUCTURE DETECTED: model/entity directory exists');
                        issues.push('   Fix: Delete model/ directory and regenerate with v1.6.1');
                    }
                    if (fs.existsSync(path.join(packagePath, 'model', 'dto'))) {
                        issues.push('❌ OLD STRUCTURE DETECTED: model/dto directory exists');
                        issues.push('   Fix: Delete model/ directory and regenerate with v1.6.1');
                    }

                    progress.report({ increment: 30, message: 'Checking Java files...' });

                    // Check Service files for correct imports
                    const servicesDir = path.join(packagePath, 'service');
                    if (fs.existsSync(servicesDir)) {
                        const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.java'));
                        
                        for (const file of serviceFiles) {
                            const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
                            
                            // Check for old imports
                            if (content.includes('.model.entity.')) {
                                issues.push(`❌ ${file}: Uses OLD import ".model.entity." - should be ".entity."`);
                            }
                            if (content.includes('.model.dto.')) {
                                issues.push(`❌ ${file}: Uses OLD import ".model.dto." - should be ".dto."`);
                            }
                            
                            // Check for empty imports
                            if (content.match(/import\s+[a-z.]+\s*;/)) {
                                issues.push(`❌ ${file}: Has empty/malformed import statement`);
                            }
                            
                            // Check for TODO comments
                            const todoCount = (content.match(/\/\/\s*TODO/gi) || []).length;
                            if (todoCount > 0) {
                                warnings.push(`⚠️ ${file}: Contains ${todoCount} TODO comments`);
                            }
                        }
                        
                        if (serviceFiles.length > 0) {
                            info.push(`✅ Found ${serviceFiles.length} service file(s)`);
                        }
                    }

                    // Check Entity files
                    const entitiesDir = path.join(packagePath, 'entity');
                    if (fs.existsSync(entitiesDir)) {
                        const entityFiles = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.java'));
                        
                        for (const file of entityFiles) {
                            const content = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
                            
                            // Check package declaration
                            const packageMatch = content.match(/package\s+([^;]+);/);
                            if (packageMatch) {
                                const declaredPackage = packageMatch[1];
                                if (declaredPackage.includes('.model.entity')) {
                                    issues.push(`❌ ${file}: Package declaration uses OLD ".model.entity" - should be ".entity"`);
                                }
                            }
                        }
                        
                        if (entityFiles.length > 0) {
                            info.push(`✅ Found ${entityFiles.length} entity file(s)`);
                        }
                    }

                    // Check Controller files
                    const controllersDir = path.join(packagePath, 'controller');
                    if (fs.existsSync(controllersDir)) {
                        const controllerFiles = fs.readdirSync(controllersDir).filter(f => f.endsWith('.java'));
                        
                        for (const file of controllerFiles) {
                            const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');
                            
                            // Check for @RestController
                            if (!content.includes('@RestController')) {
                                warnings.push(`⚠️ ${file}: Missing @RestController annotation`);
                            }
                            
                            // Check for old imports
                            if (content.includes('.model.dto.')) {
                                issues.push(`❌ ${file}: Uses OLD import ".model.dto." - should be ".dto."`);
                            }
                        }
                        
                        if (controllerFiles.length > 0) {
                            info.push(`✅ Found ${controllerFiles.length} controller file(s)`);
                        }
                    }
                }
            }

            progress.report({ increment: 40, message: 'Generating report...' });
        });

        // Generate report
        const report = `# Code Validation Report

## Summary
- **Issues**: ${issues.length}
- **Warnings**: ${warnings.length}
- **Info**: ${info.length}

${issues.length > 0 ? `## ❌ Critical Issues\n${issues.map(i => `${i}`).join('\n')}\n` : ''}
${warnings.length > 0 ? `## ⚠️ Warnings\n${warnings.map(w => `${w}`).join('\n')}\n` : ''}
${info.length > 0 ? `## ✅ Info\n${info.map(i => `${i}`).join('\n')}\n` : ''}

${issues.length === 0 && warnings.length === 0 ? '## ✅ All Checks Passed!\n\nYour generated code looks good!' : ''}

---
*Generated by DevEx AI Assistant v1.6.1*
`;

        // Show report
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

        if (issues.length > 0) {
            vscode.window.showErrorMessage(`Found ${issues.length} critical issue(s) in generated code. See report.`);
        } else if (warnings.length > 0) {
            vscode.window.showWarningMessage(`Found ${warnings.length} warning(s) in generated code. See report.`);
        } else {
            vscode.window.showInformationMessage('✅ Code validation passed!');
        }

    } catch (error: any) {
        logger.error('Failed to validate code', error);
        vscode.window.showErrorMessage(`Failed to validate code: ${error.message}`);
    }
}

function findBasePackage(srcMainJava: string): string | undefined {
    const dirs = fs.readdirSync(srcMainJava);
    
    // Walk down to find the application class
    function walk(currentPath: string, packageParts: string[] = []): string | undefined {
        const entries = fs.readdirSync(currentPath);
        
        // Check for Application class
        const appClass = entries.find(e => e.endsWith('Application.java'));
        if (appClass) {
            return packageParts.join('.');
        }
        
        // Continue walking
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry);
            if (fs.statSync(fullPath).isDirectory()) {
                const result = walk(fullPath, [...packageParts, entry]);
                if (result) {
                    return result;
                }
            }
        }
        
        return undefined;
    }
    
    for (const dir of dirs) {
        const fullPath = path.join(srcMainJava, dir);
        if (fs.statSync(fullPath).isDirectory()) {
            const result = walk(fullPath, [dir]);
            if (result) {
                return result;
            }
        }
    }
    
    return undefined;
}
