/**
 * Standalone Spring Boot code generator script.
 * 
 * Bypasses VS Code by directly calling SpringBootGenerator.generateProject()
 * with a pre-existing OpenAPI spec and Mermaid ERD relationships.
 * 
 * Usage: node scripts/generate-standalone.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Import compiled classes from the extension output
const { SpringBootGenerator } = require('../out/services/springBootGenerator');
const { TemplateProvider } = require('../out/services/templateProvider');

// ============================================================
// CONFIGURATION
// ============================================================
const OPENAPI_PATH = path.resolve('C:\\Users\\chellmu\\.devex\\swift-ods\\openapi\\participant-api.yaml');
const MERMAID_PATH = path.resolve('C:\\Workspace\\github\\mfc_gwam\\crt-ods-participant-api\\docs\\datamodels\\participant.mermaid');
const OUTPUT_DIR = path.resolve('C:\\Workspace\\github\\mfc_gwam\\crt-ods-participant-api');
const EXTENSION_PATH = path.resolve(__dirname, '..');

const PROJECT_CONFIG = {
    targetDirectory: OUTPUT_DIR,
    projectName: 'crttin-participant',
    packageName: 'com.manulife.crttin.ods.participant',
    groupId: 'com.manulife.crttin.ods',
    artifactId: 'crttin-participant',
    javaVersion: '21',
    springBootVersion: '3.4.1',
    buildTool: 'maven'
};

// ============================================================
// MERMAID RELATIONSHIP PARSER
// ============================================================
function parseMermaidRelationships(mermaidContent) {
    const relationships = [];
    const lines = mermaidContent.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'erDiagram' || trimmed.startsWith('{') || trimmed.startsWith('}')) {
            continue;
        }

        // Match relationship lines like:
        // T_CR_ODS_ParticipantStatus ||--o{ T_CR_ODS_ParticipantAccount : ParticipantStatusCode
        const relMatch = trimmed.match(/^(\S+)\s+(\|\|--o\{|\}o--\|\||--\|\{|\|\|--\|\||--o\{|o\{--\|\|)\s+(\S+)\s*:\s*(.+)$/);
        if (relMatch) {
            const [, source, relType, target, label] = relMatch;
            
            // ||--o{ means "one to many" (source is the "one" side, target is the "many" side)
            // So source has OneToMany to target, and target has ManyToOne to source
            let type;
            if (relType === '||--o{' || relType === '}o--||') {
                type = 'OneToMany';
            } else if (relType === '||--||') {
                type = 'OneToOne';
            } else {
                type = 'OneToMany'; // default
            }

            relationships.push({
                sourceEntity: source,
                targetEntity: target,
                type: type,
                label: label.trim()
            });
        }
    }

    return relationships;
}

// ============================================================
// OPENAPI ENDPOINT EXTRACTOR
// ============================================================
function extractEndpoints(openApiSpec) {
    const endpoints = [];
    if (openApiSpec.paths) {
        Object.entries(openApiSpec.paths).forEach(([pathStr, methods]) => {
            Object.entries(methods).forEach(([method, details]) => {
                endpoints.push({
                    path: pathStr,
                    method: method.toUpperCase(),
                    operationId: details.operationId,
                    summary: details.summary,
                    parameters: details.parameters || [],
                    requestBody: details.requestBody,
                    responses: details.responses
                });
            });
        });
    }
    return endpoints;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('=== Standalone Spring Boot Generator ===\n');

    // 1. Validate inputs
    if (!fs.existsSync(OPENAPI_PATH)) {
        console.error(`ERROR: OpenAPI spec not found at: ${OPENAPI_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(MERMAID_PATH)) {
        console.error(`ERROR: Mermaid ERD not found at: ${MERMAID_PATH}`);
        process.exit(1);
    }

    // 2. Parse OpenAPI spec
    console.log(`Reading OpenAPI spec: ${OPENAPI_PATH}`);
    const openApiContent = fs.readFileSync(OPENAPI_PATH, 'utf-8');
    const openApiSpec = yaml.load(openApiContent);
    
    const schemas = openApiSpec.components?.schemas || {};
    const schemaNames = Object.keys(schemas);
    console.log(`Found ${schemaNames.length} schemas: ${schemaNames.join(', ')}`);

    const endpoints = extractEndpoints(openApiSpec);
    console.log(`Found ${endpoints.length} endpoints`);

    // 3. Parse Mermaid relationships
    console.log(`\nReading Mermaid ERD: ${MERMAID_PATH}`);
    const mermaidContent = fs.readFileSync(MERMAID_PATH, 'utf-8');
    const relationships = parseMermaidRelationships(mermaidContent);
    console.log(`Found ${relationships.length} relationships:`);
    relationships.forEach(r => {
        console.log(`  ${r.sourceEntity} --[${r.type}]--> ${r.targetEntity} (${r.label})`);
    });

    // 4. Check if target already has generated code
    const projectDir = path.join(OUTPUT_DIR, PROJECT_CONFIG.projectName);
    if (fs.existsSync(path.join(projectDir, 'pom.xml'))) {
        console.log(`\nWARNING: Project already exists at ${projectDir}`);
        console.log('Removing existing generated project (keeping docs/)...');
        // Remove the generated project folder only
        fs.rmSync(projectDir, { recursive: true, force: true });
    }

    // 5. Instantiate generator
    console.log(`\nExtension path: ${EXTENSION_PATH}`);
    const templateProvider = new TemplateProvider(EXTENSION_PATH);
    const generator = new SpringBootGenerator(templateProvider);

    // 6. Generate!
    console.log(`\nGenerating Spring Boot project...`);
    console.log(`  Target: ${OUTPUT_DIR}`);
    console.log(`  Project: ${PROJECT_CONFIG.projectName}`);
    console.log(`  Package: ${PROJECT_CONFIG.packageName}`);
    console.log(`  Group ID: ${PROJECT_CONFIG.groupId}`);
    console.log(`  Java: ${PROJECT_CONFIG.javaVersion}`);
    console.log(`  Spring Boot: ${PROJECT_CONFIG.springBootVersion}`);
    console.log('');

    await generator.generateProject(
        PROJECT_CONFIG,
        endpoints,
        schemas,
        relationships
    );

    console.log('\n=== Generation complete! ===');
    console.log(`Project at: ${projectDir}`);
    
    // 7. Verify output
    const pomPath = path.join(projectDir, 'pom.xml');
    if (fs.existsSync(pomPath)) {
        console.log('  pom.xml: OK');
    } else {
        console.error('  pom.xml: MISSING!');
    }

    const srcMainJava = path.join(projectDir, 'src', 'main', 'java');
    if (fs.existsSync(srcMainJava)) {
        const javaFiles = findFiles(srcMainJava, '.java');
        console.log(`  Java source files: ${javaFiles.length}`);
    }

    const srcTestJava = path.join(projectDir, 'src', 'test', 'java');
    if (fs.existsSync(srcTestJava)) {
        const testFiles = findFiles(srcTestJava, '.java');
        console.log(`  Java test files: ${testFiles.length}`);
    }
}

function findFiles(dir, ext) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(findFiles(fullPath, ext));
        } else if (entry.name.endsWith(ext)) {
            results.push(fullPath);
        }
    }
    return results;
}

main().catch(err => {
    console.error('Generation failed:', err);
    process.exit(1);
});
