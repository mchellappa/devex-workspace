const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

const templates = [
    'Service',
    'Controller', 
    'Repository',
    'Entity',
    'RequestDto',
    'ResponseDto',
    'GlobalExceptionHandler',
    'ServiceTest',
    'ControllerTest'
];

console.log('🧪 Testing Handlebars Syntax...\n');

let allPassed = true;

templates.forEach(name => {
    try {
        const templatePath = `templates/springboot/${name}.java.template`;
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        
        // Check for problematic Javadoc tags
        if (templateContent.includes('{@link') || templateContent.includes('{@see')) {
            console.error(`❌ ${name}: Contains {@ tags that conflict with Handlebars`);
            allPassed = false;
            return;
        }
        
        // Compile with Handlebars
        Handlebars.compile(templateContent);
        console.log(`✅ ${name}: Valid Handlebars syntax`);
    } catch (e) {
        console.error(`❌ ${name}: ${e.message}`);
        allPassed = false;
    }
});

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('✅ ALL TEMPLATES: Valid Handlebars syntax');
    process.exit(0);
} else {
    console.error('❌ Some templates have syntax errors');
    process.exit(1);
}
