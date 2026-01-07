import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';
import { MetricsCalculator } from '../utils/metricsCalculator';

export async function viewDashboardCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'devexDashboard',
        'DevEx Productivity Dashboard',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const summary = await telemetryService.getMetricsSummary();
    const metrics = await telemetryService.loadMetrics();

    panel.webview.html = getWebviewContent(summary, metrics);
}

function getWebviewContent(summary: any, metrics: any[]): string {
    const recentMetrics = metrics.slice(-10).reverse();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Productivity Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-editor-foreground);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
            margin-top: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            font-weight: bold;
        }
        .positive {
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
    </style>
</head>
<body>
    <h1>📊 DevEx AI Assistant - Productivity Dashboard</h1>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value positive">${summary.totalTimeSaved.toFixed(1)} hrs</div>
            <div class="stat-label">Total Time Saved</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${summary.totalUsages}</div>
            <div class="stat-label">Total Usages</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${summary.helpfulCount}</div>
            <div class="stat-label">Helpful Ratings</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${summary.mostUsedFeature}</div>
            <div class="stat-label">Most Used Feature</div>
        </div>
    </div>

    <h2>💰 ROI Calculation</h2>
    <p>Assuming an average hourly rate of $120:</p>
    <div class="stat-card">
        <div class="stat-value positive">$${(summary.totalTimeSaved * 120).toFixed(2)}</div>
        <div class="stat-label">Total Cost Savings</div>
    </div>

    <h2>📈 Recent Activity</h2>
    <table>
        <thead>
            <tr>
                <th>Feature</th>
                <th>Time Saved</th>
                <th>Date</th>
                <th>Helpful</th>
            </tr>
        </thead>
        <tbody>
            ${recentMetrics.map(m => `
                <tr>
                    <td>${m.feature}</td>
                    <td class="positive">${MetricsCalculator.formatTimeSaved(m.timeSaved)}</td>
                    <td>${new Date(m.timestamp).toLocaleDateString()}</td>
                    <td>${m.helpful === true ? '👍' : m.helpful === false ? '👎' : '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>🎯 Feature Usage</h2>
    <table>
        <thead>
            <tr>
                <th>Feature</th>
                <th>Usage Count</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(summary.featureUsageCounts).map(([feature, count]) => `
                <tr>
                    <td>${feature}</td>
                    <td>${count}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <p style="margin-top: 40px; opacity: 0.7; font-size: 0.9em;">
        This dashboard tracks your productivity gains using DevEx AI Assistant.
        All data is stored locally on your machine.
    </p>
</body>
</html>`;
}
