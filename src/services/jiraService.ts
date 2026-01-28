import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface JiraIssue {
    key: string;
    summary: string;
    description: string;
    issueType: string;
    status: string;
    priority: string;
    assignee?: string;
    reporter?: string;
    acceptanceCriteria?: string;
    customFields?: Record<string, any>;
}

export interface JiraConfig {
    baseUrl: string;
    email: string;
    apiToken: string;
}

export class JiraService {
    private config: JiraConfig | null = null;

    /**
     * Initialize Jira configuration from VSCode settings or prompt user
     */
    async initialize(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('devex.jira');
        const baseUrl = config.get<string>('baseUrl');
        const email = config.get<string>('email');
        const apiToken = config.get<string>('apiToken');

        if (baseUrl && email && apiToken) {
            this.config = { baseUrl, email, apiToken };
            return true;
        }

        // Prompt user for configuration
        const configNow = await vscode.window.showInformationMessage(
            'Jira integration is not configured. Would you like to configure it now?',
            'Configure',
            'Cancel'
        );

        if (configNow !== 'Configure') {
            return false;
        }

        return await this.promptForConfiguration();
    }

    /**
     * Prompt user to configure Jira settings
     */
    private async promptForConfiguration(): Promise<boolean> {
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter your Jira base URL (e.g., https://yourcompany.atlassian.net)',
            placeHolder: 'https://yourcompany.atlassian.net',
            validateInput: (value) => {
                if (!value) {
                    return 'Jira URL is required';
                }
                if (!value.startsWith('http://') && !value.startsWith('https://')) {
                    return 'URL must start with http:// or https://';
                }
                return undefined;
            }
        });

        if (!baseUrl) {
            return false;
        }

        const email = await vscode.window.showInputBox({
            prompt: 'Enter your Jira email address',
            placeHolder: 'your.email@company.com',
            validateInput: (value) => {
                if (!value) {
                    return 'Email is required';
                }
                if (!value.includes('@')) {
                    return 'Please enter a valid email address';
                }
                return undefined;
            }
        });

        if (!email) {
            return false;
        }

        const apiToken = await vscode.window.showInputBox({
            prompt: 'Enter your Jira API token (create one at https://id.atlassian.com/manage/api-tokens)',
            placeHolder: 'Your API token',
            password: true,
            validateInput: (value) => {
                if (!value) {
                    return 'API token is required';
                }
                return undefined;
            }
        });

        if (!apiToken) {
            return false;
        }

