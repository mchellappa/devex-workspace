import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface AgentTemplate {
    id: string;
    label: string;
    description: string;
    detail: string;
    fileName: string;
}

export interface SkillTemplate {
    id: string;
    label: string;
    description: string;
    detail: string;
    directoryName: string;
}

export interface DeployedItem {
    name: string;
    type: 'agent' | 'skill';
    path: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
    {
        id: 'spring-boot-engineer',
        label: '$(coffee) Spring Boot Engineer',
        description: 'Java/Spring Boot microservices specialist',
        detail: 'DDD, JPA, REST APIs, Spring Security, unit testing patterns (JUnit 5 + Mockito)',
        fileName: 'spring-boot-engineer.agent.md',
    },
    {
        id: 'devops-engineer',
        label: '$(server-process) DevOps Engineer',
        description: 'Kubernetes, AKS, GitHub Actions, Docker',
        detail: 'Helm charts, CI/CD pipelines, container security, AKS best practices',
        fileName: 'devops-engineer.agent.md',
    },
    {
        id: 'api-designer',
        label: '$(symbol-interface) API Designer',
        description: 'OpenAPI 3.0 and REST design specialist',
        detail: 'Contract-first design, resource modeling, versioning, RFC 7807 error handling',
        fileName: 'api-designer.agent.md',
    },
    {
        id: 'security-reviewer',
        label: '$(shield) Security Reviewer',
        description: 'OWASP, JWT/OAuth2, secrets management',
        detail: 'OWASP Top 10, Spring Security config, secrets detection, threat modeling',
        fileName: 'security-reviewer.agent.md',
    },
    {
        id: 'data-engineer',
        label: '$(database) Data Engineer',
        description: 'SQL/NoSQL schema design and JPA expert',
        detail: 'Flyway migrations, JPA entity design, query optimization, Azure SQL / Cosmos DB',
        fileName: 'data-engineer.agent.md',
    },
];

export const SKILL_TEMPLATES: SkillTemplate[] = [
    {
        id: 'spring-boot-testing',
        label: '$(beaker) Spring Boot Testing',
        description: 'JUnit 5, Mockito, MockMvc patterns',
        detail: 'Service unit tests, controller @WebMvcTest, repository @DataJpaTest, naming conventions',
        directoryName: 'spring-boot-testing',
    },
    {
        id: 'openapi-validation',
        label: '$(check) OpenAPI Validation',
        description: 'OpenAPI 3.0 completeness and code-gen readiness',
        detail: 'operationId checks, schema quality, shared components, pagination, error responses',
        directoryName: 'openapi-validation',
    },
    {
        id: 'kubernetes-deployment',
        label: '$(rocket) Kubernetes Deployment',
        description: 'K8s manifests and AKS best practices',
        detail: 'Resource sizing, HPA, security context, AKS Workload Identity, troubleshooting',
        directoryName: 'kubernetes-deployment',
    },
    {
        id: 'github-actions-debugging',
        label: '$(debug) GitHub Actions Debugging',
        description: 'Diagnose and fix failing CI/CD workflows',
        detail: 'Step-by-step failure classification, secrets debugging, Docker/K8s deploy issues',
        directoryName: 'github-actions-debugging',
    },
    {
        id: 'java-code-review',
        label: '$(search) Java Code Review',
        description: 'Java best practices checklist',
        detail: 'Null safety, exception handling, streams, immutability, Spring-specific anti-patterns',
        directoryName: 'java-code-review',
    },
    {
        id: 'jira-workflow',
        label: '$(issues) Jira Workflow',
        description: 'Story analysis, TODO generation, comment templates',
        detail: 'Requirements extraction, multi-repo coordination, PR comment templates, state transitions',
        directoryName: 'jira-workflow',
    },
];

/**
 * Resolves the Copilot home directory.
 * Respects the COPILOT_HOME environment variable if set.
 */
export function getCopilotHome(): string {
    return process.env['COPILOT_HOME'] || path.join(os.homedir(), '.copilot');
}

