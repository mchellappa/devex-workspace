import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

export interface TestGenerationOptions {
    targetCoverage: number; // e.g., 80 for 80%
    includeEdgeCases: boolean;
    includeMockSetup: boolean;
    testFramework?: 'junit' | 'xunit' | 'nunit';
}

export interface TestGenerationResult {
    testFilePath: string;
    testContent: string;
    coverageEstimate: number;
    generatedTestCount: number;
    methods: string[];
}

export interface CoverageAnalysis {
    className: string;
    publicMethods: MethodInfo[];
    privateMethodsNeedingIndirectTests: MethodInfo[];
    estimatedTestsNeeded: number;
}

export interface MethodInfo {
    name: string;
    parameters: string[];
    returnType: string;
    isPublic: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    edgeCases: string[];
}

export class TestGenerationService {
    
    /**
     * Analyze source code to determine test coverage needs
     */
    async analyzeCodeForTesting(sourceFilePath: string, targetCoverage: number): Promise<CoverageAnalysis> {
        const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');
        const fileExtension = path.extname(sourceFilePath);
        const language = this.detectLanguage(fileExtension);
        
        logger.info(`Analyzing ${sourceFilePath} for test coverage (target: ${targetCoverage}%)`);

        // Use AI to analyze code structure
        const model = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4'
        });

        if (model.length === 0) {
            throw new Error('GitHub Copilot is not available');
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(`Analyze this ${language} source code for unit testing:

**Task:** Identify all testable methods and estimate complexity.

**Source Code:**
\`\`\`${language}
${sourceCode}
\`\`\`

**Required JSON Output:**
{
    "className": "class name",
    "publicMethods": [
        {
            "name": "method name",
            "parameters": ["param types"],
            "returnType": "return type",
            "isPublic": true,
            "complexity": "simple|medium|complex",
            "edgeCases": ["null params", "empty collections", "boundary values", etc.]
        }
    ],
    "privateMethodsNeedingIndirectTests": [
        // Private methods called by public methods that need indirect coverage
    ],
    "estimatedTestsNeeded": 0  // Total test methods needed for 80%+ coverage
}

**Complexity Guidelines:**
- **simple**: Single responsibility, no branches, straightforward logic
- **medium**: 2-5 conditional branches, moderate logic
- **complex**: >5 branches, multiple responsibilities, complex logic

**Edge Cases to Identify:**
- Null/empty parameters
- Boundary values (min/max, 0, -1)
- Exception scenarios
- Empty collections
- Invalid state
- Concurrent access (if applicable)

Return ONLY valid JSON, no markdown formatting.`)
        ];

        const response = await model[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        let analysisJson = '';
        
        for await (const chunk of response.text) {
            analysisJson += chunk;
        }

        // Clean up potential markdown formatting
        analysisJson = analysisJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        try {
            const analysis = JSON.parse(analysisJson) as CoverageAnalysis;
            logger.info(`Analysis complete: ${analysis.publicMethods.length} public methods, ${analysis.estimatedTestsNeeded} tests needed`);
            return analysis;
        } catch (error) {
            logger.error(`Failed to parse analysis JSON: ${error}`);
            throw new Error(`Failed to analyze code for testing: ${error}`);
        }
    }

    /**
     * Generate comprehensive unit tests for a source file
     */
    async generateUnitTests(
        sourceFilePath: string, 
        options: TestGenerationOptions
    ): Promise<TestGenerationResult> {
        const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');
        const fileExtension = path.extname(sourceFilePath);
        const language = this.detectLanguage(fileExtension);
        const fileName = path.basename(sourceFilePath, fileExtension);

        logger.info(`Generating unit tests for ${fileName} (target coverage: ${options.targetCoverage}%)`);

        // First, analyze what needs testing
        const analysis = await this.analyzeCodeForTesting(sourceFilePath, options.targetCoverage);

        // Generate tests based on analysis
        const testContent = await this.generateTestCode(
            sourceCode,
            analysis,
            language,
            fileName,
            options
        );

        // Determine test file path
        const testFilePath = this.getTestFilePath(sourceFilePath, language);

        return {
            testFilePath,
            testContent,
            coverageEstimate: this.estimateCoverage(analysis, options.targetCoverage),
            generatedTestCount: analysis.estimatedTestsNeeded,
            methods: analysis.publicMethods.map(m => m.name)
        };
    }

    /**
     * Generate the actual test code using AI
     */
    private async generateTestCode(
        sourceCode: string,
        analysis: CoverageAnalysis,
        language: string,
        className: string,
        options: TestGenerationOptions
    ): Promise<string> {
        const model = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4'
        });

        if (model.length === 0) {
            throw new Error('GitHub Copilot is not available');
        }

        const testFramework = options.testFramework || this.getDefaultTestFramework(language);
        const mockingFramework = this.getMockingFramework(language);

        const messages = [
            vscode.LanguageModelChatMessage.User(`Generate comprehensive unit tests for ${language} class to achieve ${options.targetCoverage}% code coverage.

**Source Code:**
\`\`\`${language}
${sourceCode}
\`\`\`

**Test Coverage Analysis:**
${JSON.stringify(analysis, null, 2)}

**Requirements:**
1. **Test Framework:** ${testFramework}
2. **Mocking Framework:** ${mockingFramework}
3. **Target Coverage:** ${options.targetCoverage}%
4. **Test All Public Methods:** ${analysis.publicMethods.map(m => m.name).join(', ')}
5. **Include Edge Cases:** ${options.includeEdgeCases ? 'YES' : 'NO'}
6. **Mock Dependencies:** ${options.includeMockSetup ? 'YES' : 'NO'}

**Test Structure Requirements:**

${language === 'java' ? `
**Java/JUnit 5 Structure:**
\`\`\`java
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("${className} Unit Tests")
class ${className}Test {
    
    private ${className} ${this.toCamelCase(className)};
    // Mock dependencies
    
    @BeforeEach
    void setUp() {
        // Initialize mocks and test subject
    }
    
    // For each method, generate:
    // 1. Happy path test (valid inputs, expected behavior)
    // 2. Edge case tests (null, empty, boundary values)
    // 3. Exception tests (invalid inputs, error conditions)
    // 4. Multiple scenarios if method has branches
    
    @Test
    @DisplayName("methodName with valid inputs should return expected result")
    void methodName_withValidInputs_shouldReturnExpectedResult() {
        // Arrange: Set up test data and mocks
        // Act: Call the method
        // Assert: Verify results and mock interactions
    }
    
    @Test
    @DisplayName("methodName with null parameter should throw exception")
    void methodName_withNullParameter_shouldThrowException() {
        assertThrows(IllegalArgumentException.class, () -> {
            // Call with null
        });
    }
}
\`\`\`
` : `
**C#/xUnit Structure:**
\`\`\`csharp
using Xunit;
using Moq;
using FluentAssertions;

namespace YourNamespace.Tests
{
    public class ${className}Tests
    {
        private readonly ${className} _${this.toCamelCase(className)};
        // Mock dependencies
        
        public ${className}Tests()
        {
            // Initialize mocks and test subject
        }
        
        [Fact]
        public void MethodName_WithValidInputs_ShouldReturnExpectedResult()
        {
            // Arrange
            // Act
            // Assert
        }
        
        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public void MethodName_WithInvalidInput_ShouldThrowException(string input)
        {
            // Arrange
            // Act & Assert
            Assert.Throws<ArgumentException>(() => _${this.toCamelCase(className)}.MethodName(input));
        }
    }
}
\`\`\`
`}

**Coverage Goals:**
- Every public method has at least 3 tests (happy path + 2 edge cases)
- Complex methods (>5 branches) have tests for each branch
- Exception paths are tested
- Boundary values are tested
- Null/empty parameter handling is tested

**Test Naming Convention:**
- Java: methodName_scenario_expectedBehavior()
- C#: MethodName_Scenario_ExpectedBehavior()

**Quality Requirements:**
- Use meaningful test data (not just "test", "foo", "bar")
- Clear Arrange/Act/Assert sections
- Descriptive assertions with messages
- Mock all external dependencies
- Test method isolation (no shared state)

Generate ONLY the complete test class code, no explanations. Include all necessary imports/using statements.`)
        ];

        const response = await model[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        let testCode = '';
        
        for await (const chunk of response.text) {
            testCode += chunk;
        }

        // Clean up code fences if AI added them
        testCode = testCode.replace(/```java\n?/g, '').replace(/```csharp\n?/g, '').replace(/```\n?/g, '').trim();

        return testCode;
    }

    /**
     * Get test file path based on language conventions
     */
    private getTestFilePath(sourceFilePath: string, language: string): string {
        const dir = path.dirname(sourceFilePath);
        const fileName = path.basename(sourceFilePath);
        const fileNameWithoutExt = path.parse(fileName).name;

        if (language === 'java') {
            // Spring Boot convention: src/test/java/...
            const testDir = dir.replace(/src[\\\/]main[\\\/]java/, 'src/test/java');
            return path.join(testDir, `${fileNameWithoutExt}Test.java`);
        } else if (language === 'csharp') {
            // .NET convention: ProjectName.Tests/...Tests.cs
            const testDir = dir.replace(/src/, 'tests').replace(/\.csproj/, '.Tests');
            return path.join(testDir, `${fileNameWithoutExt}Tests.cs`);
        }

        throw new Error(`Unsupported language: ${language}`);
    }

    /**
     * Detect programming language from file extension
     */
    private detectLanguage(extension: string): string {
        switch (extension.toLowerCase()) {
            case '.java':
                return 'java';
            case '.cs':
                return 'csharp';
            case '.ts':
            case '.js':
                return 'typescript';
            default:
                throw new Error(`Unsupported file extension: ${extension}`);
        }
    }

    /**
     * Get default test framework for language
     */
    private getDefaultTestFramework(language: string): string {
        switch (language) {
            case 'java':
                return 'JUnit 5';
            case 'csharp':
                return 'xUnit';
            case 'typescript':
                return 'Jest';
            default:
                return 'unknown';
        }
    }

    /**
     * Get mocking framework for language
     */
    private getMockingFramework(language: string): string {
        switch (language) {
            case 'java':
                return 'Mockito';
            case 'csharp':
                return 'Moq';
            case 'typescript':
                return 'Jest Mocks';
            default:
                return 'unknown';
        }
    }

    /**
     * Estimate coverage based on analysis
     */
    private estimateCoverage(analysis: CoverageAnalysis, target: number): number {
        // Rough estimate: 
        // - Each public method needs 3+ tests for 80% coverage
        // - Complex methods need more tests
        const simpleMethodCoverage = 85;
        const mediumMethodCoverage = 80;
        const complexMethodCoverage = 75;

        let totalCoverage = 0;
        const methodCount = analysis.publicMethods.length;

        if (methodCount === 0) return 0;

        analysis.publicMethods.forEach(method => {
            switch (method.complexity) {
                case 'simple':
                    totalCoverage += simpleMethodCoverage;
                    break;
                case 'medium':
                    totalCoverage += mediumMethodCoverage;
                    break;
                case 'complex':
                    totalCoverage += complexMethodCoverage;
                    break;
            }
        });

        return Math.min(Math.round(totalCoverage / methodCount), 95); // Cap at 95% (realistic)
    }

    /**
     * Convert class name to camelCase for variable naming
     */
    private toCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * Save test file to disk
     */
    async saveTestFile(result: TestGenerationResult): Promise<void> {
        const dir = path.dirname(result.testFilePath);
        
        // Create test directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.info(`Created test directory: ${dir}`);
        }

        // Write test file
        fs.writeFileSync(result.testFilePath, result.testContent, 'utf-8');
        logger.info(`Test file saved: ${result.testFilePath}`);
    }

    /**
     * Generate tests for entire project to achieve target coverage
     */
    async generateTestsForProject(
        projectPath: string,
        targetCoverage: number
    ): Promise<TestGenerationResult[]> {
        logger.info(`Generating tests for project: ${projectPath} (target: ${targetCoverage}%)`);
        
        const sourceFiles = this.findSourceFiles(projectPath);
        const results: TestGenerationResult[] = [];

        for (const sourceFile of sourceFiles) {
            try {
                const result = await this.generateUnitTests(sourceFile, {
                    targetCoverage,
                    includeEdgeCases: true,
                    includeMockSetup: true
                });
                
                await this.saveTestFile(result);
                results.push(result);
                
                logger.info(`Generated ${result.generatedTestCount} tests for ${path.basename(sourceFile)}`);
            } catch (error) {
                logger.error(`Failed to generate tests for ${sourceFile}: ${error}`);
            }
        }

        return results;
    }

    /**
     * Find all source files in project
     */
    private findSourceFiles(projectPath: string): string[] {
        const sourceFiles: string[] = [];
        
        const scanDirectory = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip test directories, node_modules, bin, obj
                    if (!entry.name.match(/test|node_modules|bin|obj|\.git/i)) {
                        scanDirectory(fullPath);
                    }
                } else if (entry.isFile()) {
                    // Include .java and .cs files
                    if (entry.name.match(/\.(java|cs)$/)) {
                        sourceFiles.push(fullPath);
                    }
                }
            }
        };

        scanDirectory(projectPath);
        return sourceFiles;
    }
}
