const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

// Register Handlebars helpers
Handlebars.registerHelper('camelCase', (str) => str.charAt(0).toLowerCase() + str.slice(1));
Handlebars.registerHelper('eq', (a, b) => a === b);

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║              COMPREHENSIVE PRE-PACKAGE VALIDATION                      ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let totalIssues = 0;
const issues = [];

// ============================================================================
// 1. CHECK ALL TEMPLATES FOR CORRUPTION
// ============================================================================
console.log('🔍 STEP 1: Checking all templates for corruption patterns...\n');

const templates = [
    'Service.java.template',
    'Controller.java.template',
    'Repository.java.template',
    'Entity.java.template',
    'GlobalExceptionHandler.java.template',
    'RequestDto.java.template',
    'ResponseDto.java.template',
    'ServiceTest.java.template',
    'ControllerTest.java.template'
];

const corruptionPatterns = [
    { pattern: /@Transacts\s/, name: '@Transacts typo' },
    { pattern: /getId\(\)[a-z]\}\}/, name: 'getId() mangled text' },
    { pattern: /\breturs\b/, name: 'returs typo' },
    { pattern: /updated[a-z]+\}\}\s+saved/, name: 'updatedXXX mangled text' },
    { pattern: /\{@link/, name: '{@link Javadoc tag (Handlebars conflict)' },
    { pattern: /\.body\(errorResponse[^);]*\n[^);]*Map</, name: 'Incomplete return statement' },
    { pattern: /return\s+ResponseEntity[^;]{0,50}\n\s*Map<String, Object>/, name: 'Missing semicolon + merged code' },
    { pattern: /\/\*\*\s*\n\s*\*[^*]{0,100}\n\s*\/\*\*/, name: 'Corrupted Javadoc' },
    { pattern: /\}\s*\n\s*@ExceptionHandler.*\n\s*@ExceptionHandler/, name: 'Duplicate exception handlers' }
];

templates.forEach(template => {
    const templatePath = `templates/springboot/${template}`;
    if (!fs.existsSync(templatePath)) {
        console.log(`   ⚠️  ${template}: NOT FOUND`);
        issues.push(`${template} is missing`);
        totalIssues++;
        return;
    }
    
    const content = fs.readFileSync(templatePath, 'utf8');
    let templateIssues = 0;
    
    corruptionPatterns.forEach(({ pattern, name }) => {
        if (pattern.test(content)) {
            console.error(`   ❌ ${template}: ${name}`);
            issues.push(`${template} has corruption: ${name}`);
            templateIssues++;
            totalIssues++;
        }
    });
    
    if (templateIssues === 0) {
        console.log(`   ✅ ${template}: Clean`);
    }
});

// ============================================================================
// 2. VALIDATE HANDLEBARS SYNTAX
// ============================================================================
console.log('\n🔧 STEP 2: Validating Handlebars syntax...\n');

templates.forEach(template => {
    const templatePath = `templates/springboot/${template}`;
    if (!fs.existsSync(templatePath)) return;
    
    try {
        const content = fs.readFileSync(templatePath, 'utf8');
        Handlebars.compile(content);
        console.log(`   ✅ ${template}: Valid Handlebars syntax`);
    } catch (e) {
        console.error(`   ❌ ${template}: ${e.message}`);
        issues.push(`${template} has Handlebars syntax error: ${e.message}`);
        totalIssues++;
    }
});

// ============================================================================
// 3. COMPILE TEMPLATES WITH SAMPLE DATA
// ============================================================================
console.log('\n📝 STEP 3: Compiling templates with sample data...\n');

const sampleData = {
    packageName: 'com.example.test',
    className: 'UserService',
    serviceName: 'UserService',
    controllerClassName: 'UserController',
    entityName: 'User',
    repositoryName: 'UserRepository',
    resourceName: 'user',
    tableName: 'users',
    fields: [
        { name: 'username', type: 'String', required: true, isString: true },
        { name: 'email', type: 'String', required: true, isString: true }
    ]
};

const criticalTemplates = [
    { file: 'Service.java.template', methods: [
        /public List<UserResponse> getAll\(\)/,
        /public Page<UserResponse> getAll\(Pageable pageable\)/,
        /public UserResponse create\(UserRequest request\)/,
        /public Optional<UserResponse> getById\(Long id\)/,
        /public UserResponse update\(Long id, UserRequest request\)/,
        /public void delete\(Long id\)/
    ]},
    { file: 'GlobalExceptionHandler.java.template', methods: [
        /@ExceptionHandler\(MethodArgumentNotValidException\.class\)/,
        /@ExceptionHandler\(ResourceNotFoundException\.class\)/,
        /@ExceptionHandler\(Exception\.class\)/
    ]}
];

