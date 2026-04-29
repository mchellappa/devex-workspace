const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

// Register Handlebars helpers
Handlebars.registerHelper('camelCase', (str) => {
    if (!str) return '';
    return str.charAt(0).toLowerCase() + str.slice(1);
});

Handlebars.registerHelper('pascalCase', (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('eq', (a, b) => a === b);

// Validation scenarios
const testScenarios = [
    {
        name: 'User Service Test',
        entity: 'User',
        template: 'ServiceTest.java.template',
        data: {
            packageName: 'com.example.demo',
            className: 'UserServiceTest',
            serviceName: 'UserService',
            entityName: 'User',
            resourceName: 'users',
            repositoryName: 'UserRepository',
            fields: [
                { name: 'name', type: 'String' },
                { name: 'email', type: 'String' }
            ]
        }
    },
    {
        name: 'User Controller Test',
        entity: 'User',
        template: 'ControllerTest.java.template',
        data: {
            packageName: 'com.example.demo',
            className: 'UserControllerTest',
            controllerClassName: 'UserController',
            serviceName: 'UserService',
            entityName: 'User',
            resourceName: 'users',
            fields: [
                { name: 'name', type: 'String' },
                { name: 'email', type: 'String' }
            ]
        }
    },
    {
        name: 'ProposalStatusTypeMappings Service Test',
        entity: 'ProposalStatusTypeMappings',
        template: 'ServiceTest.java.template',
        data: {
            packageName: 'com.swift.ods',
            className: 'ProposalStatusTypeMappingsServiceTest',
            serviceName: 'ProposalStatusTypeMappingsService',
            entityName: 'ProposalStatusTypeMappings',
            resourceName: 'proposalStatusTypeMappings',
            repositoryName: 'ProposalStatusTypeMappingsRepository',
            fields: [
                { name: 'name', type: 'String' },
                { name: 'description', type: 'String' }
            ]
        }
    }
];

// Common Java compilation errors to check
const validationRules = [
    {
        name: 'Missing variable name after type',
        pattern: /private\s+\w+\s*;/g,
        error: '<identifier> expected'
    },
    {
        name: 'Undefined template variable',
        pattern: /\{\{\s*\w+\s*\}\}/g,
        error: 'Template variable not replaced (missing parameter)'
    },
    {
        name: 'Empty camelCase result',
        pattern: /private\s+\w+\s+;/g,
        error: 'Empty variable name (camelCase returned empty string)'
    },
    {
        name: 'Type mismatch Optional',
        check: (code) => {
            // Standard Pattern: create() and update() return Response directly, only getById() returns Optional
            
            // Check for Optional on create (create returns Response directly)
            const optionalOnCreate = code.match(/Optional<\w+Response>\s+\w+\s+=\s+\w+Service\.create\([^)]*\);/g) || [];
            
            // Check for Optional on update (update returns Response directly in standard pattern)
            const optionalOnUpdate = code.match(/Optional<\w+Response>\s+\w+\s+=\s+\w+Service\.update\([^)]*\);/g) || [];
            
            // Check for direct Response on getById (getById returns Optional)
            const directResponseOnGetById = code.match(/(\w+Response)\s+\w+\s+=\s+\w+Service\.getById\([^)]*\);/g) || [];
            
            return optionalOnCreate.length > 0 || optionalOnUpdate.length > 0 || directResponseOnGetById.length > 0;
        },
        error: 'Service method return type mismatch: Standard pattern is create()/update() return Response directly, getById() returns Optional<Response>'
    },
    {
        name: 'Duplicate Test suffix',
        check: (code) => {
            return /class\s+(\w+TestTest)/g.test(code);
        },
        error: 'Duplicate "Test" suffix in class name'
    },
    {
        name: 'Missing imports',
        check: (code) => {
            const usesArgumentMatchers = code.includes('ArgumentMatchers.any') || code.includes('ArgumentMatchers.eq');
            const hasImport = code.includes('import org.mockito.ArgumentMatchers');
            return usesArgumentMatchers && !hasImport;
        },
        error: 'Uses ArgumentMatchers but missing import'
    },
    {
        name: 'Hardcoded field setters',
        check: (code) => {
            // Check if template has hardcoded setName/setDescription that might not exist
            const hasHardcodedSetters = code.includes('testEntity.setName(') || code.includes('testEntity.setDescription(');
            return hasHardcodedSetters;
        },
        error: 'Hardcoded field setters (setName/setDescription) may not exist on all entities'
    }
];

