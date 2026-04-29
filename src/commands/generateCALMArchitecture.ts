import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { JiraService } from '../services/jiraService';
import { AIService } from '../services/aiService';
import { TelemetryService } from '../services/telemetryService';
import { logger } from '../utils/logger';

interface CALMConfig {
    version: string;
    lastUpdated: string;
    techStack: {
        cloudPlatform: string;
        cloudServices: string[];
        frontendTech: string;
        backendTech: string;
        databaseType: string;
        messagingSystem: string;
        authMethod: string;
        monitoring: string;
        logging: string;
    };
    organizationDefaults: {
        createdBy: string;
        encryptionInTransit: string;
        encryptionAtRest: string;
    };
}

interface CALMNode {
    'unique-id': string;
    'node-type': string;
    name: string;
    description: string;
    interfaces?: any[];
    metadata: {
        'data-classification': string;
    };
}

interface CALMRelationship {
    'unique-id': string;
    description: string;
    'relationship-type': any;
    protocol?: string;
}

interface CALMFlow {
    'unique-id': string;
    name: string;
    description: string;
    transitions: Array<{
        'relationship-unique-id': string;
        'sequence-number': number;
        description: string;
        direction: 'source-to-destination' | 'destination-to-source';
    }>;
}

/**
 * Generate CALM (Common Architecture Language Model) JSON file from Jira story
 */
