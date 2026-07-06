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

export interface JiraComment {
    id: string;
    body: string;
    author: string;
    created: string;
    updated: string;
}

export interface JiraAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    content: string; // URL to download
    created: string;
    author: string;
}

export interface JiraConfig {
    baseUrl: string;
    email: string;
    apiToken: string;
}

/**
 * Convert a plain-text/markdown string to Atlassian Document Format (ADF).
 * ADF text nodes cannot contain newline characters — each line becomes its own paragraph.
 * Caps total content at 30,000 characters to stay within Jira's field limits.
 */
function textToADF(text: string): object {
    const MAX_CHARS = 30000;
    let content = text;
    if (content.length > MAX_CHARS) {
        content = content.substring(0, MAX_CHARS) +
            '\n[Content truncated — see DevEx output panel for full ERD details]';
    }

    const paragraphs = content
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }]
        }));

    return {
        type: 'doc',
        version: 1,
        content: paragraphs.length > 0
            ? paragraphs
            : [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }]
    };
}

export class JiraService {
    private config: JiraConfig | null = null;

    constructor(baseUrl?: string, email?: string, apiToken?: string) {
        if (baseUrl && email && apiToken) {
            this.config = { baseUrl, email, apiToken };
        }
    }

    /**
     * Initialize Jira configuration from VSCode settings or prompt user
     */
    async initialize(): Promise<boolean> {
        // If already configured via constructor, return true
        if (this.config) {
            return true;
        }

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
     * Fetch all comments from a Jira issue
     */
    async fetchComments(issueKey: string): Promise<JiraComment[]> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Fetching comments for Jira issue: ${issueKey}`);

            const url = `${this.config!.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                logger.error(`Fetch comments failed: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json() as any;
            const comments: JiraComment[] = [];

            if (data.comments && Array.isArray(data.comments)) {
                for (const comment of data.comments) {
                    comments.push({
                        id: comment.id,
                        body: this.extractTextFromADF(comment.body),
                        author: comment.author?.displayName || 'Unknown',
                        created: comment.created,
                        updated: comment.updated
                    });
                }
            }

            logger.info(`Successfully fetched ${comments.length} comments from ${issueKey}`);
            return comments;

        } catch (error: any) {
            logger.error(`Failed to fetch comments from ${issueKey}: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch attachments metadata from a Jira issue
     */
    async fetchAttachments(issueKey: string): Promise<JiraAttachment[]> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Fetching attachments for Jira issue: ${issueKey}`);

            const url = `${this.config!.baseUrl}/rest/api/2/issue/${issueKey}`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                logger.error(`Fetch attachments failed: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json() as any;
            const attachments: JiraAttachment[] = [];

            if (data.fields.attachment && Array.isArray(data.fields.attachment)) {
                for (const attachment of data.fields.attachment) {
                    attachments.push({
                        id: attachment.id,
                        filename: attachment.filename,
                        mimeType: attachment.mimeType,
                        size: attachment.size,
                        content: attachment.content,
                        created: attachment.created,
                        author: attachment.author?.displayName || 'Unknown'
                    });
                }
            }

            logger.info(`Successfully fetched ${attachments.length} attachments from ${issueKey}`);
            return attachments;

        } catch (error: any) {
            logger.error(`Failed to fetch attachments from ${issueKey}: ${error.message}`);
            return [];
        }
    }

    /**
     * Download an image attachment from Jira
     */
    async downloadAttachment(attachment: JiraAttachment): Promise<Buffer | null> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Downloading attachment: ${attachment.filename}`);

            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(attachment.content, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            });

            if (!response.ok) {
                logger.error(`Download attachment failed: ${response.status} ${response.statusText}`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            logger.info(`Successfully downloaded ${attachment.filename} (${buffer.length} bytes)`);
            return buffer;

        } catch (error: any) {
            logger.error(`Failed to download attachment ${attachment.filename}: ${error.message}`);
            return null;
        }
    }

    /**
     * Add a remote link (PR, commit, etc.) to a Jira issue
     * This appears in Jira's Development section
     */
    async addRemoteLink(issueKey: string, url: string, title: string, relationship: 'Pull Request' | 'Commit' | 'Branch' = 'Pull Request'): Promise<void> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Adding remote link to Jira issue ${issueKey}: ${url}`);

