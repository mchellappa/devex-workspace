import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

/**
 * Manages persistent state in ~/.devex folder across all workspaces
 * This includes completion state, activity logs, and productivity metrics
 */
export class DevExStateManager {
    private devexPath: string;
    private activityLogPath: string;
    private completionStatePath: string;
    private metricsPath: string;

    constructor() {
        const homeDir = os.homedir();
        this.devexPath = path.join(homeDir, '.devex');
        this.activityLogPath = path.join(this.devexPath, 'activity.log');
        this.completionStatePath = path.join(this.devexPath, 'completion-state.json');
        this.metricsPath = path.join(this.devexPath, 'metrics.json');
        
        this.ensureDirectoryExists();
    }

    /**
     * Ensures .devex directory and README exist
     */
    private ensureDirectoryExists(): void {
        try {
            if (!fs.existsSync(this.devexPath)) {
                fs.mkdirSync(this.devexPath, { recursive: true });
                logger.info(`Created .devex directory at: ${this.devexPath}`);
                
                // Create README
                const readmeContent = `# DevEx AI Assistant State Directory

This directory contains persistent state and logs for the DevEx AI Assistant extension.

## Files:

- **activity.log** - All command executions and user interactions
- **completion-state.json** - Pending Jira story completions (for repo requests)
- **metrics.json** - Productivity metrics and time savings
- **command-history.json** - History of all commands executed

## Purpose:

This state is preserved across all VS Code workspaces, allowing seamless
continuation of workflows even when switching projects.

**Do not delete** - This data helps track productivity and resume workflows.

Last updated: ${new Date().toISOString()}
`;
                fs.writeFileSync(path.join(this.devexPath, 'README.md'), readmeContent, 'utf-8');
            }
        } catch (error) {
            logger.error('Failed to create .devex directory', error);
        }
    }