function validateTemplate(scenario) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Validating: ${scenario.name}`);
    console.log(`${'='.repeat(80)}`);

    const templatePath = path.join(__dirname, '..', 'templates', 'springboot', scenario.template);
    
    let hasErrors = false;
    
    try {
        // Read template
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        
        // Check for undefined variables in template
        console.log('\n1. Checking template parameters...');
        const templateVars = [...templateContent.matchAll(/\{\{(?!#|\/)([\w\s]+)\}\}/g)]
            .map(m => m[1].trim().split(/\s+/)[0]);
        
        const uniqueVars = [...new Set(templateVars)]
            .filter(v => !['camelCase', 'pascalCase', 'eq', 'if', 'else', 'each', 'name', 'type'].includes(v)); // Filter out Handlebars helpers and field properties
        
        const dataKeys = Object.keys(scenario.data);
        
        console.log(`   Template variables: ${uniqueVars.join(', ')}`);
        console.log(`   Generator provides: ${dataKeys.join(', ')}`);
        
        const missingParams = uniqueVars.filter(v => !dataKeys.includes(v));
        if (missingParams.length > 0) {
            console.log(`   ❌ MISSING PARAMETERS: ${missingParams.join(', ')}`);
            hasErrors = true;
        } else {
            console.log(`   ✅ All template variables have matching parameters`);
        }

        // Compile template
        console.log('\n2. Compiling template...');
        const compiled = Handlebars.compile(templateContent);
        const output = compiled(scenario.data);
        
        console.log(`   ✅ Template compiled successfully (${output.split('\n').length} lines)`);

        // Run validation rules
        console.log('\n3. Running validation rules...');
        let hasErrors = false;

        for (const rule of validationRules) {
            if (rule.pattern) {
                const matches = output.match(rule.pattern);
                if (matches && matches.length > 0) {
                    console.log(`   ❌ ${rule.name}: Found ${matches.length} issue(s)`);
                    console.log(`      Error: ${rule.error}`);
                    matches.slice(0, 3).forEach(m => console.log(`      - "${m}"`));
                    hasErrors = true;
                }
            } else if (rule.check) {
                if (rule.check(output)) {
                    console.log(`   ❌ ${rule.name}`);
                    console.log(`      Error: ${rule.error}`);
                    hasErrors = true;
                }
            }
        }

        if (!hasErrors) {
            console.log(`   ✅ All validation rules passed`);
        }

        // Check for common Java syntax patterns
        console.log('\n4. Checking Java syntax patterns...');
        const javaChecks = [
            {
                name: 'Class declaration',
                pattern: /class\s+\w+\s*\{/,
                required: true
            },
            {
                name: 'Package declaration',
                pattern: /^package\s+[\w.]+;/m,
                required: true
            },
            {
                name: 'Test annotations',
                pattern: /@Test/,
                required: true
            },
            {
                name: 'Assert statements',
                pattern: /assertThat\(|andExpect\(/,
                required: true
            }
        ];

        for (const check of javaChecks) {
            if (check.required && !check.pattern.test(output)) {
                console.log(`   ❌ Missing: ${check.name}`);
                hasErrors = true;
            }
        }

        if (!hasErrors) {
            console.log(`   ✅ Java syntax patterns look good`);
        }

        // Save sample output for manual inspection
        const outputDir = path.join(__dirname, '..', '.validation-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        const outputFile = path.join(outputDir, `${scenario.entity}${scenario.template.replace('.template', '')}`);
        fs.writeFileSync(outputFile, output);
        console.log(`\n5. Sample output saved to: ${outputFile}`);

        return !hasErrors;

    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// Run all validations
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    SPRING BOOT TEMPLATE VALIDATOR                          ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');

let allPassed = true;
for (const scenario of testScenarios) {
    const passed = validateTemplate(scenario);
    allPassed = allPassed && passed;
}

console.log('\n');
console.log('='.repeat(80));
if (allPassed) {
    console.log('✅ ALL VALIDATIONS PASSED - Templates should compile successfully!');
} else {
    console.log('❌ VALIDATION FAILED - Fix the issues above before publishing');
    process.exit(1);
}
console.log('='.repeat(80));
console.log('\n');
