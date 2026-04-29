/**
 * Test script to validate OpenAPI spec generation without full VS Code extension
 */
const path = require('path');
const fs = require('fs');
const SwaggerParser = require('swagger-parser');

// Import compiled TypeScript modules
const { SpringBootGenerator } = require('./out/services/springBootGenerator');
const { TemplateProvider } = require('./out/services/templateProvider');

/**
 * Map OpenAPI type to Java type
 */
function mapOpenAPITypeToJava(fieldSchema, fieldName) {
    if (fieldSchema.$ref) {
        return fieldSchema.$ref.split('/').pop();
    }

    const type = fieldSchema.type;
    const format = fieldSchema.format;

    if (type === 'integer') {
        return format === 'int64' ? 'Long' : 'Integer';
    }
    if (type === 'number') {
        return format === 'double' ? 'Double' : (format === 'float' ? 'Float' : 'BigDecimal');
    }
    if (type === 'boolean') {
        return 'Boolean';
    }
    if (type === 'string') {
        if (format === 'date-time') return 'LocalDateTime';
        if (format === 'date') return 'LocalDate';
        if (format === 'time') return 'LocalTime';
        return 'String';
    }
    if (type === 'array') {
        const itemType = fieldSchema.items ? mapOpenAPITypeToJava(fieldSchema.items, fieldName) : 'Object';
        return `List<${itemType}>`;
    }
    if (type === 'object') {
        if (fieldSchema.additionalProperties) {
            const valueType = fieldSchema.additionalProperties.type === 'string' ? 'String' : 'Object';
            return `Map<String, ${valueType}>`;
        }
        return 'String'; // For JSON storage
    }

    return 'Object';
}

/**
 * Convert to Java field name (camelCase)
 */
function toJavaFieldName(fieldName) {
    const parts = fieldName
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .split(/[-_\s]+/)
        .filter(part => part.length > 0);
    
    if (parts.length === 0) return 'field';
    
    const camelCase = parts
        .map((part, index) => {
            const lower = part.toLowerCase();
            if (index === 0) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
    
    if (/^[0-9]/.test(camelCase)) {
        return 'field' + camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    }
    
    return camelCase;
}

/**
 * Check if field should be skipped
 */
function shouldSkipField(fieldName, entityName) {
    const fieldLower = fieldName.toLowerCase();
    const entityLower = entityName.toLowerCase();

    const systemFields = [
        'id', 'createdat', 'updatedat', 'createddate', 'lastupdatetime',
        'createdby', 'lastupdateby', 'rowversion', 'version'
    ];

    if (systemFields.includes(fieldLower)) return true;
    if (fieldLower === entityLower + 'id') return true;
    
    return false;
}

/**
 * Extract schemas from OpenAPI spec
 */
function extractSchemas(openApiSpec) {
    const schemas = {};
    
    if (!openApiSpec.components?.schemas) {
        return schemas;
    }

    for (const [schemaName, schemaDefinition] of Object.entries(openApiSpec.components.schemas)) {
        const properties = schemaDefinition.properties || {};
        const required = schemaDefinition.required || [];
        const fields = [];

        for (const [fieldName, fieldSchema] of Object.entries(properties)) {
            if (shouldSkipField(fieldName, schemaName)) {
                console.log(`  Skipping system field: ${fieldName} in ${schemaName}`);
                continue;
            }

            const javaType = mapOpenAPITypeToJava(fieldSchema, fieldName);
            const sanitizedFieldName = toJavaFieldName(fieldName);
            
            fields.push({
                name: sanitizedFieldName,
                originalName: fieldName,
                type: javaType,
                required: required.includes(fieldName),
                isString: javaType === 'String',
                isInteger: javaType === 'Integer' || javaType === 'Long',
                isBoolean: javaType === 'Boolean',
                isDate: javaType === 'LocalDateTime' || javaType === 'LocalDate',
                isMap: javaType.startsWith('Map<'),
                isJsonField: fieldSchema.type === 'object' && !fieldSchema.$ref,
                description: fieldSchema.description || ''
            });
        }

        schemas[schemaName] = {
            name: schemaName,
            fields,
            description: schemaDefinition.description || ''
        };
    }

    return schemas;
}

/**
 * Extract endpoints from OpenAPI spec
 */
function extractEndpoints(openApiSpec) {
    const endpoints = [];
    
    if (!openApiSpec.paths) {
        return endpoints;
    }

    for (const [pathStr, pathItem] of Object.entries(openApiSpec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                endpoints.push({
                    path: pathStr,
                    method: method.toUpperCase(),
                    operationId: operation.operationId || `${method}${pathStr.replace(/[^a-zA-Z0-9]/g, '')}`,
                    summary: operation.summary || '',
                    description: operation.description || '',
                    parameters: operation.parameters || [],
                    requestBody: operation.requestBody,
                    responses: operation.responses || {}
                });
            }
        }
    }

    return endpoints;
}

async function testGeneration() {
    console.log('🧪 Testing Spring Boot Generator...\n');

    // Configuration
    const config = {
        projectName: 'test-sales',
        targetDirectory: 'C:\\Workspace\\github\\mfc_gwam',
        packageName: 'com.company.sales',
        groupId: 'com.company',
        artifactId: 'sales',
        version: '1.0.0',
        description: 'Test Sales API',
        javaVersion: '21',
        springBootVersion: '3.4.1',
        buildTool: 'maven',
        database: 'sqlserver'
    };

    const openApiFile = path.join(__dirname, 'examples', 'sales-api.yaml');

    try {
        console.log('📖 Parsing OpenAPI specification...');
        const openApiSpec = await SwaggerParser.validate(openApiFile);
        
        console.log('🔍 Extracting endpoints and schemas...');
        const endpoints = extractEndpoints(openApiSpec);
        const schemas = extractSchemas(openApiSpec);

        console.log(`✅ Found ${endpoints.length} endpoints and ${Object.keys(schemas).length} schemas\n`);

        console.log('🏗️  Generating Spring Boot project...');
        const templateProvider = new TemplateProvider(__dirname, null);
        const generator = new SpringBootGenerator(templateProvider);

        await generator.generateProject(config, endpoints, schemas);

        console.log('✅ Project generated successfully!\n');

        console.log('📦 Project location:', path.join(config.targetDirectory, config.projectName));
        
        return true;
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

// Run the test
testGeneration().then(success => {
    if (success) {
        console.log('\n✅ Test completed successfully!');
        console.log('\n📌 Next: Run Maven compilation');
        console.log('   cd C:\\Workspace\\github\\mfc_gwam\\test-transactions');
        console.log('   mvn clean compile\n');
        process.exit(0);
    } else {
        console.log('\n❌ Test failed!');
        process.exit(1);
    }
}).catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