    /**
     * Logs a command execution
     */
    logCommand(commandName: string, details?: Record<string, any>): void {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${commandName}${details ? ' - ' + JSON.stringify(details) : ''}\n`;
            
            fs.appendFileSync(this.activityLogPath, logEntry, 'utf-8');
        } catch (error) {
            logger.error('Failed to log command', error);
        }
    }

    /**
     * Logs a detailed activity with context
     */
    logActivity(activity: {
        command: string;
        workspace?: string;
        duration?: number;
        status: 'started' | 'completed' | 'failed' | 'cancelled';
        details?: any;
    }): void {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                ...activity
            };
            
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.activityLogPath, logLine, 'utf-8');
        } catch (error) {
            logger.error('Failed to log activity', error);
        }
    }

    /**
     * Saves pending completion state
     */
    async savePendingCompletion(state: PendingCompletion): Promise<void> {
        try {
            const existingStates = await this.loadPendingCompletions();
            
            // Update or add state
            const index = existingStates.findIndex(s => s.issueKey === state.issueKey);
            if (index >= 0) {
                existingStates[index] = state;
            } else {
                existingStates.push(state);
            }
            
            await fs.promises.writeFile(
                this.completionStatePath,
                JSON.stringify(existingStates, null, 2),
                'utf-8'
            );
            
            logger.info(`Saved pending completion for ${state.issueKey}`);
        } catch (error) {
            logger.error('Failed to save pending completion', error);
            throw error;
        }
    }

    /**
     * Loads all pending completions
     */
    async loadPendingCompletions(): Promise<PendingCompletion[]> {
        try {
            if (!fs.existsSync(this.completionStatePath)) {
                return [];
            }
            
            const content = await fs.promises.readFile(this.completionStatePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to load pending completions', error);
            return [];
        }
    }

    /**
     * Finds pending completion by workspace path
     */
    async findPendingCompletion(workspacePath: string): Promise<PendingCompletion | undefined> {
        const completions = await this.loadPendingCompletions();
        return completions.find(c => c.workspacePath === workspacePath);
    }

    /**
     * Removes completed state
     */
    async clearPendingCompletion(issueKey: string): Promise<void> {
        try {
            const existingStates = await this.loadPendingCompletions();
            const filtered = existingStates.filter(s => s.issueKey !== issueKey);
            
            await fs.promises.writeFile(
                this.completionStatePath,
                JSON.stringify(filtered, null, 2),
                'utf-8'
            );
            
            logger.info(`Cleared pending completion for ${issueKey}`);
        } catch (error) {
            logger.error('Failed to clear pending completion', error);
        }
    }

    /**
     * Gets command history
     */
    async getCommandHistory(limit: number = 100): Promise<string[]> {
        try {
            if (!fs.existsSync(this.activityLogPath)) {
                return [];
            }
            
            const content = await fs.promises.readFile(this.activityLogPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            return lines.slice(-limit);
        } catch (error) {
            logger.error('Failed to get command history', error);
            return [];
        }
    }

    /**
     * Gets activity statistics
     */
    async getActivityStats(): Promise<ActivityStats> {
        try {
            const history = await this.getCommandHistory(10000);
            
            const commandCounts: Record<string, number> = {};
            const commandsByDate: Record<string, number> = {};
            
            for (const line of history) {
                try {
                    const entry = JSON.parse(line);
                    const cmd = entry.command || 'unknown';
                    commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
                    
                    const date = entry.timestamp?.split('T')[0] || 'unknown';
                    commandsByDate[date] = (commandsByDate[date] || 0) + 1;
                } catch {
                    // Plain text log entry - parse differently
                    const match = line.match(/\[(.*?)\] (\w+)/);
                    if (match) {
                        const cmd = match[2];
                        commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
                        
                        const date = match[1].split('T')[0];
                        commandsByDate[date] = (commandsByDate[date] || 0) + 1;
                    }
                }
            }
            
            return {
                totalCommands: history.length,
                commandCounts,
                commandsByDate,
                mostUsedCommand: Object.entries(commandCounts)
                    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none'
            };
        } catch (error) {
            logger.error('Failed to get activity stats', error);
            return {
                totalCommands: 0,
                commandCounts: {},
                commandsByDate: {},
                mostUsedCommand: 'none'
            };
        }
    }

    /**
     * Cleans up old log entries (older than 90 days)
     */
    async cleanupOldLogs(): Promise<void> {
        try {
            if (!fs.existsSync(this.activityLogPath)) {
                return;
            }
            
            const content = await fs.promises.readFile(this.activityLogPath, 'utf-8');
            const lines = content.split('\n');
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            
            const recentLines = lines.filter(line => {
                try {
                    const match = line.match(/\[(.*?)\]/);
                    if (match) {
                        const timestamp = new Date(match[1]);
                        return timestamp > cutoffDate;
                    }
                    return true; // Keep if we can't parse date
                } catch {
                    return true;
                }
            });
            
            await fs.promises.writeFile(
                this.activityLogPath,
                recentLines.join('\n'),
                'utf-8'
            );
            
            logger.info(`Cleaned up activity log - removed ${lines.length - recentLines.length} old entries`);
        } catch (error) {
            logger.error('Failed to cleanup old logs', error);
        }
    }

    /**
     * Gets the .devex directory path
     */
    getDevExPath(): string {
        return this.devexPath;
    }

    /**
     * Gets metrics file path (for compatibility with TelemetryService)
     */
    getMetricsPath(): string {
        return this.metricsPath;
    }
}

export interface PendingCompletion {
    issueKey: string;
    workspacePath: string;
    timestamp: number;
    isApiStory: boolean;
    repositoryUrl?: string;
}

export interface ActivityStats {
    totalCommands: number;
    commandCounts: Record<string, number>;
    commandsByDate: Record<string, number>;
    mostUsedCommand: string;
}

// Singleton instance
let instance: DevExStateManager | undefined;

export function getDevExStateManager(): DevExStateManager {
    if (!instance) {
        instance = new DevExStateManager();
    }
    return instance;
}
