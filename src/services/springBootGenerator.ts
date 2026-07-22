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

Handlebars.registerHelper('startsWith', function(str: any, prefix: any) {
    if (!str || typeof str !== 'string') {
        return false;
    }
    if (!prefix || typeof prefix !== 'string') {
        return false;
    }
    return str.startsWith(prefix);
});

// Helper to join an array with a separator (used in RequestDto for enum pattern generation)
Handlebars.registerHelper('join', function(arr: any, separator: string) {
    if (!Array.isArray(arr)) {
        return '';
    }
    return arr.join(typeof separator === 'string' ? separator : ',');
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

export interface RelationshipInfo {
    sourceEntity: string;
    targetEntity: string;
    type: 'OneToMany' | 'ManyToOne' | 'OneToOne' | 'ManyToMany';
    label: string;
}

export class SpringBootGenerator {
    private templateProvider: TemplateProvider;
    private entityNames: Set<string> = new Set<string>();
    /** Maps lowercase Mermaid entity names to the actual resource strings used by the generator */
    private resourceNameMap: Map<string, string> = new Map();

    constructor(templateProvider: TemplateProvider) {
        this.templateProvider = templateProvider;
    }

    async generateProject(
        config: SpringBootProjectConfig, 
        openApiEndpoints: OpenAPIEndpoint[],
        schemas: Record<string, any> = {},
        relationships: RelationshipInfo[] = []
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
            const resources = await this.generateControllersFromOpenAPI(projectPath, config, openApiEndpoints, schemas, relationships);

            // Store entity names for import resolution
            this.entityNames = new Set(resources.map(r => this.toPascalCase(r)));
            logger.info(`Tracked ${this.entityNames.size} entities for import resolution: ${Array.from(this.entityNames).join(', ')}`);

            // Generate OData support classes (shared across all resources)
            logger.info('Generating OData support classes...');
            await this.generateODataClasses(projectPath, config);

            // Generate all remaining schemas as DTOs (nested types that aren't resources)
            logger.info('Generating remaining schema DTOs...');
            await this.generateRemainingSchemas(projectPath, config, resources, schemas);

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
            await this.generateTestScaffolding(projectPath, config, resources, schemas);

            // Generate README
            logger.info('Generating README...');
            await this.generateReadme(projectPath, config);

            // Generate .gitignore
            logger.info('Generating .gitignore...');
            await this.generateGitignore(projectPath);

            // Generate lombok.config for JaCoCo coverage exclusion
            logger.info('Generating lombok.config...');
            await this.generateLombokConfig(projectPath);

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
            path.join(projectPath, 'src', 'main', 'java', packagePath, 'odata'),
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
        schemas: Record<string, any>,
        relationships: RelationshipInfo[] = []
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

        // Build resource-name map: maps lowercase Mermaid entity names to resource strings
        // e.g., "partyrole" -> "party-roles", "party" -> "parties"
        this.resourceNameMap.clear();
        for (const resource of Object.keys(resourceEndpoints)) {
            const singular = this.toSingular(resource.toLowerCase().replace(/-/g, ''));
            this.resourceNameMap.set(singular, resource);
            // Also map the resource itself (lowercased, no dashes)
            const resourceNoDash = resource.toLowerCase().replace(/-/g, '');
            if (resourceNoDash !== singular) {
                this.resourceNameMap.set(resourceNoDash, resource);
            }
        }
        logger.info(`Resource name map: ${JSON.stringify(Object.fromEntries(this.resourceNameMap))}`);

        // Build relationship lookups per entity
        const entityRelationships: Record<string, {
            manyToOne: RelationshipInfo[];
            oneToMany: RelationshipInfo[];
        }> = {};

        for (const rel of relationships) {
            const source = this.toPascalCase(rel.sourceEntity);
            if (!entityRelationships[source]) {
                entityRelationships[source] = { manyToOne: [], oneToMany: [] };
            }
            if (rel.type === 'ManyToOne') {
                entityRelationships[source].manyToOne.push(rel);
            } else if (rel.type === 'OneToMany') {
                entityRelationships[source].oneToMany.push(rel);
            }
        }

        // Generate controller for each resource
        const resources = Object.keys(resourceEndpoints);
        for (const [resource, resourceEndpointsList] of Object.entries(resourceEndpoints)) {
            const entityName = this.toPascalCase(resource);
            // Try plural form first, then singular (Mermaid uses singular like "Party", 
            // but OpenAPI resources are plural like "parties" -> "Parties")
            const singularName = this.toPascalCase(this.toSingular(resource.toLowerCase()));
            const rels = entityRelationships[entityName] 
                || entityRelationships[singularName] 
                || { manyToOne: [], oneToMany: [] };
            
            if (rels.manyToOne.length > 0 || rels.oneToMany.length > 0) {
                logger.info(`Found ${rels.manyToOne.length} ManyToOne and ${rels.oneToMany.length} OneToMany relationships for ${entityName} (matched as ${singularName})`);
            }

            await this.generateController(projectPath, config, resource, resourceEndpointsList, rels);
            await this.generateService(projectPath, config, resource, rels);
            await this.generateRepository(projectPath, config, resource, rels);
            await this.generateMapper(projectPath, config, resource);
            
            // Find matching schema for this resource
            const resourceSchema = this.findSchemaForResource(resource, schemas);
            await this.generateModelClasses(projectPath, config, resource, resourceSchema, rels);
        }
        
        return resources;
    }

    /**
     * Generates the shared OData v4 support classes in the odata/ package.
     * These are entity-agnostic utility classes used by all controllers and services.
     * 
     * Generated classes:
     * - ODataQueryOptions: Parsed query options POJO with toPageable() conversion
     * - ODataQueryParser: @Component that parses raw request params into ODataQueryOptions
     * - ODataSpecificationBuilder: Translates OData $filter into JPA Specifications
     * - ODataResponse: Generic OData v4 response envelope
     */
    private async generateODataClasses(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const odataDir = path.join(projectPath, 'src', 'main', 'java', packagePath, 'odata');
        await fs.promises.mkdir(odataDir, { recursive: true });

        const odataTemplates = [
            'ODataQueryOptions.java.template',
            'ODataQueryParser.java.template',
            'ODataSpecificationBuilder.java.template',
            'ODataResponse.java.template',
            'ODataEdmProvider.java.template',
            'ODataMetadataController.java.template'
        ];

        const context = {
            packageName: config.packageName
        };

        for (const templateName of odataTemplates) {
            const template = await this.templateProvider.readSpringBootTemplate(templateName);
            const compiled = Handlebars.compile(template);
            const content = compiled(context);
            const fileName = templateName.replace('.template', '');
            const filePath = path.join(odataDir, fileName);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            logger.info(`Generated OData class: ${fileName}`);
        }
    }

    /**
     * Generate DTO classes for schemas that aren't resources (nested/referenced types)
     * Examples: CategorySummary, Address, TagSummary, Location
     */
    private async generateRemainingSchemas(
        projectPath: string,
        config: SpringBootProjectConfig,
        resources: string[],
        schemas: Record<string, any>
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const dtoDir = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto');
        await fs.promises.mkdir(dtoDir, { recursive: true });

        // Convert resources to PascalCase for comparison
        const resourceSchemas = new Set<string>();
        const generatedSchemas = new Set<string>();
        
        for (const resource of resources) {
            const entityName = this.toPascalCase(resource);
            // Track all schemas that could match this resource (case-insensitive)
            for (const schemaName of Object.keys(schemas)) {
                const schemaLower = schemaName.toLowerCase();
                const resourceLower = resource.toLowerCase();
                const singular = this.toSingular(resourceLower);
                const plural = this.toPlural(resourceLower);
                if (schemaLower === resourceLower || schemaLower === singular || schemaLower === plural) {
                    generatedSchemas.add(schemaName);
                }
            }
            // Also track the Request/Response DTOs we generated
            generatedSchemas.add(entityName + 'Request');
            generatedSchemas.add(entityName + 'Response');
        }

        // Generate DTOs for schemas not already generated as resources
        for (const [schemaName, schema] of Object.entries(schemas)) {
            if (generatedSchemas.has(schemaName)) {
                logger.info(`Skipping ${schemaName} - already generated as resource or DTO`);
                continue;
            }

            // Skip OData envelope schemas - these are handled by dedicated OData templates in odata/ package
            const odataSchemaPatterns = [
                /^odata/i,                    // ODataCollectionResponse, ODataResponse, etc.
                /odata.*response/i,           // *ODataResponse, *ODataCollectionResponse
                /odata.*envelope/i,           // ODataEnvelope
                /collection.*response/i       // CollectionResponse (generic envelope)
            ];
            
            const isODataSchema = odataSchemaPatterns.some(pattern => pattern.test(schemaName));
            if (isODataSchema) {
                logger.info(`Skipping ${schemaName} - OData envelope schema, handled by dedicated OData templates`);
                continue;
            }

            // Skip schemas whose properties are all invalid Java identifiers (e.g., @odata.* fields)
            const schemaFields = this.convertOpenAPISchemaToFields(schema);
            if (schemaFields.length === 0 && schema.properties && Object.keys(schema.properties).length > 0) {
                logger.info(`Skipping ${schemaName} - all fields have invalid Java identifiers`);
                continue;
            }

            // Skip Spring Framework and Java standard classes that should be imported, not generated
            const springFrameworkClasses = [
                'FieldError',           // org.springframework.validation.FieldError
                'BindingResult',        // org.springframework.validation.BindingResult
                'Errors',               // org.springframework.validation.Errors
                'MultipartFile',        // org.springframework.web.multipart.MultipartFile
                'HttpServletRequest',   // jakarta.servlet.http.HttpServletRequest
                'HttpServletResponse',  // jakarta.servlet.http.HttpServletResponse
                'Principal',            // java.security.Principal
                'Authentication'        // org.springframework.security.core.Authentication
            ];
            
            if (springFrameworkClasses.includes(schemaName)) {
                logger.info(`Skipping ${schemaName} - Spring Framework class, should be imported not generated`);
                continue;
            }

            // Generate all other schemas (including error schemas, summary schemas, etc.)
            logger.info(`Generating DTO for schema: ${schemaName}`);
            await this.generateSchemaDTO(projectPath, config, schemaName, schema);
        }
    }

    /**
     * Generate a simple DTO class for a schema
     */
    private async generateSchemaDTO(
        projectPath: string,
        config: SpringBootProjectConfig,
        schemaName: string,
        schema: any
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        
        // Convert OpenAPI properties to fields array if needed
        const fields = this.convertOpenAPISchemaToFields(schema);
        
        if (fields.length === 0) {
            logger.warn(`Skipping DTO generation for ${schemaName} - no fields found`);
            return;
        }
        
        // Use the centralized import calculation
        const imports = this.calculateImports(fields, config.packageName, Array.from(this.entityNames));
        
        // Generate simple DTO class
        const dtoTemplate = await this.templateProvider.readSpringBootTemplate('Dto.java.template');
        const dtoCompiled = Handlebars.compile(dtoTemplate);
        const dtoContent = dtoCompiled({
            packageName: config.packageName,
            className: schemaName,
            fields: fields,
            description: schema.description || `${schemaName} data transfer object`,
            imports: imports.join('\n')
        });
        
        const dtoPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto', `${schemaName}.java`);
        await fs.promises.writeFile(dtoPath, dtoContent, 'utf-8');
    }

    private async generateController(
        projectPath: string,
        config: SpringBootProjectConfig,
        resource: string,
        endpoints: OpenAPIEndpoint[],
        rels: { manyToOne: RelationshipInfo[]; oneToMany: RelationshipInfo[] } = { manyToOne: [], oneToMany: [] }
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Controller';
        const entityName = this.toPascalCase(resource);
        
        // Build child endpoints, deduplicated by resolved service name
        const seenChildServices = new Set<string>();
        const childEndpoints = rels.oneToMany
            .map(r => {
                const resolvedName = this.resolveEntityToClassName(r.targetEntity);
                return {
                    childResourceName: this.toKebabCase(r.targetEntity) + 's',
                    childEntityName: resolvedName,
                    childServiceName: resolvedName + 'Service'
                };
            })
            .filter(ep => {
                if (seenChildServices.has(ep.childServiceName)) {
                    return false;
                }
                seenChildServices.add(ep.childServiceName);
                return true;
            });

        const template = await this.templateProvider.readSpringBootTemplate('Controller.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: entityName,
            resourceName: resource,
            serviceName: entityName + 'Service',
            childEndpoints: childEndpoints.length > 0 ? childEndpoints : undefined,
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

    private async generateService(
        projectPath: string, 
        config: SpringBootProjectConfig, 
        resource: string,
        rels: { manyToOne: RelationshipInfo[]; oneToMany: RelationshipInfo[] } = { manyToOne: [], oneToMany: [] }
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Service';
        const entityName = this.toPascalCase(resource);
        
        const parentRelationships = rels.manyToOne.map(r => ({
            parentEntity: this.resolveEntityToClassName(r.targetEntity),
            parentFieldName: this.resolveEntityToClassName(r.targetEntity)
        }));

        const template = await this.templateProvider.readSpringBootTemplate('Service.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: entityName,
            resourceName: resource,
            repositoryName: entityName + 'Repository',
            parentRelationships: parentRelationships.length > 0 ? parentRelationships : undefined
        });

        const filePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'service', `${className}.java`);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateRepository(
        projectPath: string, 
        config: SpringBootProjectConfig, 
        resource: string,
        rels: { manyToOne: RelationshipInfo[]; oneToMany: RelationshipInfo[] } = { manyToOne: [], oneToMany: [] }
    ): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const className = this.toPascalCase(resource) + 'Repository';
        
        const parentRelationships = rels.manyToOne.map(r => ({
            parentEntity: this.resolveEntityToClassName(r.targetEntity),
            parentFieldName: this.resolveEntityToClassName(r.targetEntity)
        }));

        const template = await this.templateProvider.readSpringBootTemplate('Repository.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            entityName: this.toPascalCase(resource),
            resourceName: resource,
            parentRelationships: parentRelationships.length > 0 ? parentRelationships : undefined
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
        schema?: any,
        rels: { manyToOne: RelationshipInfo[]; oneToMany: RelationshipInfo[] } = { manyToOne: [], oneToMany: [] }
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
        
        // Enrich fields with relationship annotations
        const entityFields = this.enrichFieldsWithRelationships(fields, entityName, rels);

        // Calculate needed imports based on field types
        const entityImports = this.calculateImports(entityFields, config.packageName, Array.from(this.entityNames));
        const imports = this.calculateImports(fields, config.packageName, Array.from(this.entityNames));
        
        // Generate Entity
        const entityTemplate = await this.templateProvider.readSpringBootTemplate('Entity.java.template');
        const entityCompiled = Handlebars.compile(entityTemplate);
        const entityContent = entityCompiled({
            packageName: config.packageName,
            className: entityName,
            tableName: resource.toLowerCase(),
            resourceName: resource,
            fields: entityFields,
            entityName: entityName,
            imports: entityImports.join('\n')
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
            fields,
            imports: imports.join('\n')
        });
        const requestPath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto', `${entityName}Request.java`);
        await fs.promises.mkdir(path.dirname(requestPath), { recursive: true });
        await fs.promises.writeFile(requestPath, requestContent, 'utf-8');
        
        // Build child collections for aggregate root response DTO (deduplicated)
        const seenCollections = new Set<string>();
        const childCollections = rels.oneToMany
            .map(r => {
                const resolvedName = this.resolveEntityToClassName(r.targetEntity);
                return {
                    entityName: resolvedName,
                    dtoType: resolvedName + 'Response',
                    fieldName: this.toCamelCase(resolvedName) + 's'
                };
            })
            .filter(c => {
                if (seenCollections.has(c.entityName)) {
                    return false;
                }
                seenCollections.add(c.entityName);
                return true;
            });

        // Calculate response imports (may need java.util.List for child collections)
        const responseImports = this.calculateImports(fields, config.packageName, Array.from(this.entityNames));
        if (childCollections.length > 0 && !responseImports.some(i => i.includes('java.util.List'))) {
            responseImports.push('import java.util.List;');
        }

        // Generate Response DTO
        const responseTemplate = await this.templateProvider.readSpringBootTemplate('ResponseDto.java.template');
        const responseCompiled = Handlebars.compile(responseTemplate);
        const responseContent = responseCompiled({
            packageName: config.packageName,
            className: entityName + 'Response',
            resourceName: resource,
            fields,
            childCollections: childCollections.length > 0 ? childCollections : undefined,
            imports: responseImports.join('\n')
        });
        const responsePath = path.join(projectPath, 'src', 'main', 'java', packagePath, 'dto', `${entityName}Response.java`);
        await fs.promises.mkdir(path.dirname(responsePath), { recursive: true });
        await fs.promises.writeFile(responsePath, responseContent, 'utf-8');
    }

    /**
     * Calculate which imports are needed based on field types
     * @param fields - Field definitions with types
     * @param packageName - Base package name
     * @param entityNames - List of entity class names (imported from entity package)
     */
    private calculateImports(fields: any[], packageName: string, entityNames: string[] = []): string[] {
        const imports: string[] = [];
        const customTypes = new Set<string>();
        const entitySet = new Set(entityNames);
        
        // Standard library imports
        const needsListImport = fields.some((f: any) => f.type.includes('List<'));
        const needsSetImport = fields.some((f: any) => f.type.includes('Set<'));
        const needsMapImport = fields.some((f: any) => f.type.includes('Map<'));
        
        if (needsListImport) {
            imports.push('import java.util.List;');
        }
        if (needsSetImport) {
            imports.push('import java.util.Set;');
        }
        if (needsMapImport) {
            imports.push('import java.util.Map;');
        }
        
        // Date/time imports - fixed LocalDateTime detection
        const needsLocalDateTime = fields.some((f: any) => f.type.includes('LocalDateTime'));
        const needsLocalDate = fields.some((f: any) => f.type.includes('LocalDate') && !f.type.includes('LocalDateTime'));
        const needsLocalTime = fields.some((f: any) => f.type.includes('LocalTime'));
        const needsBigDecimal = fields.some((f: any) => f.type.includes('BigDecimal'));
        
        if (needsLocalDateTime) {
            imports.push('import java.time.LocalDateTime;');
        }
        if (needsLocalDate) {
            imports.push('import java.time.LocalDate;');
        }
        if (needsLocalTime) {
            imports.push('import java.time.LocalTime;');
        }
        if (needsBigDecimal) {
            imports.push('import java.math.BigDecimal;');
        }
        
        // Extract custom DTO types from field types
        const javaBaseTypes = new Set(['String', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'BigDecimal', 'LocalDateTime', 'LocalDate', 'LocalTime', 'Object']);
        
        // Map of Spring Framework and Java standard classes to their import paths
        const springFrameworkImports: Record<string, string> = {
            'FieldError': 'import org.springframework.validation.FieldError;',
            'BindingResult': 'import org.springframework.validation.BindingResult;',
            'Errors': 'import org.springframework.validation.Errors;',
            'MultipartFile': 'import org.springframework.web.multipart.MultipartFile;',
            'HttpServletRequest': 'import jakarta.servlet.http.HttpServletRequest;',
            'HttpServletResponse': 'import jakarta.servlet.http.HttpServletResponse;',
            'Principal': 'import java.security.Principal;',
            'Authentication': 'import org.springframework.security.core.Authentication;'
        };
        
        for (const field of fields) {
            const extractedTypes = this.extractCustomTypes(field.type);
            extractedTypes.forEach(type => {
                // Skip Java base types
                if (javaBaseTypes.has(type)) {
                    return;
                }
                
                // Check if it's a Spring Framework class
                if (springFrameworkImports[type]) {
                    // Add Spring Framework import
                    if (!imports.includes(springFrameworkImports[type])) {
                        imports.push(springFrameworkImports[type]);
                    }
                } else if (entitySet.has(type)) {
                    // It's an entity class - import from entity package
                    customTypes.add(`entity:${type}`);
                } else {
                    // It's a DTO class - import from dto package
                    customTypes.add(`dto:${type}`);
                }
            });
        }
        
        // Add imports for custom types (entities and DTOs)
        for (const customType of Array.from(customTypes).sort()) {
            if (customType.startsWith('entity:')) {
                const typeName = customType.substring(7);
                imports.push(`import ${packageName}.entity.${typeName};`);
                logger.info(`Adding entity import: ${packageName}.entity.${typeName}`);
            } else if (customType.startsWith('dto:')) {
                const typeName = customType.substring(4);
                imports.push(`import ${packageName}.dto.${typeName};`);
            }
        }
        
        return imports;
    }

    /**
     * Extract custom type names from a Java type string
     * Examples:
     *   "CategorySummary" -> ["CategorySummary"]
     *   "List<CategorySummary>" -> ["CategorySummary"]
     *   "Map<String, TagSummary>" -> ["TagSummary"]
     *   "List<List<Address>>" -> ["Address"]
     */
    private extractCustomTypes(typeString: string): string[] {
        const types: string[] = [];
        
        // Remove collection wrappers and extract inner types
        // Match anything that looks like a type name (PascalCase identifier)
        const typePattern = /\b[A-Z][a-zA-Z0-9]*\b/g;
        const matches = typeString.match(typePattern);
        
        if (matches) {
            // Filter out collection type names
            const collectionTypes = new Set(['List', 'Set', 'Map', 'Optional', 'Collection']);
            for (const match of matches) {
                if (!collectionTypes.has(match)) {
                    types.push(match);
                }
            }
        }
        
        return types;
    }

    /**
     * Convert raw OpenAPI schema properties into our internal fields array format.
     * Handles the OpenAPI format: { type: 'object', properties: { fieldName: { type: '...', format: '...' } }, required: [...] }
     * Converts to: [{ name, type, required, isString }]
     */
    private convertOpenAPISchemaToFields(schema: any): any[] {
        if (!schema) {
            return [];
        }

        // If already in our format (has fields array), return as-is
        if (schema.fields && Array.isArray(schema.fields)) {
            return schema.fields;
        }

        // If no properties, return empty
        if (!schema.properties || typeof schema.properties !== 'object') {
            return [];
        }

        const requiredFields = new Set(schema.required || []);
        const fields: any[] = [];

        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            // Skip fields with names that are not valid Java identifiers
            // (e.g., @odata.context, @odata.count, @odata.nextLink)
            if (!this.isValidJavaIdentifier(propName)) {
                logger.warn(`Skipping field "${propName}" - not a valid Java identifier`);
                continue;
            }
            const prop = propSchema as any;
            const javaType = this.openAPITypeToJava(prop);
            fields.push({
                name: propName,
                type: javaType,
                required: requiredFields.has(propName),
                isString: javaType === 'String',
                maxLength: prop.maxLength ?? null,
                minLength: prop.minLength ?? null,
                pattern: prop.pattern ?? null,
                minimum: prop.minimum ?? null,
                maximum: prop.maximum ?? null,
                enumValues: Array.isArray(prop.enum) ? prop.enum : null,
                isEmail: prop.format === 'email',
                isPositive: prop.minimum !== undefined && prop.minimum > 0 && prop.exclusiveMinimum === true
            });
        }

        return fields;
    }

    /**
     * Check if a string is a valid Java identifier.
     * Must start with a letter, underscore, or dollar sign, followed by letters, digits, underscores, or dollar signs.
     */
    private isValidJavaIdentifier(name: string): boolean {
        if (!name || name.length === 0) {
            return false;
        }
        return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
    }

    /**
     * Map OpenAPI type/format to Java type
     */
    private openAPITypeToJava(prop: any): string {
        if (!prop) {
            return 'String';
        }

        // Handle $ref
        if (prop.$ref) {
            const refParts = prop.$ref.split('/');
            return refParts[refParts.length - 1];
        }

        // Handle arrays
        if (prop.type === 'array' && prop.items) {
            const itemType = this.openAPITypeToJava(prop.items);
            return `List<${itemType}>`;
        }

        // Handle type + format combinations
        switch (prop.type) {
            case 'integer':
                return prop.format === 'int64' ? 'Long' : 'Integer';
            case 'number':
                return prop.format === 'double' ? 'Double' : 'BigDecimal';
            case 'boolean':
                return 'Boolean';
            case 'string':
                if (prop.format === 'date-time') {
                    return 'LocalDateTime';
                }
                if (prop.format === 'date') {
                    return 'LocalDate';
                }
                if (prop.format === 'time') {
                    return 'LocalTime';
                }
                return 'String';
            case 'object':
                // If it has additionalProperties, use Map
                if (prop.additionalProperties) {
                    const valueType = this.openAPITypeToJava(prop.additionalProperties);
                    return `Map<String, ${valueType}>`;
                }
                return 'Object';
            default:
                return 'String';
        }
    }

    /**
     * Find matching schema for a resource name
     * Tries to match by singular/plural forms
     * Returns normalized schema with fields array
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
                return this.normalizeSchema(schemaName, schema);
            }
        }

        // Try PascalCase match
        if (schemas[resourcePascal]) {
            logger.info(`Found PascalCase schema match: ${resourcePascal} for resource ${resource}`);
            return this.normalizeSchema(resourcePascal, schemas[resourcePascal]);
        }

        // Try singular/plural variations
        const singular = this.toSingular(resourceLower);
        const plural = this.toPlural(resourceLower);

        for (const [schemaName, schema] of Object.entries(schemas)) {
            const schemaLower = schemaName.toLowerCase();
            if (schemaLower === singular || schemaLower === plural) {
                logger.info(`Found singular/plural schema match: ${schemaName} for resource ${resource}`);
                return this.normalizeSchema(schemaName, schema);
            }
        }

        logger.warn(`No schema found for resource: ${resource}`);
        return undefined;
    }

    /**
     * Normalize a schema to ensure it has a name and fields array
     */
    private normalizeSchema(name: string, schema: any): any {
        const fields = this.convertOpenAPISchemaToFields(schema);
        return {
            ...schema,
            name,
            fields: fields.length > 0 ? fields : undefined,
            description: schema.description || `${name} schema`
        };
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

    private async generateTestScaffolding(projectPath: string, config: SpringBootProjectConfig, resources: string[], schemas: Record<string, any>): Promise<void> {
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
        
        // Generate OData test classes (package-level, one per project)
        await this.generateODataTests(projectPath, config);

        // Generate Controller and Service tests for each resource
        for (const resource of resources) {
            const schema = this.findSchemaForResource(resource, schemas);
            await this.generateControllerTest(projectPath, config, resource, schema);
            await this.generateServiceTest(projectPath, config, resource, schema);
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

    private async generateLombokConfig(projectPath: string): Promise<void> {
        try {
            const template = await this.templateProvider.readSpringBootTemplate('lombok.config.template');
            await fs.promises.writeFile(path.join(projectPath, 'lombok.config'), template, 'utf-8');
            logger.info('Generated lombok.config for JaCoCo coverage exclusion');
        } catch (error: any) {
            // Non-critical - project works without it, just coverage numbers include Lombok code
            logger.warn(`Could not generate lombok.config: ${error.message}`);
        }
    }

    /**
     * Generates OData unit test classes in the test odata package.
     * These are package-level tests (one per project, not per entity):
     * - ODataQueryParserTest: Tests parsing of raw query params into ODataQueryOptions
     * - ODataSpecificationBuilderTest: Tests translation of $filter into JPA Specifications
     */
    private async generateODataTests(projectPath: string, config: SpringBootProjectConfig): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const odataTestDir = path.join(projectPath, 'src', 'test', 'java', packagePath, 'odata');
        await fs.promises.mkdir(odataTestDir, { recursive: true });

        const odataTestTemplates = [
            'ODataQueryParserTest.java.template',
            'ODataSpecificationBuilderTest.java.template'
        ];

        const context = {
            packageName: config.packageName
        };

        for (const templateName of odataTestTemplates) {
            try {
                const template = await this.templateProvider.readSpringBootTemplate(templateName);
                const compiled = Handlebars.compile(template);
                const content = compiled(context);
                const fileName = templateName.replace('.template', '');
                const filePath = path.join(odataTestDir, fileName);
                await fs.promises.writeFile(filePath, content, 'utf-8');
                logger.info(`Generated OData test: ${fileName}`);
            } catch (error: any) {
                // Non-critical - tests are nice-to-have, don't fail the whole generation
                logger.warn(`Could not generate OData test ${templateName}: ${error.message}`);
            }
        }
    }

    private async generateControllerTest(projectPath: string, config: SpringBootProjectConfig, resource: string, schema?: any): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        const className = entityName + 'ControllerTest';
        
        // Use actual schema fields, or fallback to default
        let fields = [
            { name: 'name', type: 'String' },
            { name: 'description', type: 'String' }
        ];
        if (schema && schema.fields && schema.fields.length > 0) {
            // Use all non-ID, non-system fields from schema
            fields = schema.fields.filter((f: any) => {
                const fieldName = f.name.toLowerCase();
                // Exclude ID and timestamp fields (usually readOnly/system fields)
                return fieldName !== 'id' && 
                       fieldName !== 'createdat' && 
                       fieldName !== 'updatedat';
            });
            if (fields.length === 0) {
                fields = [{ name: 'name', type: 'String' }, { name: 'description', type: 'String' }];
            }
        }
        
        const template = await this.templateProvider.readSpringBootTemplate('ControllerTest.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            controllerClassName: entityName + 'Controller',
            entityName: entityName,
            resourceName: resource,
            serviceName: entityName + 'Service',
            fields
        });

        const testDir = path.join(projectPath, 'src', 'test', 'java', packagePath, 'controller');
        await fs.promises.mkdir(testDir, { recursive: true });
        const filePath = path.join(testDir, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    private async generateServiceTest(projectPath: string, config: SpringBootProjectConfig, resource: string, schema?: any): Promise<void> {
        const packagePath = config.packageName.replace(/\./g, '/');
        const entityName = this.toPascalCase(resource);
        const className = entityName + 'ServiceTest';
        
        // Use actual schema fields, or fallback to default
        let fields = [
            { name: 'name', type: 'String' },
            { name: 'description', type: 'String' }
        ];
        if (schema && schema.fields && schema.fields.length > 0) {
            // Use all non-ID, non-system fields from schema
            fields = schema.fields.filter((f: any) => {
                const fieldName = f.name.toLowerCase();
                return fieldName !== 'id' && 
                       fieldName !== 'createdat' && 
                       fieldName !== 'updatedat';
            });
            if (fields.length === 0) {
                fields = [{ name: 'name', type: 'String' }, { name: 'description', type: 'String' }];
            }
        }
        
        const template = await this.templateProvider.readSpringBootTemplate('ServiceTest.java.template');
        const compiled = Handlebars.compile(template);
        const content = compiled({
            packageName: config.packageName,
            className,
            serviceName: entityName + 'Service',
            entityName: entityName,
            resourceName: resource,
            repositoryName: entityName + 'Repository',
            fields
        });

        const testDir = path.join(projectPath, 'src', 'test', 'java', packagePath, 'service');
        await fs.promises.mkdir(testDir, { recursive: true });
        const filePath = path.join(testDir, `${className}.java`);
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    // Utility methods

    /**
     * Resolves a Mermaid entity name (e.g., "PartyRole") to the actual generated class name
     * (e.g., "PartyRoles") by looking up the resource name map.
     * 
     * The problem: toPascalCase("PartyRole") → "Partyrole" (no delimiters, treated as one word).
     * But the actual generated class uses the resource name from the URL path:
     * "party-roles" → toPascalCase("party-roles") → "PartyRoles".
     * 
     * This method bridges that gap by mapping the Mermaid entity name to the resource-based class name.
     */
    private resolveEntityToClassName(mermaidEntityName: string): string {
        // Lowercase and remove any non-alpha characters for lookup
        const lookupKey = mermaidEntityName.toLowerCase().replace(/[-_\s]/g, '');
        const resource = this.resourceNameMap.get(lookupKey);
        if (resource) {
            const resolved = this.toPascalCase(resource);
            if (resolved !== this.toPascalCase(mermaidEntityName)) {
                logger.info(`Resolved Mermaid entity "${mermaidEntityName}" → class "${resolved}" (via resource "${resource}")`);
            }
            return resolved;
        }
        // Fallback: return as-is (already PascalCase from Mermaid)
        logger.debug(`No resource mapping for "${mermaidEntityName}", using as-is`);
        return mermaidEntityName;
    }

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

    private toSnakeCase(value: string): string {
        return value
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[- ]+/g, '_')
            .toLowerCase();
    }

    private toKebabCase(value: string): string {
        return value
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/[_ ]+/g, '-')
            .toLowerCase();
    }

    /**
     * Enrich fields with JPA relationship metadata.
     * - ManyToOne: converts FK fields to entity references with @ManyToOne annotation data
     * - OneToMany: adds collection fields with @OneToMany annotation data
     */
    private enrichFieldsWithRelationships(
        fields: any[],
        entityName: string,
        rels: { manyToOne: RelationshipInfo[]; oneToMany: RelationshipInfo[] }
    ): any[] {
        if (rels.manyToOne.length === 0 && rels.oneToMany.length === 0) {
            return fields;  // No relationships, return as-is for backward compatibility
        }

        const enriched = fields.map(field => {
            // Check if this field is a FK reference field
            const matchingManyToOne = rels.manyToOne.find(r => {
                const targetLower = r.targetEntity.toLowerCase();
                const fieldLower = field.name.toLowerCase();
                return fieldLower === targetLower + '_id'
                    || fieldLower === targetLower + 'id'
                    || fieldLower === targetLower;
            });

            if (matchingManyToOne) {
                const relatedEntity = this.resolveEntityToClassName(matchingManyToOne.targetEntity);
                return {
                    ...field,
                    isManyToOne: true,
                    relatedEntity: relatedEntity,
                    columnName: field.name.includes('_') ? field.name : this.toSnakeCase(field.name),
                    name: this.toCamelCase(relatedEntity),
                    type: relatedEntity
                };
            }
            return field;
        });

        // Add OneToMany collection fields (deduplicated by resolved entity name)
        const addedOneToMany = new Set<string>();
        for (const oneToMany of rels.oneToMany) {
            const childEntity = this.resolveEntityToClassName(oneToMany.targetEntity);
            const fieldName = this.toCamelCase(childEntity) + 's';
            
            // Don't add if already present (handles duplicate FKs to same entity)
            if (!addedOneToMany.has(childEntity) && !enriched.some(f => f.name === fieldName)) {
                addedOneToMany.add(childEntity);
                enriched.push({
                    name: fieldName,
                    type: `List<${childEntity}>`,
                    isOneToMany: true,
                    relatedEntity: childEntity,
                    mappedBy: this.toCamelCase(entityName),
                    required: false,
                    isString: false
                });
            }
        }

        return enriched;
    }
}