            const apiUrl = `${this.config!.baseUrl}/rest/api/3/issue/${issueKey}/remotelink`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    object: {
                        url: url,
                        title: title,
                        icon: {
                            url16x16: relationship === 'Pull Request' 
                                ? 'https://github.githubassets.com/favicons/favicon.png'
                                : 'https://github.githubassets.com/favicons/favicon-dark.png'
                        },
                        status: {
                            resolved: false
                        }
                    },
                    relationship: relationship
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Add remote link failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to add remote link: ${response.status} ${response.statusText}`);
            }

            logger.info(`Successfully added remote link to ${issueKey}`);

        } catch (error: any) {
            logger.error(`Failed to add remote link to ${issueKey}: ${error.message}`);
            // Don't throw - this is a nice-to-have feature
            logger.warn('Continuing without remote link');
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

    /**
     * Create a new Jira issue
     */
    async createIssue(issueData: any): Promise<any> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Creating Jira issue in project: ${issueData.fields.project.key}`);

            const url = `${this.config!.baseUrl}/rest/api/3/issue`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            // Convert description to ADF format if it's a string.
            // ADF text nodes cannot contain \n — each line must be a separate paragraph node.
            if (issueData.fields.description && typeof issueData.fields.description === 'string') {
                issueData.fields.description = textToADF(issueData.fields.description);
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(issueData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Create issue failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to create issue: ${response.status} ${response.statusText}`);
            }

            const createdIssue: any = await response.json();
            logger.info(`Successfully created issue: ${createdIssue.key}`);

            return createdIssue;

        } catch (error: any) {
            logger.error(`Failed to create Jira issue: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a subtask for a Jira issue
     */
    async createSubtask(parentKey: string, summary: string, description: string): Promise<any> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Creating subtask for ${parentKey}: ${summary}`);

            // First, get the parent issue to extract project key and details
            const parentIssue = await this.fetchIssue(parentKey);
            
            if (!parentIssue) {
                throw new Error(`Parent issue ${parentKey} not found`);
            }
            
            // Extract project key from parent issue key (e.g., "DEV-123" -> "DEV")
            const projectKey = parentKey.split('-')[0];
            
            // Get the subtask issue type ID for this project
            const subtaskTypeId = await this.getSubtaskIssueTypeId(projectKey);
            
            const url = `${this.config!.baseUrl}/rest/api/3/issue`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const subtaskData = {
                fields: {
                    project: {
                        key: projectKey
                    },
                    parent: {
                        key: parentKey
                    },
                    summary: summary,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: description
                                    }
                                ]
                            }
                        ]
                    },
                    issuetype: subtaskTypeId ? {
                        id: subtaskTypeId
                    } : {
                        name: 'Subtask'
                    }
                }
            };

            logger.info(`Subtask payload: ${JSON.stringify(subtaskData, null, 2)}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subtaskData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Create subtask failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to create subtask: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
            }

            const createdSubtask: any = await response.json();
            logger.info(`Successfully created subtask: ${createdSubtask.key}`);

            return createdSubtask;

        } catch (error: any) {
            logger.error(`Failed to create subtask: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add an attachment to a Jira issue
     */
    async addAttachment(issueKey: string, filePath: string): Promise<void> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Adding attachment to ${issueKey}: ${filePath}`);

            const fs = require('fs');
            const path = require('path');
            const FormData = require('form-data');

            const url = `${this.config!.baseUrl}/rest/api/3/issue/${issueKey}/attachments`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const form = new FormData();
            form.append('file', fs.createReadStream(filePath), path.basename(filePath));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'X-Atlassian-Token': 'no-check',
                    ...form.getHeaders()
                },
                body: form
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Add attachment failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to add attachment: ${response.status} ${response.statusText}`);
            }

            logger.info(`Successfully added attachment to ${issueKey}`);

        } catch (error: any) {
            logger.error(`Failed to add attachment: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch all subtasks for a parent issue
     */
    async fetchSubtasks(parentKey: string): Promise<JiraIssue[]> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Fetching subtasks for ${parentKey}`);

            // Fetch the parent issue with subtasks field
            const url = `${this.config!.baseUrl}/rest/api/3/issue/${parentKey}?fields=subtasks`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Fetch subtasks failed: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
                throw new Error(`Failed to fetch subtasks: ${response.status} ${response.statusText}`);
            }

            const parentIssue: any = await response.json();
            
            if (!parentIssue.fields.subtasks || parentIssue.fields.subtasks.length === 0) {
                logger.info(`No subtasks found for ${parentKey}`);
                return [];
            }

            // Fetch full details for each subtask
            const subtaskPromises = parentIssue.fields.subtasks.map(async (subtaskRef: any) => {
                try {
                    const subtaskUrl = `${this.config!.baseUrl}/rest/api/3/issue/${subtaskRef.key}`;
                    const subtaskResponse = await fetch(subtaskUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Accept': 'application/json'
                        }
                    });

                    if (!subtaskResponse.ok) {
                        logger.warn(`Failed to fetch subtask ${subtaskRef.key}: ${subtaskResponse.status}`);
                        // Return basic info from parent's subtask reference
                        return {
                            key: subtaskRef.key,
                            summary: subtaskRef.fields.summary,
                            description: '',
                            issueType: subtaskRef.fields.issuetype.name,
                            status: subtaskRef.fields.status.name,
                            priority: subtaskRef.fields.priority?.name || 'Medium',
                            assignee: subtaskRef.fields.assignee?.displayName,
                            reporter: undefined
                        };
                    }

                    const subtaskData: any = await subtaskResponse.json();
                    return {
                        key: subtaskData.key,
                        summary: subtaskData.fields.summary,
                        description: this.extractTextFromADF(subtaskData.fields.description),
                        issueType: subtaskData.fields.issuetype.name,
                        status: subtaskData.fields.status.name,
                        priority: subtaskData.fields.priority?.name || 'Medium',
                        assignee: subtaskData.fields.assignee?.displayName,
                        reporter: subtaskData.fields.reporter?.displayName
                    };
                } catch (err) {
                    logger.warn(`Error fetching subtask ${subtaskRef.key}: ${err}`);
                    // Return basic info from parent's subtask reference
                    return {
                        key: subtaskRef.key,
                        summary: subtaskRef.fields.summary,
                        description: '',
                        issueType: subtaskRef.fields.issuetype.name,
                        status: subtaskRef.fields.status.name,
                        priority: subtaskRef.fields.priority?.name || 'Medium',
                        assignee: subtaskRef.fields.assignee?.displayName,
                        reporter: undefined
                    };
                }
            });

            const subtasks = await Promise.all(subtaskPromises);
            logger.info(`Found ${subtasks.length} subtasks for ${parentKey}`);

            return subtasks;

        } catch (error: any) {
            logger.error(`Failed to fetch subtasks: ${error.message}`);
            throw error;
        }
    }

    /**
     * Transition an issue to a new status
     */
    async transitionIssue(issueKey: string, toStatus: string): Promise<void> {
        if (!this.config) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Jira configuration is required');
            }
        }

        try {
            logger.info(`Transitioning ${issueKey} to ${toStatus}`);

            // First, get available transitions with field information
            const transitionsUrl = `${this.config!.baseUrl}/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`;
            const auth = Buffer.from(`${this.config!.email}:${this.config!.apiToken}`).toString('base64');

            const transitionsResponse = await fetch(transitionsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (!transitionsResponse.ok) {
                throw new Error(`Failed to get transitions: ${transitionsResponse.status}`);
            }

            const transitionsData: any = await transitionsResponse.json();
            const transition = transitionsData.transitions.find((t: any) => 
                t.name.toLowerCase() === toStatus.toLowerCase() ||
                t.to.name.toLowerCase() === toStatus.toLowerCase()
            );

            if (!transition) {
                const availableTransitions = transitionsData.transitions.map((t: any) => t.name).join(', ');
                logger.warn(`Transition to "${toStatus}" not available for ${issueKey}. Available: ${availableTransitions}`);
                throw new Error(`Cannot transition to "${toStatus}". Available transitions: ${availableTransitions}`);
            }

            logger.info(`Found transition: ${transition.name} (ID: ${transition.id})`);

            // Build transition payload with required fields
            const transitionPayload: any = {
                transition: {
                    id: transition.id
                }
            };

            // Check if transition has required fields
            if (transition.fields) {
                const requiredFields = Object.keys(transition.fields).filter(
                    fieldKey => transition.fields[fieldKey].required
                );

                if (requiredFields.length > 0) {
                    logger.info(`Transition requires fields: ${requiredFields.join(', ')}`);
                    transitionPayload.fields = {};

                    // Try to get current issue to fetch existing field values
                    let currentIssue: any = null;
                    try {
                        currentIssue = await this.fetchIssue(issueKey);
                    } catch (err) {
                        logger.warn(`Could not fetch current issue for field values: ${err}`);
                    }

                    // Handle common required fields
                    for (const fieldKey of requiredFields) {
                        const field = transition.fields[fieldKey];
                        const fieldName = (field.name || '').toLowerCase();
                        const fieldKeyLower = fieldKey.toLowerCase();
                        
                        logger.info(`Processing required field: ${fieldKey} (${field.name})`);
                        logger.info(`  Schema: ${JSON.stringify(field.schema)}`);
                        logger.info(`  AllowedValues: ${field.allowedValues ? field.allowedValues.length : 'none'}`);
                        
                        // Resolution field (common for Done transitions)
                        if (fieldKey === 'resolution' || fieldName === 'resolution') {
                            transitionPayload.fields[fieldKey] = { name: 'Done' };
                            logger.info('  ✓ Added resolution: Done');
                        }
                        // Comment field
                        else if (fieldKey === 'comment' || fieldName === 'comment') {
                            transitionPayload.fields[fieldKey] = [
                                {
                                    add: {
                                        body: {
                                            type: 'doc',
                                            version: 1,
                                            content: [
                                                {
                                                    type: 'paragraph',
                                                    content: [
                                                        {
                                                            type: 'text',
                                                            text: 'Transitioned via DevEx AI Assistant'
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            ];
                            logger.info('  ✓ Added comment field');
                        }
                        // For other required fields, use existing value or log warning
                        else if (currentIssue?.fields?.[fieldKey]) {
                            // Use existing value from current issue
                            transitionPayload.fields[fieldKey] = currentIssue.fields[fieldKey];
                            logger.info(`  ✓ Added ${field.name}: ${JSON.stringify(currentIssue.fields[fieldKey])}`);
                        }
                        // Generic string fields
                        else if (field.schema?.type === 'string') {
                            transitionPayload.fields[fieldKey] = 'TBD';
                            logger.info(`  ✓ Added text field ${field.name}: TBD`);
                            logger.info(`Added text field ${field.name}: TBD`);
                        }
                        // Custom number fields
                        else if (field.schema?.type === 'number') {
                            transitionPayload.fields[fieldKey] = 0;
                            logger.info(`Added number field ${field.name}: 0`);
                        }
                        // Select/Option fields
                        else if (field.schema?.type === 'option' && field.allowedValues && field.allowedValues.length > 0) {
                            transitionPayload.fields[fieldKey] = { value: field.allowedValues[0].value || field.allowedValues[0].name };
                            logger.info(`Added option field ${field.name}: ${field.allowedValues[0].value || field.allowedValues[0].name}`);
                        }
                        // User fields
                        else if (field.schema?.type === 'user') {
                            // Use current user
                            transitionPayload.fields[fieldKey] = { accountId: this.config!.email };
                            logger.info(`Added user field ${field.name}: current user`);
                        }
                        else {
                            logger.warn(`Required field "${fieldKey}" (${field.name}) not handled automatically. Schema: ${JSON.stringify(field.schema)}`);
                        }
                    }
                }
            }

            logger.info(`Transition payload: ${JSON.stringify(transitionPayload, null, 2)}`);

            // Execute the transition
            const response = await fetch(transitionsUrl.split('?')[0], {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(transitionPayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Transition failed: ${response.status} ${response.statusText}\nPayload: ${JSON.stringify(transitionPayload, null, 2)}\nResponse: ${errorText}`);
                
                // Try to parse error details
                let errorDetails = errorText;
                let missingFieldsInfo: { name: string, fieldKey: string }[] = [];
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
                        errorDetails = errorJson.errorMessages.join('; ');
                    } else if (errorJson.errors) {
                        // Extract field names from errors
                        for (const [fieldKey, errorMsg] of Object.entries(errorJson.errors)) {
                            const fieldMeta = transition.fields[fieldKey];
                            const fieldName = fieldMeta?.name || fieldKey;
                            missingFieldsInfo.push({ name: fieldName, fieldKey });
                        }
                        
                        errorDetails = Object.entries(errorJson.errors)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join('; ');
                    }
                } catch (parseError) {
                    // Keep original error text
                }
                
                // If we detected missing required fields, show conversational dialog
                if (missingFieldsInfo.length > 0) {
                    const vscode = await import('vscode');
                    const fieldsList = missingFieldsInfo.map(f => `  • ${f.name}`).join('\n');
                    
                    const action = await vscode.window.showErrorMessage(
                        `⚠️ Cannot transition ${issueKey} to ${toStatus}\n\nThe following fields are required:\n${fieldsList}\n\nWould you like to open Jira to fill these in?`,
                        { modal: true },
                        'Open in Jira',
                        'Cancel'
                    );
                    
                    if (action === 'Open in Jira') {
                        const issueUrl = `${this.config!.baseUrl}/browse/${issueKey}`;
                        await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
                        
                        // Ask if they want to retry after updating
                        const retry = await vscode.window.showInformationMessage(
                            `✅ Jira opened in browser.\n\nAfter filling in the required fields, click "Retry" to attempt the transition again.`,
                            'Retry Transition',
                            'Skip for Now'
                        );
                        
                        if (retry === 'Retry Transition') {
                            logger.info(`Retrying transition for ${issueKey} after user update...`);
                            return this.transitionIssue(issueKey, toStatus);
                        }
                    }
                }
                
                throw new Error(`Failed to transition issue: ${response.status} ${response.statusText}. ${errorDetails}`);
            }

            logger.info(`Successfully transitioned ${issueKey} to ${toStatus}`);

        } catch (error: any) {
            logger.error(`Failed to transition issue: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get the subtask issue type ID for a project
     */
    private async getSubtaskIssueTypeId(projectKey: string): Promise<string | null> {
        if (!this.config) {
            return null;
        }

        try {
            const url = `${this.config.baseUrl}/rest/api/3/project/${projectKey}`;
            const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                logger.warn(`Failed to get project details: ${response.status}`);
                return null;
            }

            const projectData: any = await response.json();
            
            // Find the subtask issue type
            const subtaskType = projectData.issueTypes?.find((type: any) => 
                type.subtask === true || 
                type.name.toLowerCase() === 'subtask' ||
                type.name.toLowerCase() === 'sub-task'
            );

            if (subtaskType) {
                logger.info(`Found subtask type ID: ${subtaskType.id} (${subtaskType.name})`);
                return subtaskType.id;
            }

            logger.warn(`No subtask issue type found for project ${projectKey}`);
            return null;

        } catch (error: any) {
            logger.warn(`Error getting subtask type ID: ${error.message}`);
            return null;
        }
    }
}
