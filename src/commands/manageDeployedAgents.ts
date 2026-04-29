import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';
import {
    AgentDeploymentService,
    DeployedItem,
    getCopilotHome,
} from '../services/agentDeploymentService';
import { logger } from '../utils/logger';

/**
 * Command: devex.manageDeployedAgents
 *
 * Lists all agents and skills currently deployed in ~/.copilot/ and
 * lets the engineer remove any of them.
 */
export async function manageDeployedAgentsCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const service = new AgentDeploymentService(context.extensionPath);
    const deployed = service.listDeployed();

    if (deployed.length === 0) {
        const copilotHome = getCopilotHome();
        vscode.window.showInformationMessage(
            `No DevEx agents or skills found in ${copilotHome}. Use "Deploy Engineering Agent" or "Deploy Engineering Skill" to get started.`,
            'Deploy Agent',
            'Deploy Skill'
        ).then(selection => {
            if (selection === 'Deploy Agent') {
                vscode.commands.executeCommand('devex.generateAgent');
            } else if (selection === 'Deploy Skill') {
                vscode.commands.executeCommand('devex.generateSkill');
            }
        });
        return;
    }

    // Build QuickPick items for deployed items
    type DeployedPickItem = vscode.QuickPickItem & { item: DeployedItem };

    const items: DeployedPickItem[] = deployed.map(item => ({
        label: item.type === 'agent'
            ? `$(person) ${item.name}`
            : `$(lightbulb) ${item.name}`,
        description: item.type === 'agent' ? 'Agent' : 'Skill',
        detail: item.path,
        item,
    }));

    // Add a separator + "Deploy new..." entries at the bottom
    const separatorItem: vscode.QuickPickItem = { label: '', kind: vscode.QuickPickItemKind.Separator };
    const deployAgentItem: vscode.QuickPickItem = { label: '$(add) Deploy a new agent...', description: '' };
    const deploySkillItem: vscode.QuickPickItem = { label: '$(add) Deploy a new skill...', description: '' };

    const allItems: vscode.QuickPickItem[] = [...items, separatorItem, deployAgentItem, deploySkillItem];

    const picked = await vscode.window.showQuickPick(allItems, {
        title: `Manage Deployed Agents & Skills (${deployed.length} installed)`,
        placeHolder: 'Select an item to remove, or deploy a new one...',
        matchOnDescription: true,
    });

    if (!picked) {
        return;
    }

    if (picked.label === deployAgentItem.label) {
        vscode.commands.executeCommand('devex.generateAgent');
        return;
    }

    if (picked.label === deploySkillItem.label) {
        vscode.commands.executeCommand('devex.generateSkill');
        return;
    }

    const pickedDeployed = (picked as DeployedPickItem).item;
    if (!pickedDeployed) {
        return;
    }

    // Confirm removal
    const confirm = await vscode.window.showWarningMessage(
        `Remove ${pickedDeployed.type} "${pickedDeployed.name}" from ${pickedDeployed.path}?`,
        { modal: true },
        'Remove'
    );

    if (confirm !== 'Remove') {
        return;
    }

    try {
        service.removeDeployed(pickedDeployed);
        vscode.window.showInformationMessage(
            `🗑️ ${pickedDeployed.type === 'agent' ? 'Agent' : 'Skill'} "${pickedDeployed.name}" removed.`
        );
        telemetryService.trackEvent('manageDeployedAgents.removed', {
            name: pickedDeployed.name,
            type: pickedDeployed.type,
        });
        logger.info(`Removed ${pickedDeployed.type}: ${pickedDeployed.name}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to remove: ${error.message}`);
        logger.error('manageDeployedAgents remove error', error);
    }
}