criticalTemplates.forEach(({ file, methods }) => {
    const templatePath = `templates/springboot/${file}`;
    if (!fs.existsSync(templatePath)) return;
    
    try {
        const content = fs.readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(content);
        const result = template(sampleData);
        
        let methodIssues = 0;
        methods.forEach((pattern, idx) => {
            if (!pattern.test(result)) {
                console.error(`   ❌ ${file}: Missing method/handler #${idx + 1}`);
                issues.push(`${file} missing critical method/handler`);
                methodIssues++;
                totalIssues++;
            }
        });
        
        if (methodIssues === 0) {
            console.log(`   ✅ ${file}: All critical methods present (${result.split('\n').length} lines)`);
        }
    } catch (e) {
        console.error(`   ❌ ${file}: Compilation failed - ${e.message}`);
        issues.push(`${file} failed to compile: ${e.message}`);
        totalIssues++;
    }
});

// ============================================================================
// 4. CHECK JAVA SYNTAX PATTERNS
// ============================================================================
console.log('\n☕ STEP 4: Checking Java syntax patterns...\n');

criticalTemplates.forEach(({ file }) => {
    const templatePath = `templates/springboot/${file}`;
    if (!fs.existsSync(templatePath)) return;
    
    try {
        const content = fs.readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(content);
        const result = template(sampleData);
        
        const syntaxIssues = [
            { pattern: /;\s*;/, name: 'Double semicolons' },
            { pattern: /\{\{[^}]/, name: 'Unprocessed template variables' },
            { pattern: /\(\s*\)[a-z]/, name: 'Malformed method signatures' }
        ];
        
        let fileSyntaxIssues = 0;
        syntaxIssues.forEach(({ pattern, name }) => {
            if (pattern.test(result)) {
                console.error(`   ❌ ${file}: ${name}`);
                issues.push(`${file} has syntax issue: ${name}`);
                fileSyntaxIssues++;
                totalIssues++;
            }
        });
        
        if (fileSyntaxIssues === 0) {
            console.log(`   ✅ ${file}: Java syntax looks good`);
        }
    } catch (e) {
        // Already caught in step 3
    }
});

// ============================================================================
// 5. CHECK PACKAGE STRUCTURE
// ============================================================================
console.log('\n📦 STEP 5: Checking package structure...\n');

const requiredFiles = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'templates/README.md'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`   ✅ ${file}: Present`);
    } else {
        console.error(`   ❌ ${file}: MISSING`);
        issues.push(`Required file missing: ${file}`);
        totalIssues++;
    }
});

// ============================================================================
// 6. CHECK EXCLUSIONS
// ============================================================================
console.log('\n🚫 STEP 6: Verifying exclusions (.vscodeignore)...\n');

const vscodeignore = fs.readFileSync('.vscodeignore', 'utf8');
const requiredExclusions = ['scripts/**', 'examples/**', '.validation-output/**', 'src/**'];

requiredExclusions.forEach(exclusion => {
    if (vscodeignore.includes(exclusion)) {
        console.log(`   ✅ ${exclusion}: Excluded`);
    } else {
        console.error(`   ❌ ${exclusion}: NOT excluded`);
        issues.push(`Missing exclusion: ${exclusion}`);
        totalIssues++;
    }
});

// ============================================================================
// 7. CHECK NPM SCRIPTS
// ============================================================================
console.log('\n⚙️  STEP 7: Verifying npm scripts...\n');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredScripts = ['compile', 'validate-templates', 'vscode:prepublish'];

requiredScripts.forEach(script => {
    if (packageJson.scripts[script]) {
        console.log(`   ✅ ${script}: Defined`);
    } else {
        console.error(`   ❌ ${script}: MISSING`);
        issues.push(`Missing npm script: ${script}`);
        totalIssues++;
    }
});

// ============================================================================
// FINAL VERDICT
// ============================================================================
console.log('\n╔════════════════════════════════════════════════════════════════════════╗');

if (totalIssues === 0) {
    console.log('║              ✅ ✅ ✅  ALL VALIDATIONS PASSED  ✅ ✅ ✅                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('\n🎯 READY TO PACKAGE:\n');
    console.log(`   • Version: ${packageJson.version}`);
    console.log('   • All templates: Validated ✅');
    console.log('   • No corruption: Confirmed ✅');
    console.log('   • Handlebars syntax: Valid ✅');
    console.log('   • Java syntax: Valid ✅');
    console.log('   • Package structure: Complete ✅');
    console.log('   • Exclusions: Configured ✅\n');
    console.log('📦 Safe to run: npm run compile && vsce package --allow-missing-repository\n');
    process.exit(0);
} else {
    console.log(`║           ❌ ❌ ❌  ${totalIssues} ISSUE(S) FOUND  ❌ ❌ ❌               ║`);
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('\n🔴 ISSUES DETECTED:\n');
    issues.forEach((issue, idx) => {
        console.error(`   ${idx + 1}. ${issue}`);
    });
    console.log('\n⚠️  DO NOT PACKAGE until all issues are resolved!\n');
    process.exit(1);
}