export async function generateCALMArchitectureCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    issueKey?: string
): Promise<void> {
    const startTime = Date.now();

    try {
        telemetryService.trackEvent('command.generateCALMArchitecture.started');

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open. Please open a workspace.');
            return;
        }

        const jiraService = new JiraService();
        const aiService = new AIService();

        // Initialize Jira service
        const initialized = await jiraService.initialize();
        if (!initialized) {
            vscode.window.showWarningMessage('Jira configuration not completed. Please try again.');
            return;
        }

        // Get issue key if not provided
        if (!issueKey) {
            issueKey = await jiraService.promptForIssueKey();
            if (!issueKey) {
                return;
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating CALM Architecture for ${issueKey}...`,
            cancellable: false
        }, async (progress) => {
            // Step 1: Fetch Jira story
            progress.report({ increment: 5, message: 'Fetching Jira story...' });
            const issue = await jiraService.fetchIssue(issueKey!);
            if (!issue) {
                vscode.window.showErrorMessage(`Failed to fetch ticket: ${issueKey}`);
                return;
            }

            // Step 2: Summarize the feature using AI
            progress.report({ increment: 10, message: 'Analyzing feature requirements...' });
            const featureSummary = await summarizeJiraStory(issue, aiService);

            // Step 3: Load or create CALM config
            progress.report({ increment: 10, message: 'Loading configuration...' });
            const config = await loadOrCreateCALMConfig(workspaceFolder);

            // Step 4: Validate data classification (always ask)
            progress.report({ increment: 10, message: 'Validating data classification...' });
            const dataClassification = await promptForDataClassification();
            if (!dataClassification) {
                return;
            }

            // Step 5: Ask for architecture-specific details
            progress.report({ increment: 15, message: 'Gathering architecture details...' });
            const architectureDetails = await gatherArchitectureDetails(
                config,
                featureSummary,
                issue
            );

            if (!architectureDetails) {
                return;
            }

            // Step 6: Generate CALM JSON using AI
            progress.report({ increment: 30, message: 'Generating CALM architecture...' });
            const calmJson = await generateCALMJson(
                issue,
                featureSummary,
                architectureDetails,
                dataClassification,
                config,
                aiService
            );

            // Step 7: Save the CALM file
            progress.report({ increment: 15, message: 'Saving CALM file...' });
            const fileName = `${issueKey}-architecture.json`;
            const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
            
            // Ensure 4-space indentation (CRITICAL for FINOS CALM Tools)
            const formattedJson = JSON.stringify(calmJson, null, 4);
            fs.writeFileSync(filePath, formattedJson, 'utf-8');

            // Step 8: Open the file
            progress.report({ increment: 5, message: 'Opening file...' });
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            const duration = Date.now() - startTime;
            telemetryService.trackEvent('command.generateCALMArchitecture.completed', {
                duration,
                issueKey: issueKey!,
                nodeCount: calmJson.nodes?.length || 0,
                flowCount: calmJson.flows?.length || 0
            });

            vscode.window.showInformationMessage(
                `✅ CALM architecture generated: ${fileName}\n` +
                `📊 ${calmJson.nodes?.length || 0} nodes, ${calmJson.flows?.length || 0} flows\n` +
                `🔍 Preview with FINOS CALM Tools extension`
            );
        });

    } catch (error: any) {
        logger.error('Failed to generate CALM architecture', error);
        telemetryService.trackEvent('command.generateCALMArchitecture.failed', {
            error: error.message
        });
        vscode.window.showErrorMessage(`Failed to generate CALM architecture: ${error.message}`);
    }
}

/**
 * Summarize Jira story using AI
 */
async function summarizeJiraStory(issue: any, aiService: AIService): Promise<string> {
    const prompt = `Analyze this Jira story and provide a concise summary of the feature/system being described:

**Story:** ${issue.key}
**Title:** ${issue.summary}
**Description:**
${issue.description || 'No description provided'}

Please provide:
1. What is the main feature/capability?
2. What are the key components mentioned?
3. What are the main user interactions?
4. What are the key technical requirements?

Keep the summary concise and focused on architectural elements.`;

    const response = await aiService.callLanguageModel(prompt);

    return response.content;
}

/**
 * Load or create CALM configuration from .devex folder
 */
async function loadOrCreateCALMConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<CALMConfig> {
    const devexPath = path.join(workspaceFolder.uri.fsPath, '.devex');
    const configPath = path.join(devexPath, 'calm-config.json');

    // Create .devex folder if it doesn't exist
    if (!fs.existsSync(devexPath)) {
        fs.mkdirSync(devexPath, { recursive: true });
        
        // Create README
        const readmeContent = `# .devex Folder

This folder contains persistent configuration for the DevEx AI Assistant.

## Files:

- **calm-config.json** - Reusable architecture configuration for CALM generation
- **repo-mappings.json** - Repository to service mappings

## Purpose:

Stores answers to common questions so you don't have to answer them repeatedly.
Tech stack, cloud platform, and other shared settings are saved here.

**Note:** Data classification is always validated per feature for security compliance.
`;
        fs.writeFileSync(path.join(devexPath, 'README.md'), readmeContent, 'utf-8');
    }

    // Load existing config or create new
    if (fs.existsSync(configPath)) {
        try {
            const data = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load CALM config, creating new');
        }
    }

    // Create default config with questions
    const newConfig: CALMConfig = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        techStack: {
            cloudPlatform: '',
            cloudServices: [],
            frontendTech: '',
            backendTech: '',
            databaseType: '',
            messagingSystem: '',
            authMethod: '',
            monitoring: '',
            logging: ''
        },
        organizationDefaults: {
            createdBy: '',
            encryptionInTransit: 'TLS 1.2 or higher',
            encryptionAtRest: 'AES-256'
        }
    };

    return newConfig;
}

/**
 * Prompt for data classification (always ask for security)
 */
async function promptForDataClassification(): Promise<string | undefined> {
    const classification = await vscode.window.showQuickPick(
        ['Public', 'Internal', 'Confidential', 'Private', 'Highly Restricted'],
        {
            placeHolder: 'Select data classification for this feature',
            title: '🔒 Data Classification (Required for Compliance)'
        }
    );

    return classification;
}

/**
 * Gather architecture details, using saved config where possible
 */
async function gatherArchitectureDetails(
    config: CALMConfig,
    featureSummary: string,
    issue: any
): Promise<any | undefined> {
    const details: any = {
        featureId: issue.key,
        featureName: issue.summary,
        featureDescription: featureSummary
    };

    // Show summary and ask if they want to review/update config
    const configStatus = config.techStack.cloudPlatform 
        ? `Existing configuration found:\n` +
          `- Cloud: ${config.techStack.cloudPlatform}\n` +
          `- Frontend: ${config.techStack.frontendTech || 'Not set'}\n` +
          `- Backend: ${config.techStack.backendTech || 'Not set'}\n` +
          `- Database: ${config.techStack.databaseType || 'Not set'}`
        : 'No existing configuration found. You will be asked to provide tech stack details.';

    const action = await vscode.window.showQuickPick(
        ['Use existing configuration', 'Update configuration', 'Answer questions manually'],
        {
            placeHolder: 'How would you like to provide architecture details?',
            title: '⚙️ Architecture Configuration',
            ignoreFocusOut: true
        }
    );

    if (!action) {
        return undefined;
    }

    if (action === 'Answer questions manually') {
        // Ask all questions without saving
        return await askArchitectureQuestions(config, details, false);
    } else if (action === 'Update configuration' || !config.techStack.cloudPlatform) {
        // Ask questions and save to config
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const result = await askArchitectureQuestions(config, details, true);
        if (result) {
            // Save updated config
            config.lastUpdated = new Date().toISOString();
            const devexPath = path.join(workspaceFolder.uri.fsPath, '.devex');
            const configPath = path.join(devexPath, 'calm-config.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            
            vscode.window.showInformationMessage(
                '💾 Configuration saved to .devex/calm-config.json'
            );
        }
        return result;
    } else {
        // Use existing config
        details.techStack = config.techStack;
        details.organizationDefaults = config.organizationDefaults;
        
        // Still need to ask feature-specific questions
        return await askFeatureSpecificQuestions(details);
    }
}

/**
 * Ask architecture questions
 */
async function askArchitectureQuestions(
    config: CALMConfig,
    details: any,
    saveToConfig: boolean
): Promise<any | undefined> {
    // Cloud Platform
    const cloudPlatform = await vscode.window.showQuickPick(
        ['Azure', 'AWS', 'GCP', 'On-Premises', 'Hybrid'],
        {
            placeHolder: 'Select cloud platform',
            title: '☁️ Cloud Platform',
            ignoreFocusOut: true
        }
    );
    if (!cloudPlatform) return undefined;
    
    if (saveToConfig) config.techStack.cloudPlatform = cloudPlatform;
    details.cloudPlatform = cloudPlatform;

    // Frontend Technology
    const frontendTech = await vscode.window.showInputBox({
        prompt: 'Frontend technology (e.g., React MFE, Angular, Vue, None)',
        value: config.techStack.frontendTech || 'React',
        placeHolder: 'React',
        ignoreFocusOut: true
    });
    if (frontendTech === undefined) return undefined;
    
    if (saveToConfig) config.techStack.frontendTech = frontendTech;
    details.frontendTech = frontendTech;

    // Backend Technology
    const backendTech = await vscode.window.showInputBox({
        prompt: 'Backend technology/framework (e.g., .NET 8, Spring Boot, Node.js)',
        value: config.techStack.backendTech || '.NET 8',
        placeHolder: '.NET 8',
        ignoreFocusOut: true
    });
    if (backendTech === undefined) return undefined;
    
    if (saveToConfig) config.techStack.backendTech = backendTech;
    details.backendTech = backendTech;

    // Database Type
    const databaseType = await vscode.window.showQuickPick(
        ['Azure SQL MI', 'SQL Server', 'PostgreSQL', 'MongoDB', 'CosmosDB', 'MySQL', 'Oracle'],
        {
            placeHolder: 'Select database type',
            title: '🗄️ Database Type',
            ignoreFocusOut: true
        }
    );
    if (!databaseType) return undefined;
    
    if (saveToConfig) config.techStack.databaseType = databaseType;
    details.databaseType = databaseType;

    // Authentication
    const authMethod = await vscode.window.showQuickPick(
        ['Azure AD OAuth2', 'OAuth2', 'SAML', 'API Keys', 'JWT', 'Custom'],
        {
            placeHolder: 'Select authentication method',
            title: '🔐 Authentication',
            ignoreFocusOut: true
        }
    );
    if (!authMethod) return undefined;
    
    if (saveToConfig) config.techStack.authMethod = authMethod;
    details.authMethod = authMethod;

    // Messaging System
    const messagingSystem = await vscode.window.showInputBox({
        prompt: 'Messaging/Event system (e.g., Azure Service Bus, Kafka, RabbitMQ, None)',
        value: config.techStack.messagingSystem || 'None',
        placeHolder: 'Azure Service Bus',
        ignoreFocusOut: true
    });
    if (messagingSystem === undefined) return undefined;
    
    if (saveToConfig) config.techStack.messagingSystem = messagingSystem;
    details.messagingSystem = messagingSystem;

    // Monitoring
    const monitoring = await vscode.window.showInputBox({
        prompt: 'Monitoring/APM tool (e.g., Application Insights, New Relic, Datadog)',
        value: config.techStack.monitoring || 'Application Insights',
        placeHolder: 'Application Insights',
        ignoreFocusOut: true
    });
    if (monitoring === undefined) return undefined;
    
    if (saveToConfig) config.techStack.monitoring = monitoring;
    details.monitoring = monitoring;

    // Created By
    const createdBy = await vscode.window.showInputBox({
        prompt: 'Team/Organization name',
        value: config.organizationDefaults.createdBy || 'Development Team',
        placeHolder: 'Development Team',
        ignoreFocusOut: true
    });
    if (createdBy === undefined) return undefined;
    
    if (saveToConfig) config.organizationDefaults.createdBy = createdBy;
    details.createdBy = createdBy;

    details.techStack = config.techStack;
    details.organizationDefaults = config.organizationDefaults;

    // Now ask feature-specific questions
    return await askFeatureSpecificQuestions(details);
}

/**
 * Ask feature-specific questions
 */
async function askFeatureSpecificQuestions(details: any): Promise<any | undefined> {
    // Services for this feature
    const services = await vscode.window.showInputBox({
        prompt: 'List the services/microservices for this feature (comma-separated)',
        placeHolder: 'e.g., User Service, Order Service, Payment Service',
        ignoreFocusOut: true
    });
    if (services === undefined) return undefined;
    details.services = services.split(',').map(s => s.trim()).filter(s => s);

    // Databases for this feature
    const databases = await vscode.window.showInputBox({
        prompt: 'List the databases for this feature (comma-separated)',
        placeHolder: 'e.g., UserDB, OrderDB',
        ignoreFocusOut: true
    });
    if (databases === undefined) return undefined;
    details.databases = databases.split(',').map(d => d.trim()).filter(d => d);

    // External systems
    const externalSystems = await vscode.window.showInputBox({
        prompt: 'List external systems/integrations (comma-separated, or "None")',
        placeHolder: 'e.g., Payment Gateway, Email Service, None',
        value: 'None',
        ignoreFocusOut: true
    });
    if (externalSystems === undefined) return undefined;
    details.externalSystems = externalSystems === 'None' 
        ? [] 
        : externalSystems.split(',').map(e => e.trim()).filter(e => e);

    // Key workflows
    const workflows = await vscode.window.showInputBox({
        prompt: 'List key workflows/business processes (comma-separated)',
        placeHolder: 'e.g., Create User, Process Order, Send Notification',
        ignoreFocusOut: true
    });
    if (workflows === undefined) return undefined;
    details.workflows = workflows.split(',').map(w => w.trim()).filter(w => w);

    return details;
}

/**
 * Generate CALM JSON using AI
 */
async function generateCALMJson(
    issue: any,
    featureSummary: string,
    architectureDetails: any,
    dataClassification: string,
    config: CALMConfig,
    aiService: AIService
): Promise<any> {
    const prompt = `Generate a valid FINOS CALM (Common Architecture Language Model) JSON file for this feature.

**CRITICAL FINOS COMPLIANCE REQUIREMENTS:**

1. **SCHEMA URL**: Must be exactly: "https://calm.finos.org/release/1.2/meta/calm.json"
   - Do NOT use GitHub raw URLs
   - Do NOT use any other schema location

2. **unique-id FORMAT**: Use simple strings like "feature-name-system" or "${issue.key.toLowerCase()}-system"
   - Do NOT use URI format like "calm://..." or "urn:..."
   - Use kebab-case (lowercase with hyphens)

3. **metadata STRUCTURE**: Root-level "metadata" MUST be an ARRAY, not an object
   Example: "metadata": [{"name": "value"}]
   - Do NOT use: "metadata": {"name": "value"}
   - This is the #1 reason files get rejected

4. **CONTROL NAMES**: Use plain control names without prefixes
   - Correct: "encryption-in-transit", "encryption-at-rest", "authentication"
   - WRONG: "ctrl-encryption-in-transit" or "control-encryption"

5. **CONTROL PROPERTIES**: Use standard FINOS properties
   - Use: "requirements": [] (array of strings)
   - Do NOT use: "control-requirement-url" or custom properties

6. **NODE NAMES - MERMAID COMPATIBILITY**: NO PARENTHESES in node names
   - Correct: "User Service", "Order Management Service"
   - WRONG: "User Service (Backend)", "Order (Legacy)"
   - FINOS CALM Tools generates Mermaid diagrams which reject parentheses

7. **NODE-TYPE**: Use "database" (NOT "datastore")

8. **INDENTATION**: Exactly 4 spaces (NOT 2 spaces, NOT tabs)

**CORRECT STRUCTURE TEMPLATE:**
\`\`\`json
{
    "$schema": "https://calm.finos.org/release/1.2/meta/calm.json",
    "unique-id": "simple-string-id",
    "name": "System Name",
    "description": "Description",
    "controls": {
        "encryption-in-transit": {
            "description": "TLS 1.2 or higher",
            "requirements": []
        },
        "encryption-at-rest": {
            "description": "AES-256 encryption",
            "requirements": []
        }
    },
    "metadata": [
        {
            "name": "Feature",
            "value": "Feature Name",
            "version": "1.0.0"
        }
    ],
    "nodes": [...],
    "relationships": [...],
    "flows": [...]
}
\`\`\`

**Feature Information:**
- Jira Story: ${issue.key}
- Title: ${issue.summary}
- Summary: ${featureSummary}

**Architecture Details:**
${JSON.stringify(architectureDetails, null, 2)}

**Data Classification:** ${dataClassification}

**Tech Stack:**
- Cloud Platform: ${architectureDetails.cloudPlatform || config.techStack.cloudPlatform}
- Frontend: ${architectureDetails.frontendTech || config.techStack.frontendTech}
- Backend: ${architectureDetails.backendTech || config.techStack.backendTech}
- Database: ${architectureDetails.databaseType || config.techStack.databaseType}
- Authentication: ${architectureDetails.authMethod || config.techStack.authMethod}
- Messaging: ${architectureDetails.messagingSystem || config.techStack.messagingSystem}

**Required Nodes:**
1. System node (top-level container) - name without parentheses
2. Actor node (user) - name without parentheses
3. ${architectureDetails.frontendTech !== 'None' ? 'Webclient node (frontend) - name without parentheses' : ''}
4. Service nodes for: ${architectureDetails.services?.join(', ')} - names without parentheses
5. Database nodes for: ${architectureDetails.databases?.join(', ')} - names without parentheses
${architectureDetails.externalSystems?.length > 0 ? `6. External system nodes for: ${architectureDetails.externalSystems.join(', ')} - names without parentheses` : ''}

**Required Relationships:**
1. One "composed-of" relationship (system contains all components)
2. One or more "interacts" relationships (actor to UI/services)
3. Multiple "connects" relationships for all service-to-service and service-to-database connections

**Required Flows (create at least 7):**
Based on workflows: ${architectureDetails.workflows?.join(', ')}
Each flow should have bidirectional transitions (request and response).

**Controls (use correct format):**
- encryption-in-transit: ${config.organizationDefaults.encryptionInTransit}
- encryption-at-rest: ${config.organizationDefaults.encryptionAtRest}
- authentication: ${architectureDetails.authMethod || config.techStack.authMethod}

Generate the complete CALM JSON file following ALL requirements above (return ONLY valid JSON, no markdown):`;

    const response = await aiService.callLanguageModel(prompt);

    // Extract JSON from response
    let jsonText = response.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.substring(7);
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.substring(3);
    }
    if (jsonText.endsWith('```')) {
        jsonText = jsonText.substring(0, jsonText.length - 3);
    }
    
    jsonText = jsonText.trim();

    try {
        const calmJson = JSON.parse(jsonText);
        
        // FIX #1: Enforce correct FINOS schema URL
        calmJson.$schema = 'https://calm.finos.org/release/1.2/meta/calm.json';
        
        // FIX #2: Ensure unique-id is a simple string (not URI format)
        if (calmJson['unique-id'] && (calmJson['unique-id'].startsWith('calm://') || calmJson['unique-id'].startsWith('urn:'))) {
            // Extract simple ID from URI
            const parts = calmJson['unique-id'].split('/');
            calmJson['unique-id'] = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
        }
        
        // FIX #3: CRITICAL - Ensure metadata is an ARRAY not an object
        if (calmJson.metadata && !Array.isArray(calmJson.metadata)) {
            // Convert object to array format
            const metadataObj = calmJson.metadata;
            calmJson.metadata = [
                {
                    name: issue.key,
                    description: issue.summary,
                    version: '1.0.0',
                    ...(typeof metadataObj === 'object' ? metadataObj : {})
                }
            ];
        } else if (!calmJson.metadata) {
            // Create metadata array if missing
            calmJson.metadata = [
                {
                    name: issue.key,
                    description: issue.summary,
                    version: '1.0.0',
                    created: new Date().toISOString().split('T')[0]
                }
            ];
        }
        
        // FIX #4: Remove ctrl- or control- prefixes from control names
        if (calmJson.controls) {
            const cleanedControls: any = {};
            for (const [key, value] of Object.entries(calmJson.controls)) {
                const cleanKey = key.replace(/^(ctrl-|control-)/, '');
                cleanedControls[cleanKey] = value;
            }
            calmJson.controls = cleanedControls;
        }
        
        // FIX #5: Remove parentheses from ALL node names (Mermaid compatibility)
        if (calmJson.nodes) {
            calmJson.nodes = calmJson.nodes.map((node: any) => {
                // Remove parentheses and content within them
                if (node.name) {
                    node.name = node.name.replace(/\s*\([^)]*\)/g, '').trim();
                }
                
                // Ensure node has metadata with data-classification
                if (!node.metadata) {
                    node.metadata = { 'data-classification': dataClassification };
                } else if (!node.metadata['data-classification']) {
                    node.metadata['data-classification'] = dataClassification;
                }
                
                return node;
            });
        }
        
        // Log fixes applied
        logger.info('CALM JSON validation and fixes applied:');
        logger.info(`  - Schema URL enforced`);
        logger.info(`  - Metadata structure: ${Array.isArray(calmJson.metadata) ? 'array ✓' : 'object (fixed)'}`);
        logger.info(`  - Node count: ${calmJson.nodes?.length || 0}`);
        logger.info(`  - Parentheses removed from node names`);
        
        return calmJson;
    } catch (error) {
        logger.error('Failed to parse AI-generated JSON', error);
        throw new Error('AI generated invalid JSON. Please try again.');
    }
}
