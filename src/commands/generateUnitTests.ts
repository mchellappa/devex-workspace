import * as vscode from 'vscode';
import * as path from 'path';
import { TestGenerationService, TestGenerationResult } from '../services/testGenerationService';
import { logger } from '../utils/logger';

/**
 * Command: Generate Unit Tests
 * 
 * Generates comprehensive unit tests for a Java or C# source file
 * to achieve 80%+ code coverage
 */
export async function generateUnitTestsCommand(): Promise<void> {
    try {
        // Step 1: Get active file or let user select
        const editor = vscode.window.activeTextEditor;
        let sourceFilePath: string;

        if (editor && (editor.document.fileName.endsWith('.java') || editor.document.fileName.endsWith('.cs'))) {
            sourceFilePath = editor.document.fileName;
        } else {
            // Let user select a file
            const fileUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: 'Select source file to generate tests for',
                filters: {
                    'Source Files': ['java', 'cs']
                }
            });

            if (!fileUris || fileUris.length === 0) {
                return;
            }

            sourceFilePath = fileUris[0].fsPath;
        }

        const fileName = path.basename(sourceFilePath);
        logger.info(`Generating unit tests for: ${fileName}`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Unit Tests for ${fileName}`,
            cancellable: false
        }, async (progress) => {

            progress.report({ increment: 10, message: 'Analyzing source code...' });

            const testService = new TestGenerationService();

            // Step 2: Ask for target coverage
            const coverageInput = await vscode.window.showQuickPick([
                { label: '80%', description: 'Recommended for most projects', value: 80 },
                { label: '85%', description: 'High coverage', value: 85 },
                { label: '90%', description: 'Very high coverage (may be excessive)', value: 90 },
                { label: 'Custom', description: 'Enter custom percentage', value: -1 }
            ], {
                placeHolder: 'Select target code coverage'
            });

            if (!coverageInput) {
                return;
            }

            let targetCoverage = coverageInput.value;

            if (targetCoverage === -1) {
                const customInput = await vscode.window.showInputBox({
                    prompt: 'Enter target coverage percentage (e.g., 75)',
                    value: '80',
                    validateInput: (value) => {
                        const num = parseInt(value);
                        if (isNaN(num) || num < 50 || num > 100) {
                            return 'Please enter a number between 50 and 100';
                        }
                        return null;
                    }
                });

                if (!customInput) {
                    return;
                }

                targetCoverage = parseInt(customInput);
            }

            progress.report({ increment: 20, message: `Analyzing code structure (target: ${targetCoverage}%)...` });

            // Step 3: Analyze code
            const analysis = await testService.analyzeCodeForTesting(sourceFilePath, targetCoverage);

            progress.report({ 
                increment: 20, 
                message: `Found ${analysis.publicMethods.length} methods. Generating ${analysis.estimatedTestsNeeded} tests...` 
            });

            // Show preview of what will be tested
            const methodList = analysis.publicMethods
                .map(m => `• ${m.name}(...) - ${m.edgeCases.length} edge cases`)
                .join('\n');

            const proceed = await vscode.window.showInformationMessage(
                `📊 **Test Generation Plan**\n\n` +
                `**Class:** ${analysis.className}\n` +
                `**Methods to Test:** ${analysis.publicMethods.length}\n` +
                `**Estimated Tests:** ${analysis.estimatedTestsNeeded}\n` +
                `**Expected Coverage:** ~${targetCoverage}%\n\n` +
                `**Methods:**\n${methodList}\n\n` +
                `Generate tests now?`,
                { modal: true },
                'Generate Tests',
                'Cancel'
            );

            if (proceed !== 'Generate Tests') {
                return;
            }

            progress.report({ increment: 30, message: 'Generating test code with AI...' });

            // Step 4: Generate tests
            const result = await testService.generateUnitTests(sourceFilePath, {
                targetCoverage,
                includeEdgeCases: true,
                includeMockSetup: true
            });

            progress.report({ increment: 10, message: 'Saving test file...' });

            // Step 5: Save test file
            await testService.saveTestFile(result);

            progress.report({ increment: 10, message: 'Complete!' });

            // Step 6: Show success message with results
            const action = await vscode.window.showInformationMessage(
                `✅ **Unit Tests Generated Successfully!**\n\n` +
                `**Test File:** ${path.basename(result.testFilePath)}\n` +
                `**Tests Created:** ${result.generatedTestCount}\n` +
                `**Methods Tested:** ${result.methods.length}\n` +
                `**Estimated Coverage:** ${result.coverageEstimate}%\n\n` +
                `**Next Steps:**\n` +
                `1. Review generated tests\n` +
                `2. Run tests to verify they pass\n` +
                `3. Adjust assertions as needed\n` +
                `4. Run coverage report to confirm ${targetCoverage}%+ coverage`,
                'Open Test File',
                'View Source & Test',
                'Close'
            );

            if (action === 'Open Test File') {
                const doc = await vscode.workspace.openTextDocument(result.testFilePath);
                await vscode.window.showTextDocument(doc);
            } else if (action === 'View Source & Test') {
                // Open side-by-side
                const sourceDoc = await vscode.workspace.openTextDocument(sourceFilePath);
                await vscode.window.showTextDocument(sourceDoc, vscode.ViewColumn.One);
                
                const testDoc = await vscode.workspace.openTextDocument(result.testFilePath);
                await vscode.window.showTextDocument(testDoc, vscode.ViewColumn.Two);
            }

            logger.info(`Successfully generated ${result.generatedTestCount} tests for ${fileName}`);
        });

    } catch (error: any) {
        logger.error(`Test generation failed: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to generate tests: ${error.message}`);
    }
}

/**
 * Command: Generate Tests for Project
 * 
 * Batch generates unit tests for all source files in a project
 */
export async function generateTestsForProjectCommand(): Promise<void> {
    try {
        // Step 1: Select project folder
        const folderUris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select project root folder'
        });

        if (!folderUris || folderUris.length === 0) {
            return;
        }

        const projectPath = folderUris[0].fsPath;
        logger.info(`Generating tests for project: ${projectPath}`);

        // Step 2: Ask for target coverage
        const coverageInput = await vscode.window.showQuickPick([
            { label: '80%', description: 'Recommended for most projects', value: 80 },
            { label: '85%', description: 'High coverage', value: 85 }
        ], {
            placeHolder: 'Select target code coverage for entire project'
        });

        if (!coverageInput) {
            return;
        }

        const targetCoverage = coverageInput.value;

        // Confirm with user
        const confirm = await vscode.window.showWarningMessage(
            `⚠️ **Batch Test Generation**\n\n` +
            `This will generate unit tests for ALL source files (.java, .cs) in the project.\n` +
            `Target coverage: ${targetCoverage}%\n\n` +
            `This may take several minutes for large projects.\n\n` +
            `Continue?`,
            { modal: true },
            'Yes, Generate All Tests',
            'Cancel'
        );

        if (confirm !== 'Yes, Generate All Tests') {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Unit Tests for Project',
            cancellable: false
        }, async (progress) => {

            progress.report({ increment: 5, message: 'Scanning project...' });

            const testService = new TestGenerationService();
            const results = await testService.generateTestsForProject(projectPath, targetCoverage);

            const totalTests = results.reduce((sum, r) => sum + r.generatedTestCount, 0);
            const avgCoverage = Math.round(
                results.reduce((sum, r) => sum + r.coverageEstimate, 0) / results.length
            );

            // Create summary file
            const summaryPath = path.join(projectPath, 'TEST_GENERATION_SUMMARY.md');
            const summaryContent = generateSummary(results, targetCoverage, avgCoverage);
            const fs = require('fs');
            fs.writeFileSync(summaryPath, summaryContent, 'utf-8');

            progress.report({ increment: 100, message: 'Complete!' });

            const action = await vscode.window.showInformationMessage(
                `✅ **Project Test Generation Complete!**\n\n` +
                `**Files Processed:** ${results.length}\n` +
                `**Total Tests Generated:** ${totalTests}\n` +
                `**Average Coverage:** ${avgCoverage}%\n` +
                `**Target Coverage:** ${targetCoverage}%\n\n` +
                `**Next Steps:**\n` +
                `1. Review TEST_GENERATION_SUMMARY.md\n` +
                `2. Run all tests: mvn test (Java) or dotnet test (.NET)\n` +
                `3. Generate coverage report\n` +
                `4. Review and adjust tests as needed`,
                'Open Summary',
                'Close'
            );

            if (action === 'Open Summary') {
                const doc = await vscode.workspace.openTextDocument(summaryPath);
                await vscode.window.showTextDocument(doc);
            }

            logger.info(`Project test generation complete: ${results.length} files, ${totalTests} tests`);
        });

    } catch (error: any) {
        logger.error(`Project test generation failed: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to generate project tests: ${error.message}`);
    }
}

/**
 * Generate summary markdown
 */
function generateSummary(results: TestGenerationResult[], targetCoverage: number, avgCoverage: number): string {
    const totalTests = results.reduce((sum, r) => sum + r.generatedTestCount, 0);
    const successIcon = avgCoverage >= targetCoverage ? '✅' : '⚠️';

    return `# Test Generation Summary

**Generated:** ${new Date().toLocaleString()}
**Target Coverage:** ${targetCoverage}%
**Actual Average Coverage:** ${avgCoverage}% ${successIcon}
**Total Files:** ${results.length}
**Total Tests Generated:** ${totalTests}

---

## Files Processed

${results.map(r => `
### ${path.basename(r.testFilePath)}

- **Source:** ${path.basename(r.testFilePath.replace('Test.java', '.java').replace('Tests.cs', '.cs'))}
- **Tests Generated:** ${r.generatedTestCount}
- **Methods Tested:** ${r.methods.length}
- **Estimated Coverage:** ${r.coverageEstimate}% ${r.coverageEstimate >= targetCoverage ? '✅' : '⚠️'}
- **Test File:** \`${r.testFilePath}\`

**Methods Covered:**
${r.methods.map(m => `- ${m}(...)`).join('\n')}
`).join('\n---\n')}

---

## Next Steps

### 1. Run Tests

**Java/Maven:**
\`\`\`bash
mvn test
\`\`\`

**Java/Gradle:**
\`\`\`bash
./gradlew test
\`\`\`

**.NET:**
\`\`\`bash
dotnet test
\`\`\`

### 2. Generate Coverage Report

**Java (JaCoCo):**
\`\`\`bash
mvn jacoco:report
# View: target/site/jacoco/index.html
\`\`\`

**.NET (Coverlet):**
\`\`\`bash
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=opencover
dotnet tool install -g dotnet-reportgenerator-globaltool
reportgenerator -reports:coverage.opencover.xml -targetdir:coveragereport
# View: coveragereport/index.html
\`\`\`

### 3. Review & Adjust

- Review generated tests for accuracy
- Adjust assertions to match business logic
- Add additional edge cases if needed
- Ensure all tests pass

### 4. Coverage Goals

${avgCoverage >= targetCoverage 
    ? '✅ **Target coverage achieved!** Review tests and commit to repository.' 
    : `⚠️ **Target not met.** Review low-coverage files and add additional tests.`}

**Coverage Breakdown:**
${results.map(r => `- ${path.basename(r.testFilePath)}: ${r.coverageEstimate}%`).join('\n')}

---

Generated by DevEx AI Assistant
`;
}
