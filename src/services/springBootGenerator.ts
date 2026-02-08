import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { logger } from '../utils/logger';
import { TemplateProvider } from './templateProvider';

// Register Handlebars helpers
Handlebars.registerHelper('eq', function(a: any, b: any) {
    return a === b;
});

Handlebars.registerHelper('ne', function(a: any, b: any) {
    return a !== b;
});

Handlebars.registerHelper('lt', function(a: any, b: any) {
    return a < b;
});

Handlebars.registerHelper('gt', function(a: any, b: any) {
    return a > b;
});

Handlebars.registerHelper('lte', function(a: any, b: any) {
    return a <= b;
});

Handlebars.registerHelper('gte', function(a: any, b: any) {
    return a >= b;
});

Handlebars.registerHelper('and', function(a: any, b: any) {
    return a && b;
});

Handlebars.registerHelper('or', function(a: any, b: any) {
    return a || b;
});

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

        try {
            logger.info(`Starting Spring Boot project generation at: ${projectPath}`);

            // Create project directory structure
            logger.info('Creating directory structure...');
            await this.createDirectoryStructure(projectPath, config.packageName);

            // Generate build file (pom.xml or build.gradle)
            logger.info('Generating build file...');
            await this.generateBuildFile(projectPath, config);

            // Generate application files
            logger.info('Generating application class...');
            await this.generateApplicationClass(projectPath, config);
            
            logger.info('Generating application.yml...');
            await this.generateApplicationYaml(projectPath, config);

            // Generate controllers, services, repositories from OpenAPI
            logger.info('Generating controllers, services, and repositories...');
            await this.generateControllersFromOpenAPI(projectPath, config, openApiEndpoints);

            // Generate configuration classes
            logger.info('Generating configuration classes...');
            await this.generateConfigurationClasses(projectPath, config);

            // Generate exception handler
            logger.info('Generating exception handler...');
            await this.generateExceptionHandler(projectPath, config);

            // Generate security classes
            logger.info('Generating security classes...');
            await this.generateSecurityClasses(projectPath, config);

            // Generate test files
            logger.info('Generating test scaffolding...');
            await this.generateTestScaffolding(projectPath, config);

            // Generate README
            logger.info('Generating README...');
            await this.generateReadme(projectPath, config);

            // Generate .gitignore
            logger.info('Generating .gitignore...');
            await this.generateGitignore(projectPath);

            // Copy deployment templates
            logger.info('Copying deployment templates...');
            await this.templateProvider.copyDeploymentTemplates(projectPath);

            logger.info(`Spring Boot project generated successfully at: ${projectPath}`);
            
        } catch (error: any) {
            logger.error(`Failed to generate Spring Boot project: ${error.message}`, error);
            throw new Error(`Project generation failed: ${error.message}`);
        }
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
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'security'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'util'),
            path.join(projectPath, 'src', 'main', 'resources'),
            path.join(projectPath, 'src', 'test', 'java', packagePath)
        ];

        for (const dir of dirs) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
    }

    private async generateBuildFile(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        try {
            if (config.buildTool === 'maven') {
                logger.info('Reading pom.xml template...');
                const template = await this.templateProvider.readSpringBootTemplate('pom.xml.template');
                
                logger.info('Compiling pom.xml template...');
                const compiled = Handlebars.compile(template);
                const content = compiled({
                    groupId: config.groupId,
                    artifactId: config.artifactId,
                    version: '0.0.1-SNAPSHOT',
                    springBootVersion: config.springBootVersion,
                    javaVersion: config.javaVersion,
                    projectName: config.projectName
                });
                
                const pomPath = path.join(projectPath, 'pom.xml');
                logger.info(`Writing pom.xml to: ${pomPath}`);
                await fs.promises.writeFile(pomPath, content, 'utf-8');
                logger.info('pom.xml written successfully');
                
            } else {
                // Gradle build file
                logger.info('Reading build.gradle template...');
                const template = await this.templateProvider.readSpringBootTemplate('build.gradle.template');
                
                logger.info('Compiling build.gradle template...');
                const compiled = Handlebars.compile(template);
                const content = compiled({
                    groupId: config.groupId,
                    version: '0.0.1-SNAPSHOT',
                    springBootVersion: config.springBootVersion,
                    javaVersion: config.javaVersion,
                    projectName: config.projectName
                });
                
                const gradlePath = path.join(projectPath, 'build.gradle');
                logger.info(`Writing build.gradle to: ${gradlePath}`);
                await fs.promises.writeFile(gradlePath, content, 'utf-8');
                logger.info('build.gradle written successfully');
            }
        } catch (error: any) {
            logger.error(`Failed to generate build file: ${error.message}`, error);
            throw new Error(`Build file generation failed: ${error.message}`);
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
            await this.generateModelClasses(projectPath, config, resource);
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
        
        // Generate GlobalExceptionHandler
        const handlerTemplate = await this.templateProvider.readSpringBootTemplate('GlobalExceptionHandler.java.template');
        const handlerCompiled = Handlebars.compile(handlerTemplate);
        const handlerContent = handlerCompiled({ packageName: config.packageName });
        const handlerPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'GlobalExceptionHandler.java');
        await fs.promises.writeFile(handlerPath, handlerContent, 'utf-8');
        
        // Generate ApplicationException
        const appExTemplate = await this.templateProvider.readSpringBootTemplate('ApplicationException.java.template');
        const appExCompiled = Handlebars.compile(appExTemplate);
        const appExContent = appExCompiled({ packageName: config.packageName });
        const appExPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'ApplicationException.java');
        await fs.promises.writeFile(appExPath, appExContent, 'utf-8');
        
        // Generate ResourceNotFoundException
        const notFoundTemplate = await this.templateProvider.readSpringBootTemplate('ResourceNotFoundException.java.template');
        const notFoundCompiled = Handlebars.compile(notFoundTemplate);
        const notFoundContent = notFoundCompiled({ packageName: config.packageName });
        const notFoundPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'ResourceNotFoundException.java');
        await fs.promises.writeFile(notFoundPath, notFoundContent, 'utf-8');
        
        // Generate BusinessValidationException
        const validationTemplate = await this.templateProvider.readSpringBootTemplate('BusinessValidationException.java.template');
        const validationCompiled = Handlebars.compile(validationTemplate);
        const validationContent = validationCompiled({ packageName: config.packageName });
        const validationPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'BusinessValidationException.java');
        await fs.promises.writeFile(validationPath, validationContent, 'utf-8');
    }

    private async generateSecurityClasses(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const securityPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'security');
        await fs.promises.mkdir(securityPath, { recursive: true });
        
        // Generate JwtRequestFilter
        const filterTemplate = await this.templateProvider.readSpringBootTemplate('JwtRequestFilter.java.template');
        const filterCompiled = Handlebars.compile(filterTemplate);
        const filterContent = filterCompiled({ packageName: config.packageName });
        const filterPath = path.join(securityPath, 'JwtRequestFilter.java');
        await fs.promises.writeFile(filterPath, filterContent, 'utf-8');
        
        // Generate JwtAuthenticationEntryPoint
        const entryPointTemplate = await this.templateProvider.readSpringBootTemplate('JwtAuthenticationEntryPoint.java.template');
        const entryPointCompiled = Handlebars.compile(entryPointTemplate);
        const entryPointContent = entryPointCompiled({ packageName: config.packageName });
        const entryPointPath = path.join(securityPath, 'JwtAuthenticationEntryPoint.java');
        await fs.promises.writeFile(entryPointPath, entryPointContent, 'utf-8');
        
        // Generate JwtTokenUtil
        const tokenUtilTemplate = await this.templateProvider.readSpringBootTemplate('JwtTokenUtil.java.template');
        const tokenUtilCompiled = Handlebars.compile(tokenUtilTemplate);
        const tokenUtilContent = tokenUtilCompiled({ packageName: config.packageName });
        const tokenUtilPath = path.join(securityPath, 'JwtTokenUtil.java');
        await fs.promises.writeFile(tokenUtilPath, tokenUtilContent, 'utf-8');
        
        // Generate SecurityConfig
        const securityConfigTemplate = await this.templateProvider.readSpringBootTemplate('SecurityConfig.java.template');
        const securityConfigCompiled = Handlebars.compile(securityConfigTemplate);
        const securityConfigContent = securityConfigCompiled({ packageName: config.packageName });
        const securityConfigPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'config', 'SecurityConfig.java');
        await fs.promises.writeFile(securityConfigPath, securityConfigContent, 'utf-8');
    }

    private async generateModelClasses(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        // Generate Request DTO
        const requestTemplate = await this.templateProvider.readSpringBootTemplate('RequestDto.java.template');
        const requestCompiled = Handlebars.compile(requestTemplate);
        const requestContent = requestCompiled({
            packageName: config.packageName,
            className: this.toPascalCase(resource) + 'Request',
            resourceName: resource,
            fields: [
                { name: 'name', type: 'String', required: true, isString: true },
                { name: 'description', type: 'String', required: false, isString: true },
                { name: 'status', type: 'String', required: false, isString: true }
            ]
        });
        const requestPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'model', 'dto', `${this.toPascalCase(resource)}Request.java`);
        await fs.promises.writeFile(requestPath, requestContent, 'utf-8');
        
        // Generate Response DTO
        const responseTemplate = await this.templateProvider.readSpringBootTemplate('ResponseDto.java.template');
        const responseCompiled = Handlebars.compile(responseTemplate);
        const responseContent = responseCompiled({
            packageName: config.packageName,
            className: this.toPascalCase(resource) + 'Response',
            resourceName: resource,
            fields: [
                { name: 'name', type: 'String' },
                { name: 'description', type: 'String' }
            ]
        });
        const responsePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'model', 'dto', `${this.toPascalCase(resource)}Response.java`);
        await fs.promises.writeFile(responsePath, responseContent, 'utf-8');
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
