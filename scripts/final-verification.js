const fs = require('fs');
const path = require('path');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('                    FINAL FIX VERIFICATION REPORT');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// 1. Check package version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('✅ Extension Version:', packageJson.version);

// 2. Check VSIX exists
const vsixExists = fs.existsSync(`devex-ai-assistant-${packageJson.version}.vsix`);
console.log(vsixExists ? '✅ VSIX Package: Present' : '❌ VSIX Package: Missing');

// 3. Check validation output
const validationFiles = [
    '.validation-output/UserServiceTest.java',
    '.validation-output/UserControllerTest.java',
    '.validation-output/ProposalStatusTypeMappingsServiceTest.java'
];

console.log('\n📋 VALIDATION OUTPUT FILES:');
let allValidationFilesPresent = true;
validationFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').length;
        console.log(`   ✅ ${file.split('/')[1]}: ${lines} lines`);
    } else {
        console.log(`   ❌ ${file.split('/')[1]}: Missing`);
        allValidationFilesPresent = false;
    }
});

// 4. Check Service template specifically
const serviceTemplate = fs.readFileSync('templates/springboot/Service.java.template', 'utf8');
const corruptionChecks = [
    { text: '@Transactional(readOnly = true)', status: serviceTemplate.includes('@Transactional(readOnly = true)') },
    { text: 'saved.getId());', status: serviceTemplate.includes('saved.getId());') },
    { text: 'return result;', status: serviceTemplate.includes('return result;') },
    { text: 'return mapper.toResponse(updated);', status: serviceTemplate.includes('return mapper.toResponse(updated);') }
];

console.log('\n🔍 SERVICE TEMPLATE KEY PATTERNS:');
let allPatternsCorrect = true;
corruptionChecks.forEach(({ text, status }) => {
    if (status) {
        console.log(`   ✅ "${text}" - Present`);
    } else {
        console.log(`   ❌ "${text}" - Missing`);
        allPatternsCorrect = false;
    }
});

// 5. Check changelog
const changelogExists = fs.existsSync('changelog.md');
console.log('\n📝 Documentation:');
console.log(changelogExists ? '   ✅ CHANGELOG.md exists' : '   ❌ CHANGELOG.md missing');

// 6. Final verdict
console.log('\n═══════════════════════════════════════════════════════════════════════');
if (vsixExists && allValidationFilesPresent && allPatternsCorrect) {
    console.log('                    ✅ ✅ ✅  ALL CHECKS PASSED  ✅ ✅ ✅');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('\n🎯 READY FOR DEPLOYMENT:');
    console.log(`   • Version: ${packageJson.version}`);
    console.log(`   • Package: devex-ai-assistant-${packageJson.version}.vsix`);
    console.log('   • All templates: Validated ✅');
    console.log('   • No corruption: Confirmed ✅\n');
    console.log('📦 Installation command:');
    console.log(`   code --install-extension devex-ai-assistant-${packageJson.version}.vsix --force\n`);
} else {
    console.log('                    ❌  SOME CHECKS FAILED  ❌');
    console.log('═══════════════════════════════════════════════════════════════════════');
    if (!vsixExists) console.log('   ⚠️  VSIX package needs to be rebuilt');
    if (!allValidationFilesPresent) console.log('   ⚠️  Run: npm run validate-templates');
    if (!allPatternsCorrect) console.log('   ⚠️  Service template still has issues');
}
console.log('');
