import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProductivityMetric, MetricsCalculator } from '../utils/metricsCalculator';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export class TelemetryService {
    private context: vscode.ExtensionContext;
    private metricsFilePath: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Store metrics in user's home directory
        const homeDir = os.homedir();
        const devexDir = path.join(homeDir, '.devex-ai-assistant');
        if (!fs.existsSync(devexDir)) {
            fs.mkdirSync(devexDir, { recursive: true });
        }
        this.metricsFilePath = path.join(devexDir, 'metrics.json');
    }

    trackEvent(eventName: string, properties?: Record<string, any>): void {
        const config = getConfig();
        if (!config.telemetryEnabled) {
            return;
        }

        logger.info(`Event: ${eventName}${properties ? ' - ' + JSON.stringify(properties) : ''}`);
    }

    async trackProductivityMetric(
        feature: string,
        manualTimeEstimate: number,
        actualTimeSeconds: number
    ): Promise<void> {
        const config = getConfig();
        if (!config.telemetryEnabled) {
            return;
        }

        const timeSaved = MetricsCalculator.calculateTimeSaved(manualTimeEstimate, actualTimeSeconds);
        
        const metric: ProductivityMetric = {
            timestamp: Date.now(),
            feature,
            manualTimeEstimate,
            actualTime: actualTimeSeconds,
            timeSaved,
            helpful: null
        };

        await this.saveMetric(metric);

        // Show feedback prompt
        this.promptFeedback(metric);
    }

    private async promptFeedback(metric: ProductivityMetric): Promise<void> {
        const timeSavedStr = MetricsCalculator.formatTimeSaved(metric.timeSaved);
        const response = await vscode.window.showInformationMessage(
            `Saved approximately ${timeSavedStr}! Was this helpful?`,
            '👍 Yes',
            '👎 No'
        );

        if (response) {
            metric.helpful = response === '👍 Yes';
            await this.updateMetric(metric);
        }
    }

    private async saveMetric(metric: ProductivityMetric): Promise<void> {
        try {
            const metrics = await this.loadMetrics();
            metrics.push(metric);
            await fs.promises.writeFile(
                this.metricsFilePath,
                JSON.stringify(metrics, null, 2),
                'utf-8'
            );
        } catch (error) {
            logger.error('Failed to save metric', error);
        }
    }

    private async updateMetric(metric: ProductivityMetric): Promise<void> {
        try {
            const metrics = await this.loadMetrics();
            const index = metrics.findIndex(m => m.timestamp === metric.timestamp);
            if (index !== -1) {
                metrics[index] = metric;
                await fs.promises.writeFile(
                    this.metricsFilePath,
                    JSON.stringify(metrics, null, 2),
                    'utf-8'
                );
            }
        } catch (error) {
            logger.error('Failed to update metric', error);
        }
    }

    async loadMetrics(): Promise<ProductivityMetric[]> {
        try {
            if (!fs.existsSync(this.metricsFilePath)) {
                return [];
            }
            const content = await fs.promises.readFile(this.metricsFilePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to load metrics', error);
            return [];
        }
    }

    async getMetricsSummary() {
        const metrics = await this.loadMetrics();
        return MetricsCalculator.calculateSummary(metrics);
    }
}
