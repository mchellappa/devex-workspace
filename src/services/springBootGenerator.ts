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

Handlebars.registerHelper('camelCase', function(str: any) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toLowerCase() + str.slice(1);
});

Handlebars.registerHelper('pascalCase', function(str: any) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
});

// Helper for proper HTTP method annotation capitalization
// GET -> GetMapping, POST -> PostMapping, etc.
Handlebars.registerHelper('methodMapping', function(method: string) {
    if (!method) {
        return 'GetMapping';
    }
    const normalized = method.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1) + 'Mapping';
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

    async generateProject(
        config: SpringBootProjectConfig, 
        openApiEndpoints: OpenAPIEndpoint[],
        schemas: Record<string, any> = {}
    ): Promise<void> {
        const projectPath = path.join(config.targetDirectory, config.projectName);

        try {
            logger.info(`Starting Spring Boot project generation at: ${projectPath}`);
            logger.info(`Using ${Object.keys(schemas).length} schemas from OpenAPI spec`);

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
            const resources = await this.generateControllersFromOpenAPI(projectPath, config, openApiEndpoints, schemas);

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
            await this.generateTestScaffolding(projectPath, config, resources);

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
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'entity'),
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto'),
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
            artifactId: config.artifactId,
            packageName: config.packageName
        });

        const filePath = path.join(projectPath, 'src', 'main', 'resources', 'application.yml');
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateControllersFromOpenAPI(
        projectPath: string,
        config: SpringBootProjectConfig,
        endpoints: OpenAPIEndpoint[],
        schemas: Record<string, any>
    ): Promise<string[]> {
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
        const resources = Object.keys(resourceEndpoints);
        for (const [resource, resourceEndpointsList] of Object.entries(resourceEndpoints)) {
            await this.generateController(projectPath, config, resource, resourceEndpointsList);
            await this.generateService(projectPath, config, resource);
            await this.generateRepository(projectPath, config, resource);
            await this.generateMapper(projectPath, config, resource);
            
            // Find matching schema for this resource
            const resourceSchema = this.findSchemaForResource(resource, schemas);
            await this.generateModelClasses(projectPath, config, resource, resourceSchema);
        }
        
        return resources;
    }

    private async generateController(
        projectPath: string,
        config: SpringBootProjectConfig,
        resource: string,
        endpoints: OpenAPIEndpoint[]
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Controller';
        const entityName = this.toPascalCase(resource);
        
        const template = await this.templateProvider.readSpringBootTemplate('Controller.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: entityName,
            resourceName: resource,
            serviceName: entityName + 'Service',
            endpoints: endpoints.map(e => ({
                method: e.method.toUpperCase(),
                path: e.path,
                operationId: e.operationId || this.toCamelCase(e.method + '_' + resource),
                summary: e.summary || ''
            }))
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'controller', `${className}.java`);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateService(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Service';
        const entityName = this.toPascalCase(resource);
        
        const template = await this.templateProvider.readSpringBootTemplate('Service.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: entityName,
            resourceName: resource,
            repositoryName: entityName + 'Repository'
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'service', `${className}.java`);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
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
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateMapper(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        const className = entityName + 'Mapper';
        
        const template = await this.templateProvider.readSpringBootTemplate('Mapper.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName,
            resourceName: resource
        });

        // Create mapper directory if it doesn't exist
        const mapperDir = path.join(projectPath, 'src', 'main', 'java', packagePath, 'mapper');
        if (!fs.existsSync(mapperDir)) {
            fs.mkdirSync(mapperDir, { recursive: true });
        }

        const filePath = path.join(mapperDir, `${className}.java`);
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
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateExceptionHandler(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        // Generate GlobalExceptionHandler
        const handlerTemplate = await this.templateProvider.readSpringBootTemplate('GlobalExceptionHandler.java.template');
        const handlerCompiled = Handlebars.compile(handlerTemplate);
        const handlerContent = handlerCompiled({ packageName: config.packageName });
        const handlerPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'exception', 'GlobalExceptionHandler.java');
        await fs.promises.mkdir(path.dirname(handlerPath), { recursive: true });
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
        
        // Generate SecurityConfig (simplified for APIM-backed deployment)
        const securityConfigTemplate = await this.templateProvider.readSpringBootTemplate('SecurityConfig.java.template');
        const securityConfigCompiled = Handlebars.compile(securityConfigTemplate);
        const securityConfigContent = securityConfigCompiled({ packageName: config.packageName });
        const securityConfigPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'config', 'SecurityConfig.java');
        await fs.promises.writeFile(securityConfigPath, securityConfigContent, 'utf-8');
        
        // NOTE: JWT-related classes (JwtTokenUtil, JwtRequestFilter, CustomUserDetailsService) 
        // are NOT generated by default since APIM handles authentication.
        // If you need JWT authentication, add these classes manually or use a custom template.
    }

    private async generateModelClasses(
        projectPath: string, 
        config: SpringBootProjectConfig, 
        resource: string,
        schema?: any
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        
        // Validate entityName is not empty
        if (!entityName || entityName.trim() === '') {
            logger.error(`Failed to generate entity name from resource: "${resource}"`);
            throw new Error(`Invalid resource name: "${resource}" - cannot generate entity`);
        }
        
        logger.info(`Generating model classes for resource: "${resource}" -> entityName: "${entityName}"`);
        
        // Use schema fields if available, otherwise use default fields
        let fields: any[];
        if (schema && schema.fields && schema.fields.length > 0) {
            fields = schema.fields;
            logger.info(`Using ${fields.length} fields from OpenAPI schema for ${entityName}`);
        } else {
            // Fallback to default fields if no schema found
            fields = [
                { name: 'name', type: 'String', required: true, isString: true },
                { name: 'description', type: 'String', required: false, isString: true },
                { name: 'status', type: 'String', required: false, isString: true }
            ];
            logger.warn(`No schema found for ${entityName}, using default fields`);
        }
        
        // Generate Entity
        const entityTemplate = await this.templateProvider.readSpringBootTemplate('Entity.java.template');
        const entityCompiled = Handlebars.compile(entityTemplate);
        const entityContent = entityCompiled({
            packageName: config.packageName,
            className: entityName,
            tableName: resource.toLowerCase(),
            resourceName: resource,
            fields
        });
        const entityPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'entity', `${entityName}.java`);
        await fs.promises.mkdir(path.dirname(entityPath), { recursive: true });
        await fs.promises.writeFile(entityPath, entityContent, 'utf-8');
        
        // Generate Request DTO
        const requestTemplate = await this.templateProvider.readSpringBootTemplate('RequestDto.java.template');
        const requestCompiled = Handlebars.compile(requestTemplate);
        const requestContent = requestCompiled({
            packageName: config.packageName,
            className: entityName + 'Request',
            resourceName: resource,
            fields
        });
        const requestPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto', `${entityName}Request.java`);
        await fs.promises.mkdir(path.dirname(requestPath), { recursive: true });
        await fs.promises.writeFile(requestPath, requestContent, 'utf-8');
        
        // Generate Response DTO
        const responseTemplate = await this.templateProvider.readSpringBootTemplate('ResponseDto.java.template');
        const responseCompiled = Handlebars.compile(responseTemplate);
        const responseContent = responseCompiled({
            packageName: config.packageName,
            className: entityName + 'Response',
            resourceName: resource,
            fields
        });
        const responsePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto', `${entityName}Response.java`);
        await fs.promises.mkdir(path.dirname(responsePath), { recursive: true });
        await fs.promises.writeFile(responsePath, responseContent, 'utf-8');
    }

    /**
     * Find matching schema for a resource name
     * Tries to match by singular/plural forms
     */
    private findSchemaForResource(resource: string, schemas: Record<string, any>): any | undefined {
        if (!resource || Object.keys(schemas).length === 0) {
            return undefined;
        }

        const resourceLower = resource.toLowerCase();
        const resourcePascal = this.toPascalCase(resource);

        // Try exact match first (case-insensitive)
        for (const [schemaName, schema] of Object.entries(schemas)) {
            if (schemaName.toLowerCase() === resourceLower) {
                logger.info(`Found exact schema match: ${schemaName} for resource ${resource}`);
                return schema;
            }
        }

        // Try PascalCase match
        if (schemas[resourcePascal]) {
            logger.info(`Found PascalCase schema match: ${resourcePascal} for resource ${resource}`);
            return schemas[resourcePascal];
        }

        // Try singular/plural variations
        const singular = this.toSingular(resourceLower);
        const plural = this.toPlural(resourceLower);

        for (const [schemaName, schema] of Object.entries(schemas)) {
            const schemaLower = schemaName.toLowerCase();
            if (schemaLower === singular || schemaLower === plural) {
                logger.info(`Found singular/plural schema match: ${schemaName} for resource ${resource}`);
                return schema;
            }
        }

        logger.warn(`No schema found for resource: ${resource}`);
        return undefined;
    }

    /**
     * Simple singularization - handles common cases
     */
    private toSingular(word: string): string {
        if (word.endsWith('ies')) {
            return word.slice(0, -3) + 'y';
        }
        if (word.endsWith('ses') || word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes')) {
            return word.slice(0, -2);
        }
        if (word.endsWith('s') && !word.endsWith('ss')) {
            return word.slice(0, -1);
        }
        return word;
    }

    /**
     * Simple pluralization - handles common cases
     */
    private toPlural(word: string): string {
        if (word.endsWith('y') && !this.isVowel(word.charAt(word.length - 2))) {
            return word.slice(0, -1) + 'ies';
        }
        if (word.endsWith('s') || word.endsWith('ch') || word.endsWith('sh') || word.endsWith('x')) {
            return word + 'es';
        }
        return word + 's';
    }

    /**
     * Check if character is a vowel
     */
    private isVowel(char: string): boolean {
        return 'aeiouAEIOU'.includes(char);
    }

    private async generateTestScaffolding(projectPath: string, config: SpringBootProjectConfig, resources: string[]): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        // Generate ApplicationTests
        const className = this.toPascalCase(config.artifactId) + 'ApplicationTests';
        const template = await this.templateProvider.readSpringBootTemplate('ApplicationTests.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className
        });
        const filePath = path.join(projectPath, 'src', 'test', 'java', packagePath, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
        
        // Generate Controller and Service tests for each resource
        for (const resource of resources) {
            await this.generateControllerTest(projectPath, config, resource);
            await this.generateServiceTest(projectPath, config, resource);
        }
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

    private async generateControllerTest(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        const className = entityName + 'ControllerTest';
        
        const template = await this.templateProvider.readSpringBootTemplate('ControllerTest.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            controllerClassName: entityName + 'Controller',
            entityName: entityName,
            resourceName: resource,
            serviceName: entityName + 'Service',
            fields: [
                { name: 'name', type: 'String' },
                { name: 'description', type: 'String' }
            ]
        });

        const testDir = path.join(projectPath, 'src', 'test', 'java', packagePath, 'controller');
        await fs.promises.mkdir(testDir, { recursive: true });
        const filePath = path.join(testDir, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateServiceTest(projectPath: string, config: SpringBootProjectConfig, resource: string): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        const className = entityName + 'ServiceTest';
        
        const template = await this.templateProvider.readSpringBootTemplate('ServiceTest.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            serviceName: entityName + 'Service',
            entityName: entityName,
            resourceName: resource,
            repositoryName: entityName + 'Repository',
            fields: [
                { name: 'name', type: 'String' },
                { name: 'description', type: 'String' }
            ]
        });

        const testDir = path.join(projectPath, 'src', 'test', 'java', packagePath, 'service');
        await fs.promises.mkdir(testDir, { recursive: true });
        const filePath = path.join(testDir, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    // Utility methods
    private extractResourceName(path: string): string {
        if (!path) {
            logger.warn('extractResourceName called with empty path, using default "api"');
            return 'api';
        }
        
        // Remove leading/trailing slashes and split by /
        const parts = path.split('/').filter(p => p && !p.startsWith('{'));
        
        if (parts.length === 0) {
            logger.warn(`No valid path parts found in "${path}", using default "api"`);
            return 'api';
        }
        
        // Skip common prefixes like 'api', 'v1', 'v2', etc.
        const filtered = parts.filter(p => !p.match(/^(api|v\d+)$/i));
        
        // Return the first non-filtered part, or fall back to first part
        const result = filtered[0] || parts[0] || 'api';
        logger.debug(`Extracted resource name from path "${path}": "${result}"`);
        return result;
    }

    private toPascalCase(str: string): string {
        if (!str || typeof str !== 'string' || str.trim() === '') {
            logger.error(`toPascalCase called with invalid input: "${str}"`);
            return '';
        }
        
        // Split by dash, underscore, or space, capitalize each word, join
        const result = str
            .trim()
            .split(/[-_\s]+/)
            .filter(word => word.length > 0)  // Remove empty strings
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
            
        if (!result) {
            logger.error(`toPascalCase produced empty result from input: "${str}"`);
        }
        
        return result;
    }

    private toCamelCase(str: string): string {
        const pascal = this.toPascalCase(str);
        if (!pascal) {
            return '';
        }
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }
}
