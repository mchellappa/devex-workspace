import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { logger } from '../utils/logger';
import { TemplateProvider } from './templateProvider';

export interface SpringBootProjectConfig {
    projectName: string;
    packageName: string;
    groupId: string;
    artifactId: string;
    javaVersion: string;
    springBootVersion: string;
    buildTool: 'maven' | 'gradle';
    targetDirectory: string;
}

export interface OpenAPIEndpoint {
    path: string;
    method: string;
    operationId: string;
    summary: string;
    requestBody?: any;
    responses: any;
}

export class SpringBootGenerator {
    private templateProvider: TemplateProvider;

    constructor(templateProvider: TemplateProvider) {
        this.templateProvider = templateProvider;
    }

    async generateProject(config: SpringBootProjectConfig, openApiEndpoints: OpenAPIEndpoint[]): Promise<void> {
        const projectPath = path.join(config.targetDirectory, config.projectName);

        // Create project directory structure
        await this.createDirectoryStructure(projectPath, config.packageName);

        // Generate build file (pom.xml or build.gradle)
        await this.generateBuildFile(projectPath, config);

        // Generate application files
        await this.generateApplicationClass(projectPath, config);
        await this.generateApplicationYaml(projectPath, config);

        // Generate controllers, services, repositories from OpenAPI
        await this.generateControllersFromOpenAPI(projectPath, config, openApiEndpoints);

        // Generate configuration classes
        await this.generateConfigurationClasses(projectPath, config);

        // Generate exception handler
        await this.generateExceptionHandler(projectPath, config);

        // Generate test files
        await this.generateTestScaffolding(projectPath, config);

        // Generate README
        await this.generateReadme(projectPath, config);

        // Generate .gitignore
        await this.generateGitignore(projectPath);

        // Copy deployment templates
        await this.templateProvider.copyDeploymentTemplates(projectPath);

        logger.info(`Spring Boot project generated successfully at: ${projectPath}`);
    }

    private async createDirectoryStructure(projectPath: string, packageName: string): Promise<void> {
        const packagePath = packageName.replace(/\./g, '/');
        
        const dirs = [
            path.join(projectPath, 'src', 'main', 'java', packagePath),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'config'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'controller'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'service'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'repository'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'model', 'entity'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'model', 'dto'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'util'),
            path.join(projectPath, 'src', 'main', 'resources'),
            path.join(projectPath, 'src', 'test', 'java', packagePath)
        ];

        for (const dir of dirs) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
    }

    private async generateBuildFile(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        if (config.buildTool === 'maven') {
            const template = await this.templateProvider.readSpringBootTemplate('pom.xml.template');
            const compiled = Handlebars.compile(template);
            const content = compiled({
                groupId: config.groupId,
                artifactId: config.artifactId,
                version: '0.0.1-SNAPSHOT',
                springBootVersion: config.springBootVersion,
                javaVersion: config.javaVersion,
                projectName: config.projectName
            });
            await fs.promises.writeFile(path.join(projectPath, 'pom.xml'), content, 'utf-8');
        } else {
            // Gradle build file
            const template = await this.templateProvider.readSpringBootTemplate('build.gradle.template');
            const compiled = Handlebars.compile(template);
            const content = compiled({
                groupId: config.groupId,
                version: '0.0.1-SNAPSHOT',
                springBootVersion: config.springBootVersion,
                javaVersion: config.javaVersion,
                projectName: config.projectName
            });
            await fs.promises.writeFile(path.join(projectPath, 'build.gradle'), content, 'utf-8');
        }
    }

    private async generateApplicationClass(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(config.artifactId) + 'Application';
        
        const template = await this.templateProvider.readSpringBootTemplate('Application.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateApplicationYaml(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const template = await this.templateProvider.readSpringBootTemplate('application.yml.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            projectName: config.projectName,
            artifactId: config.artifactId
        });

        const filePath = path.join(projectPath, 'src', 'main', 'resources', 'application.yml');
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateControllersFromOpenAPI(
        projectPath: string,
        config: SpringBootProjectConfig,
        endpoints: OpenAPIEndpoint[]
    ): Promise<void> {
        // Group endpoints by resource
        const resourceEndpoints: Record<string, OpenAPIEndpoint[]> = {};
        
        endpoints.forEach(endpoint => {
            const resource = this.extractResourceName(endpoint.path);
            if (!resourceEndpoints[resource]) {
                resourceEndpoints[resource] = [];
            }
            resourceEndpoints[resource].push(endpoint);
        });

        // Generate controller for each resource
        for (const [resource, resourceEndpointsList] of Object.entries(resourceEndpoints)) {
            await this.generateController(projectPath, config, resource, resourceEndpointsList);
            await this.generateService(projectPath, config, resource);
            await this.generateRepository(projectPath, config, resource);
        }
    }

    private async generateController(
        projectPath: string,
        config: SpringBootProjectConfig,
        resource: string,
        endpoints: OpenAPIEndpoint[]
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Controller';
        
        const template = await this.templateProvider.readSpringBootTemplate('Controller.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            resourceName: resource,
            serviceName: this.toPascalCase(resource) + 'Service',
            endpoints: endpoints.map(e => ({
                method: e.method.toUpperCase(),
                path: e.path,
                operationId: e.operationId || this.toCamelCase(e.method + '_' + resource),
                summary: e.summary || ''
            }))
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'controller', `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateService(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Service';
        
        const template = await this.templateProvider.readSpringBootTemplate('Service.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            resourceName: resource,
            repositoryName: this.toPascalCase(resource) + 'Repository'
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'service', `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateRepository(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Repository';
        
        const template = await this.templateProvider.readSpringBootTemplate('Repository.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: this.toPascalCase(resource),
            resourceName: resource
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'repository', `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateConfigurationClasses(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        const template = await this.templateProvider.readSpringBootTemplate('OpenApiConfig.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            projectName: config.projectName
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'config', 'OpenApiConfig.java');
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateExceptionHandler(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        const template = await this.templateProvider.readSpringBootTemplate('GlobalExceptionHandler.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'GlobalExceptionHandler.java');
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateTestScaffolding(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(config.artifactId) + 'ApplicationTests';
        
        const template = await this.templateProvider.readSpringBootTemplate('ApplicationTests.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className
        });

        const filePath = path.join(projectPath, 'src', 'test', 'java', packagePath, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateReadme(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const template = await this.templateProvider.readSpringBootTemplate('README.md.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            projectName: config.projectName,
            artifactId: config.artifactId,
            buildTool: config.buildTool,
            javaVersion: config.javaVersion,
            springBootVersion: config.springBootVersion
        });

        await fs.promises.writeFile(path.join(projectPath, 'README.md'), content, 'utf-8');
    }

    private async generateGitignore(projectPath: string): Promise<void> {
        const template = await this.templateProvider.readSpringBootTemplate('.gitignore.template');
        await fs.promises.writeFile(path.join(projectPath, '.gitignore'), template, 'utf-8');
    }

    // Utility methods
    private extractResourceName(path: string): string {
        const parts = path.split('/').filter(p => p && !p.startsWith('{'));
        return parts[0] || 'api';
    }

    private toPascalCase(str: string): string {
        return str.replace(/(^\w|-\w|_\w)/g, (match) => match.replace(/-|_/, '').toUpperCase());
    }

    private toCamelCase(str: string): string {
        const pascal = this.toPascalCase(str);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }
}
