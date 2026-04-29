#!/usr/bin/env node

/**
 * Validation script for Language Model Tools registration
 * Ensures all DevEx tools are properly registered with complete metadata
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`  ${message}`, 'bold');
    log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

// Paths to relevant files
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const toolsRegistrationPath = path.join(rootDir, 'src', 'tools', 'devexToolsRegistration.ts');

let errors = [];
let warnings = [];
let successes = [];

/**
 * Step 1: Validate package.json capabilities
 */
function validatePackageJson() {
    logHeader('Step 1: Validating package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        logError('package.json not found');
        errors.push('package.json not found');
        return [];
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check VS Code engine version
    const engineVersion = packageJson.engines?.vscode;
    if (!engineVersion) {
        logError('VS Code engine version not specified');
        errors.push('VS Code engine version not specified');
    } else {
        const minVersion = engineVersion.replace('^', '');
        if (minVersion < '1.85.0') {
            logError(`VS Code engine version ${engineVersion} is below minimum 1.85.0`);
            errors.push('VS Code version too low for Language Model Tools API');
        } else {
            logSuccess(`VS Code engine version: ${engineVersion}`);
            successes.push('VS Code version check');
        }
    }
    
    // Check capabilities.languageModelTools.provides
    const provides = packageJson.capabilities?.languageModelTools?.provides;
    if (!provides || !Array.isArray(provides)) {
        logError('capabilities.languageModelTools.provides is missing or not an array');
        errors.push('Missing languageModelTools.provides in package.json');
        return [];
    }
    
    logSuccess(`Found ${provides.length} tools declared in package.json`);
    successes.push('package.json tools declaration');
    
    return provides;
}

/**
 * Step 2: Extract tool registrations from TypeScript file
 */
function extractToolRegistrations() {
    logHeader('Step 2: Analyzing Tool Registration Code');
    
    if (!fs.existsSync(toolsRegistrationPath)) {
        logError('devexToolsRegistration.ts not found');
        errors.push('Tool registration file not found');
        return { tools: [], subscriptions: [] };
    }
    
    const content = fs.readFileSync(toolsRegistrationPath, 'utf8');
    
    // Extract tool registrations - find the const declarations with registerTool
    const toolRegex = /const\s+(\w+)\s+=\s+vscode\.lm\.registerTool\('([^']+)',\s*\{/g;
    const tools = [];
    let match;
    
    while ((match = toolRegex.exec(content)) !== null) {
        const variableName = match[1];
        const toolName = match[2];
        const startPos = match.index;
        
        // Find the closing of this registration (look for the matching })
        // Extract a reasonable chunk after the match to analyze
        const chunkSize = 2000;
        const chunk = content.substring(startPos, startPos + chunkSize);
        
        // Check for description
        const hasDescription = /description:\s*['"`]/i.test(chunk);
        
        // Check for inputSchema
        const hasInputSchema = /inputSchema:\s*\{/i.test(chunk);
        
        // Check for invoke function
        const hasInvoke = /invoke:\s*async/i.test(chunk);
        
        tools.push({
            variableName,
            toolName,
            hasDescription,
            hasInputSchema,
            hasInvoke
        });
    }
    
    // Extract subscriptions - look for context.subscriptions.push calls
    const subscriptionMatches = content.match(/context\.subscriptions\.push\([^)]+\)/g) || [];
    const subscriptions = [];
    
    // Extract tool variable names from the subscription calls
    subscriptionMatches.forEach(subscriptionCall => {
        // Extract all variable names that end with 'Tool'
        const toolMatches = subscriptionCall.match(/\b(\w+Tool)\b/g);
        if (toolMatches) {
            subscriptions.push(...toolMatches);
        }
    });
    
    // Remove duplicates
    const uniqueSubscriptions = [...new Set(subscriptions)];
    
    logInfo(`Found ${tools.length} tool registrations in code`);
    logInfo(`Found ${uniqueSubscriptions.length} unique tools in context.subscriptions`);
    
    return { tools, subscriptions: uniqueSubscriptions };
}

/**
 * Step 3: Validate each tool registration
 */
function validateToolRegistrations(tools) {
    logHeader('Step 3: Validating Tool Metadata');
    
    let hasErrors = false;
    
    tools.forEach((tool, index) => {
        const toolNum = index + 1;
        log(`\n[${toolNum}/${tools.length}] ${tool.toolName}`, 'cyan');
        
        if (!tool.hasDescription) {
            logError('  Missing description property');
            errors.push(`${tool.toolName}: Missing description`);
            hasErrors = true;
        } else {
            logSuccess('  Has description');
        }
        
        if (!tool.hasInputSchema) {
            logError('  Missing inputSchema property');
            errors.push(`${tool.toolName}: Missing inputSchema`);
            hasErrors = true;
        } else {
            logSuccess('  Has inputSchema');
        }
        
        if (!tool.hasInvoke) {
            logError('  Missing invoke function');
            errors.push(`${tool.toolName}: Missing invoke function`);
            hasErrors = true;
        } else {
            logSuccess('  Has invoke function');
        }
        
        if (!hasErrors) {
            successes.push(tool.toolName);
        }
    });
    
    return tools;
}

/**
 * Step 4: Cross-validate package.json vs code
 */
function crossValidate(declaredTools, registeredTools, subscriptions) {
    logHeader('Step 4: Cross-Validation');
    
    const registeredToolNames = registeredTools.map(t => t.toolName);
    const registeredVariableNames = registeredTools.map(t => t.variableName);
    
    // Check if all declared tools are registered
    log('\n📋 Checking package.json vs code registration:', 'cyan');
    declaredTools.forEach(toolName => {
        if (registeredToolNames.includes(toolName)) {
            logSuccess(`  ${toolName} is registered in code`);
        } else {
            logError(`  ${toolName} declared in package.json but not registered in code`);
            errors.push(`${toolName}: Declared but not registered`);
        }
    });
    
    // Check if all registered tools are declared
    log('\n📋 Checking code registration vs package.json:', 'cyan');
    registeredToolNames.forEach(toolName => {
        if (declaredTools.includes(toolName)) {
            logSuccess(`  ${toolName} is declared in package.json`);
        } else {
            logWarning(`  ${toolName} registered but not declared in package.json`);
            warnings.push(`${toolName}: Registered but not declared`);
        }
    });
    
    // Check if all tools are added to subscriptions
    log('\n📋 Checking context.subscriptions:', 'cyan');
    registeredVariableNames.forEach(varName => {
        if (subscriptions.includes(varName)) {
            logSuccess(`  ${varName} is added to subscriptions`);
        } else {
            logError(`  ${varName} is NOT added to context.subscriptions`);
            errors.push(`${varName}: Not in subscriptions array`);
        }
    });
}

/**
 * Main validation function
 */
function main() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║     DevEx Language Model Tools Registration Validator     ║', 'bold');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    
    // Step 1: Validate package.json
    const declaredTools = validatePackageJson();
    
    // Step 2: Extract tool registrations
    const { tools, subscriptions } = extractToolRegistrations();
    
    // Step 3: Validate each tool
    validateToolRegistrations(tools);
    
    // Step 4: Cross-validate
    if (declaredTools.length > 0 && tools.length > 0) {
        crossValidate(declaredTools, tools, subscriptions);
    }
    
    // Summary
    logHeader('Validation Summary');
    log(`\n✅ Successes: ${successes.length}`, 'green');
    log(`⚠️  Warnings:  ${warnings.length}`, 'yellow');
    log(`❌ Errors:    ${errors.length}`, 'red');
    
    if (warnings.length > 0) {
        log('\n⚠️  Warnings:', 'yellow');
        warnings.forEach(w => log(`   - ${w}`, 'yellow'));
    }
    
    if (errors.length > 0) {
        log('\n❌ Errors:', 'red');
        errors.forEach(e => log(`   - ${e}`, 'red'));
        log('\n💡 Fix these errors to ensure tools are discoverable by AI assistants', 'blue');
        process.exit(1);
    } else {
        log('\n🎉 All validation checks passed!', 'green');
        log('✨ Your DevEx tools are properly registered and ready to use', 'green');
        process.exit(0);
    }
}

// Run validation
main();