export class AgentDeploymentService {
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    /**
     * Deploys a bundled agent template to ~/.copilot/agents/<filename>.
     */
    async deployAgent(template: AgentTemplate): Promise<string> {
        const copilotHome = getCopilotHome();
        const agentsDir = path.join(copilotHome, 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });

        const sourcePath = path.join(this.extensionPath, 'templates', 'agents', template.fileName);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Agent template not found: ${template.fileName}`);
        }

        const destPath = path.join(agentsDir, template.fileName);
        fs.copyFileSync(sourcePath, destPath);
        logger.info(`Deployed agent '${template.id}' to ${destPath}`);
        return destPath;
    }

    /**
     * Deploys a bundled skill template directory to ~/.copilot/skills/<name>/.
     */
    async deploySkill(template: SkillTemplate): Promise<string> {
        const copilotHome = getCopilotHome();
        const skillsDir = path.join(copilotHome, 'skills');
        const destDir = path.join(skillsDir, template.directoryName);
        fs.mkdirSync(destDir, { recursive: true });

        const sourceDir = path.join(this.extensionPath, 'templates', 'skills', template.directoryName);
        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Skill template directory not found: ${template.directoryName}`);
        }

        this.copyDirectoryRecursive(sourceDir, destDir);
        logger.info(`Deployed skill '${template.id}' to ${destDir}`);
        return destDir;
    }

    /**
     * Lists all agents and skills currently deployed in ~/.copilot/.
     */
    listDeployed(): DeployedItem[] {
        const copilotHome = getCopilotHome();
        const items: DeployedItem[] = [];

        // List agents
        const agentsDir = path.join(copilotHome, 'agents');
        if (fs.existsSync(agentsDir)) {
            for (const file of fs.readdirSync(agentsDir)) {
                if (file.endsWith('.agent.md')) {
                    items.push({
                        name: file.replace('.agent.md', ''),
                        type: 'agent',
                        path: path.join(agentsDir, file),
                    });
                }
            }
        }

        // List skills
        const skillsDir = path.join(copilotHome, 'skills');
        if (fs.existsSync(skillsDir)) {
            for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
                    if (fs.existsSync(skillMd)) {
                        items.push({
                            name: entry.name,
                            type: 'skill',
                            path: path.join(skillsDir, entry.name),
                        });
                    }
                }
            }
        }

        return items;
    }

    /**
     * Removes a deployed agent (file) or skill (directory) from ~/.copilot/.
     */
    removeDeployed(item: DeployedItem): void {
        if (!fs.existsSync(item.path)) {
            throw new Error(`${item.type} '${item.name}' not found at ${item.path}`);
        }

        if (item.type === 'agent') {
            fs.unlinkSync(item.path);
            logger.info(`Removed agent '${item.name}' from ${item.path}`);
        } else {
            fs.rmSync(item.path, { recursive: true, force: true });
            logger.info(`Removed skill '${item.name}' from ${item.path}`);
        }
    }

    private copyDirectoryRecursive(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirectoryRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
                // Restore executable bit for shell scripts on non-Windows platforms.
                // fs.copyFileSync does not preserve file mode bits.
                if (process.platform !== 'win32' && entry.name.endsWith('.sh')) {
                    fs.chmodSync(destPath, 0o755);
                }
            }
        }
    }

    /**
     * Shows a VS Code information message with CLI usage instructions after deploy.
     */
    static showDeploySuccessMessage(name: string, type: 'agent' | 'skill', deployPath: string): void {
        const cliTip = type === 'agent'
            ? `In Copilot CLI, use /agent to select it, or: copilot --agent="${name}"`
            : `In Copilot CLI, run /skills reload then /skills list to verify.`;

        vscode.window.showInformationMessage(
            `✅ ${type === 'agent' ? 'Agent' : 'Skill'} "${name}" deployed to ${deployPath}`,
            'Copy CLI Tip'
        ).then(selection => {
            if (selection === 'Copy CLI Tip') {
                vscode.env.clipboard.writeText(cliTip);
                vscode.window.showInformationMessage(`Copied: ${cliTip}`);
            }
        });
    }
}