        // Save to workspace settings
        const config = vscode.workspace.getConfiguration('devex.jira');
        await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Global);
        await config.update('email', email, vscode.ConfigurationTarget.Global);
        await config.update('apiToken', apiToken, vscode.ConfigurationTarget.Global);

        this.config = { baseUrl, email, apiToken };

        vscode.window.showInformationMessage('Jira configuration saved successfully!');
        return true;
    }

    /**
     * Test Jira connection and configuration
     */
    async testConnection(): Promise<boolean> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info('Testing Jira connection...');
            
            // Try API v2 first
            const urlV2 = `${this.config!.baseUrl}/rest/api/2/myself`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(urlV2, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json() as any;
                logger.info(`✅ Jira connection successful! Logged in as: ${data.displayName || data.name}`);
                vscode.window.showInformationMessage(
                    `✅ Jira Connected!\nUser: ${data.displayName || data.name}\nEmail: ${data.emailAddress || this.config!.email}`
                );
                return true;
            } else {
                const errorText = await response.text();
                logger.error(`Connection test failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                
                vscode.window.showErrorMessage(
                    `❌ Jira Connection Failed!\n` +
                    `Status: ${response.status} ${response.statusText}\n\n` +
                    `Troubleshooting:\n` +
                    `1. Check baseUrl: ${this.config!.baseUrl}\n` +
                    `2. Verify API token is valid\n` +
                    `3. Ensure you have access to Jira`,
                    'View Logs'
                );
                return false;
            }

        } catch (error: any) {
            logger.error(`Connection test error: ${error.message}`);
            vscode.window.showErrorMessage(
                `❌ Connection Error: ${error.message}\n\n` +
                `Check:\n` +
                `1. Internet connection\n` +
                `2. Jira URL is accessible\n` +
                `3. Firewall settings`
            );
            return false;
        }
    }

    /**
     * Fetch issues assigned to current user
     * Note: If search API is not available, prompts user to enter issue keys manually
     */
    async fetchMyIssues(maxResults: number = 50): Promise<JiraIssue[]> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info('Fetching assigned Jira issues');

            // JQL query for issues assigned to current user (including all statuses for now)
            const jql = 'assignee = currentUser() ORDER BY updated DESC';
            // Jira Cloud requires API v3 for search (v2 was deprecated)
            const url = `${this.config!.baseUrl}/rest/api/3/search/jql`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            // Use POST instead of GET for JQL queries (more reliable, no URL length limits)
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jql: jql,
                    maxResults: maxResults,
                    fields: ['summary', 'description', 'issuetype', 'status', 'priority', 'assignee', 'reporter', 'customfield_10200', 'customfield_10201', 'customfield_10100']
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Fetch issues failed: ${response.status} ${response.statusText}\nURL: ${url}\nResponse: ${errorText}`);
                
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check your Jira credentials.');
                } else if (response.status === 410) {
                    // Search API not available - try agile board API as fallback
                    logger.info('Search API unavailable, trying agile board API...');
                    
                    try {
                        return await this.fetchIssuesViaBoard();
                    } catch (boardError) {
                        logger.warn(`Board API also failed: ${boardError}`);
                        
                        // Offer manual entry as final fallback
                        const useManual = await vscode.window.showWarningMessage(
                            'Jira search API is not available on your instance.\n\n' +
                            'Would you like to enter ticket keys manually instead?',
                            'Enter Manually',
                            'Cancel'
                        );
                        
                        if (useManual === 'Enter Manually') {
                            return await this.fetchIssuesManually();
                        }
                        throw new Error('Search API not available (410 Gone). Your Jira instance may have this endpoint disabled.');
                    }
                } else {
                    throw new Error(`Failed to fetch Jira issues: ${response.status} ${response.statusText}\n\nURL: ${url}\n\nResponse: ${errorText.substring(0, 200)}`);
                }
            }

            const data = await response.json() as any;
            logger.info(`Search API returned ${data.issues?.length || 0} issues`);
            const issues: JiraIssue[] = [];

            for (const item of data.issues || []) {
                // Extract acceptance criteria from various possible fields
                let acceptanceCriteria = '';
                const customFields = item.fields;
                
                const acFieldNames = [
                    'customfield_10200',
                    'customfield_10201',
                    'customfield_10100',
                    'acceptanceCriteria'
                ];

                for (const fieldName of acFieldNames) {
                    if (customFields[fieldName]) {
                        acceptanceCriteria = customFields[fieldName];
                        break;
                    }
                }

                issues.push({
                    key: item.key,
                    summary: item.fields.summary || '',
                    description: this.extractTextFromADF(item.fields.description) || '',
                    issueType: item.fields.issuetype?.name || '',
                    status: item.fields.status?.name || '',
                    priority: item.fields.priority?.name || '',
                    assignee: item.fields.assignee?.displayName,
                    reporter: item.fields.reporter?.displayName,
                    acceptanceCriteria,
                    customFields: item.fields
                });
            }

            logger.info(`Successfully fetched ${issues.length} Jira issues`);
            return issues;

        } catch (error: any) {
            logger.error(`Failed to fetch Jira issues: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch issues via Agile Board API (fallback when search API is disabled)
     */
    private async fetchIssuesViaBoard(): Promise<JiraIssue[]> {
        const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');
        
        // First, get user's boards
        const boardsUrl = `${this.config!.baseUrl}/rest/agile/1.0/board`;
        const boardsResponse = await fetch(boardsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });

        if (!boardsResponse.ok) {
            throw new Error(`Board API not available: ${boardsResponse.status}`);
        }

        const boardsData = await boardsResponse.json() as any;
        if (!boardsData.values || boardsData.values.length === 0) {
            throw new Error('No boards found');
        }

        // Get issues from the first board
        const boardId = boardsData.values[0].id;
        logger.info(`Using board: ${boardsData.values[0].name} (ID: ${boardId})`);
        const issuesUrl = `${this.config!.baseUrl}/rest/agile/1.0/board/${boardId}/issue?jql=assignee=currentUser()&maxResults=50`;
        
        const issuesResponse = await fetch(issuesUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });

        if (!issuesResponse.ok) {
            throw new Error(`Failed to fetch board issues: ${issuesResponse.status}`);
        }

        const data = await issuesResponse.json() as any;
        const issues: JiraIssue[] = [];

        for (const item of data.issues || []) {
            let acceptanceCriteria = '';
            const customFields = item.fields;
            
            const acFieldNames = ['customfield_10200', 'customfield_10201', 'customfield_10100', 'acceptanceCriteria'];
            for (const fieldName of acFieldNames) {
                if (customFields[fieldName]) {
                    acceptanceCriteria = customFields[fieldName];
                    break;
                }
            }

            issues.push({
                key: item.key,
                summary: item.fields.summary || '',
                description: this.extractTextFromADF(item.fields.description) || '',
                issueType: item.fields.issuetype?.name || '',
                status: item.fields.status?.name || '',
                priority: item.fields.priority?.name || '',
                assignee: item.fields.assignee?.displayName,
                reporter: item.fields.reporter?.displayName,
                acceptanceCriteria,
                customFields: item.fields
            });
        }

        logger.info(`Successfully fetched ${issues.length} issues via Board API`);
        return issues;
    }

    /**
     * Manually fetch issues by prompting user for issue keys
     */
    private async fetchIssuesManually(): Promise<JiraIssue[]> {
        const issueKeysInput = await vscode.window.showInputBox({
            prompt: 'Enter Jira issue keys separated by commas (e.g., PROJ-123, PROJ-124, PROJ-125)',
            placeHolder: 'PROJ-123, PROJ-124, PROJ-125',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter at least one issue key';
                }
                const keys = value.split(',').map(k => k.trim());
                for (const key of keys) {
                    if (!/^[A-Z]+-\d+$/i.test(key)) {
                        return `Invalid issue key format: ${key}. Expected format: PROJ-123`;
                    }
                }
                return undefined;
            }
        });

        if (!issueKeysInput) {
            return [];
        }

        const issueKeys = issueKeysInput.split(',').map(k => k.trim().toUpperCase());
        const issues: JiraIssue[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Fetching ${issueKeys.length} Jira tickets...`,
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < issueKeys.length; i++) {
                const key = issueKeys[i];
                progress.report({ 
                    increment: (100 / issueKeys.length),
                    message: `Fetching ${key}...` 
                });

                try {
                    const issue = await this.fetchIssue(key);
                    if (issue) {
                        issues.push(issue);
                    }
                } catch (error) {
                    logger.warn(`Failed to fetch ${key}: ${error}`);
                    vscode.window.showWarningMessage(`Could not fetch ${key}`);
                }
            }
        });

        return issues;
    }

    /**
     * Fetch Jira issue details
     */
    async fetchIssue(issueKey: string): Promise<JiraIssue | null> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Fetching Jira issue: ${issueKey}`);

            const url = `${this.config!.baseUrl}/rest/api/2/issue/${issueKey}`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check your Jira credentials.');
                } else if (response.status === 404) {
                    throw new Error(`Issue ${issueKey} not found. Please check the issue key.`);
                } else {
                    throw new Error(`Failed to fetch Jira issue: ${response.status} ${response.statusText}`);
                }
            }

            const data = await response.json() as any;

            // Extract acceptance criteria from various possible fields
            let acceptanceCriteria = '';
            const customFields = data.fields;
            
            // Common field names for acceptance criteria
            const acFieldNames = [
                'customfield_10200', // Common AC field
                'customfield_10201',
                'customfield_10100',
                'acceptanceCriteria'
            ];

            for (const fieldName of acFieldNames) {
                if (customFields[fieldName]) {
                    acceptanceCriteria = customFields[fieldName];
                    break;
                }
            }

            const issue: JiraIssue = {
                key: data.key,
                summary: data.fields.summary || '',
                description: this.extractTextFromADF(data.fields.description) || '',
                issueType: data.fields.issuetype?.name || '',
                status: data.fields.status?.name || '',
                priority: data.fields.priority?.name || '',
                assignee: data.fields.assignee?.displayName,
                reporter: data.fields.reporter?.displayName,
                acceptanceCriteria,
                customFields: data.fields
            };

            logger.info(`Successfully fetched Jira issue: ${issueKey}`);
            return issue;

        } catch (error: any) {
            logger.error(`Failed to fetch Jira issue: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract plain text from Atlassian Document Format (ADF)
     */
    private extractTextFromADF(adf: any): string {
        if (!adf) {
            return '';
        }

        if (typeof adf === 'string') {
            return adf;
        }

        if (adf.type === 'doc' && adf.content) {
            return adf.content.map((node: any) => this.extractTextFromNode(node)).join('\n\n');
        }

        return JSON.stringify(adf);
    }

    /**
     * Extract text from ADF node recursively
     */
    private extractTextFromNode(node: any): string {
        if (!node) {
            return '';
        }

        if (node.type === 'text') {
            return node.text || '';
        }

        if (node.content && Array.isArray(node.content)) {
            return node.content.map((child: any) => this.extractTextFromNode(child)).join('');
        }

        return '';
    }

    /**
     * Add a comment to a Jira issue
     */
    async addComment(issueKey: string, comment: string): Promise<void> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Adding comment to Jira issue: ${issueKey}`);

            const url = `${this.config!.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    body: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: comment
                                    }
                                ]
                            }
                        ]
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Add comment failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to add comment: ${response.status} ${response.statusText}`);
            }

            logger.info(`Successfully added comment to ${issueKey}`);

        } catch (error: any) {
            logger.error(`Failed to add comment to ${issueKey}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Prompt user to enter Jira issue key
     */
    async promptForIssueKey(): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt: 'Enter Jira issue key (e.g., PROJ-123)',
            placeHolder: 'PROJ-123',
            validateInput: (value) => {
                if (!value) {
                    return 'Issue key is required';
                }
                if (!/^[A-Z]+-\d+$/.test(value)) {
                    return 'Please enter a valid Jira issue key (e.g., PROJ-123)';
                }
                return undefined;
            }
        });
    }
}
