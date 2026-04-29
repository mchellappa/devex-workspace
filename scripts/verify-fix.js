const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

// Register helpers
Handlebars.registerHelper('camelCase', (str) => {
    return str.charAt(0).toLowerCase() + str.slice(1);
});

console.log('🔍 VERIFYING SERVICE.JAVA.TEMPLATE FIX...\n');

const templateContent = fs.readFileSync('templates/springboot/Service.java.template', 'utf8');

// Check for corruption patterns
const corruptionPatterns = [
    { pattern: /@Transacts\s/, name: '@Transacts typo' },
    { pattern: /getId\(\)e\}\}/, name: 'getId()e}} mangled text' },
    { pattern: /\breturs\b/, name: 'returs typo' },
    { pattern: /updatedame\}\}/, name: 'updatedame mangled text' },
    { pattern: /\{@link/, name: '{@link Javadoc tag' }
];

let hasCorruption = false;
corruptionPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(templateContent)) {
        console.error(`❌ CORRUPTION FOUND: ${name}`);
        hasCorruption = true;
    } else {
        console.log(`✅ No ${name}`);
    }
});

// Compile template with real data
try {
    const template = Handlebars.compile(templateContent);
    const result = template({
        packageName: 'com.example.test',
        className: 'ProposalService',
        serviceName: 'ProposalService',
        entityName: 'Proposal',
        repositoryName: 'ProposalRepository',
        resourceName: 'proposal'
    });
    
    // Check critical methods exist
    const criticalMethods = [
        { pattern: /public List<ProposalResponse> getAll\(\)/, name: 'getAll()' },
        { pattern: /public Page<ProposalResponse> getAll\(Pageable pageable\)/, name: 'getAll(Pageable)' },
        { pattern: /public ProposalResponse create\(ProposalRequest request\)/, name: 'create()' },
        { pattern: /public Optional<ProposalResponse> getById\(Long id\)/, name: 'getById()' },
        { pattern: /public ProposalResponse update\(Long id, ProposalRequest request\)/, name: 'update()' },
        { pattern: /public void delete\(Long id\)/, name: 'delete()' },
        { pattern: /protected void validateRequest\(ProposalRequest request\)/, name: 'validateRequest()' }
    ];
    
    console.log('\n📋 CHECKING GENERATED METHODS:\n');
    
    let allMethodsPresent = true;
    criticalMethods.forEach(({ pattern, name }) => {
        if (pattern.test(result)) {
            console.log(`✅ ${name} method present`);
        } else {
            console.error(`❌ ${name} method MISSING`);
            allMethodsPresent = false;
        }
    });
    
    // Check for syntax errors
    console.log('\n🔬 CHECKING JAVA SYNTAX:\n');
    
    const syntaxIssues = [
        { pattern: /;\s*;/, name: 'Double semicolons' },
        { pattern: /\(\s*\)s/, name: 'Malformed method signatures' },
        { pattern: /\{\{[^}]/, name: 'Unprocessed template variables' }
    ];
    
    let hasSyntaxIssues = false;
    syntaxIssues.forEach(({ pattern, name }) => {
        if (pattern.test(result)) {
            console.error(`❌ SYNTAX ISSUE: ${name}`);
            hasSyntaxIssues = true;
        } else {
            console.log(`✅ No ${name}`);
        }
    });
    
    // Final verdict
    console.log('\n' + '='.repeat(70));
    if (!hasCorruption && allMethodsPresent && !hasSyntaxIssues) {
        console.log('✅ ✅ ✅  SERVICE TEMPLATE IS COMPLETELY FIXED  ✅ ✅ ✅');
        console.log('='.repeat(70));
        console.log('\n📝 Generated service length:', result.split('\n').length, 'lines');
        process.exit(0);
    } else {
        console.error('❌ ❌ ❌  SERVICE TEMPLATE HAS ISSUES  ❌ ❌ ❌');
        console.log('='.repeat(70));
        if (hasCorruption) console.error('   - Template contains corruption patterns');
        if (!allMethodsPresent) console.error('   - Some methods are missing');
        if (hasSyntaxIssues) console.error('   - Java syntax issues detected');
        process.exit(1);
    }
    
} catch (e) {
    console.error('\n❌ TEMPLATE COMPILATION FAILED:', e.message);
    process.exit(1);
}
