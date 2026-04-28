import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';
import {
    AgentDeploymentService,
    SkillTemplate,
    SKILL_TEMPLATES,
} from '../services/agentDeploymentService';
import { logger } from '../utils/logger';

/**
 * Command: devex.generateSkill
 *
 * Shows a catalog of skill templates, lets the engineer pick one,
 * and deploys it to ~/.copilot/skills/<name>/ (user-level, works across all projects).
 */
export async function generateSkillCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    const service = new AgentDeploymentService(context.extensionPath);

    // Build QuickPick items from the catalog
    const items: (vscode.QuickPickItem & { template: SkillTemplate })[] = SKILL_TEMPLATES.map(t => ({
        label: t.label,
        description: t.description,
        detail: t.detail,
        template: t,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Deploy Engineering Skill to ~/.copilot/skills/',
        placeHolder: 'Select a skill to deploy...',
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked) {
        return;
    }

    try {
        const deployPath = await service.deploySkill(picked.template);
        AgentDeploymentService.showDeploySuccessMessage(picked.template.id, 'skill', deployPath);
        telemetryService.trackEvent('generateSkill.deployed', { skillId: picked.template.id });
        logger.info(`Skill deployed: ${picked.template.id}`);
    } catch (error: any) {
        const msg = `Failed to deploy skill: ${error.message}`;
        vscode.window.showErrorMessage(msg);
        logger.error('generateSkill error', error);
    }
}
