import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';
import {
    AgentDeploymentService,
    AgentTemplate,
    AGENT_TEMPLATES,
} from '../services/agentDeploymentService';
import { logger } from '../utils/logger';

/**
 * Command: devex.generateAgent
 *
 * Shows a catalog of role-based agent templates, lets the engineer pick one,
 * and deploys it to ~/.copilot/agents/ (user-level, works across all projects).
 */
export async function generateAgentCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const service = new AgentDeploymentService(context.extensionPath);

    // Build QuickPick items from the catalog
    const items: (vscode.QuickPickItem & { template: AgentTemplate })[] = AGENT_TEMPLATES.map(t => ({
        label: t.label,
        description: t.description,
        detail: t.detail,
        template: t,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Deploy Engineering Agent to ~/.copilot/agents/',
        placeHolder: 'Select a role-based agent to deploy...',
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked) {
        return;
    }

    try {
        const deployPath = await service.deployAgent(picked.template);
        AgentDeploymentService.showDeploySuccessMessage(picked.template.id, 'agent', deployPath);
        telemetryService.trackEvent('generateAgent.deployed', { agentId: picked.template.id });
        logger.info(`Agent deployed: ${picked.template.id}`);
    } catch (error: any) {
        const msg = `Failed to deploy agent: ${error.message}`;
        vscode.window.showErrorMessage(msg);
        logger.error('generateAgent error', error);
    }
}
