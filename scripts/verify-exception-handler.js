const fs = require('fs');
const path = require('path');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

console.log('\n🔍 GLOBALEXCEPTIONHANDLER FIX VERIFICATION\n');
console.log('═══════════════════════════════════════════════════════════\n');

const templateContent = fs.readFileSync('templates/springboot/GlobalExceptionHandler.java.template', 'utf8');

// Check for all required exception handlers
const requiredHandlers = [
    { name: 'MethodArgumentNotValidException', pattern: /@ExceptionHandler\(MethodArgumentNotValidException\.class\)/ },
    { name: 'MethodArgumentTypeMismatchException', pattern: /@ExceptionHandler\(MethodArgumentTypeMismatchException\.class\)/ },
    { name: 'IllegalArgumentException', pattern: /@ExceptionHandler\(IllegalArgumentException\.class\)/ },
    { name: 'ApplicationException', pattern: /@ExceptionHandler\(ApplicationException\.class\)/ },
    { name: 'ResourceNotFoundException', pattern: /@ExceptionHandler\(ResourceNotFoundException\.class\)/ },
    { name: 'BusinessValidationException', pattern: /@ExceptionHandler\(BusinessValidationException\.class\)/ },
    { name: 'Exception (global)', pattern: /@ExceptionHandler\(Exception\.class\)/ }
];

console.log('📋 EXCEPTION HANDLERS:\n');
let allHandlersPresent = true;
requiredHandlers.forEach(({ name, pattern }) => {
    const matches = templateContent.match(new RegExp(pattern, 'g'));
    const count = matches ? matches.length : 0;
    
    if (count === 1) {
        console.log(`   ✅ ${name}: Present (1 handler)`);
    } else if (count > 1) {
        console.error(`   ❌ ${name}: DUPLICATE (${count} handlers) - CORRUPTION!`);
        allHandlersPresent = false;
    } else {
        console.error(`   ❌ ${name}: MISSING`);
        allHandlersPresent = false;
    }
});

// Check for corruption patterns
console.log('\n🔬 CORRUPTION CHECKS:\n');
const corruptionPatterns = [
    { pattern: /\.body\(errorResponse[^);]*\n[^);]*Map</, name: 'Incomplete return + merged code' },
    { pattern: /\breturn\s+ResponseEntity[^;]*\n\s*Map<String, Object> error = new HashMap/, name: 'Missing semicolon + code merge' },
    { pattern: /\/\*\*\s*\n\s*\*[^*]*\n\s*\/\*\*/, name: 'Corrupted Javadoc (missing close)' }
];

let hasCorruption = false;
corruptionPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(templateContent)) {
        console.error(`   ❌ FOUND: ${name}`);
        hasCorruption = true;
    } else {
        console.log(`   ✅ No ${name}`);
    }
});

// Check for proper return statements
console.log('\n💾 RETURN STATEMENTS:\n');
const returnChecks = [
    { pattern: /return ResponseEntity\.status\([^)]+\)\.body\(errorResponse\);/, name: 'Standard error responses' },
    { pattern: /return ResponseEntity\.badRequest\(\)\.body\(errorResponse\);/, name: 'Bad request responses' },
    { pattern: /return ResponseEntity\.status\(HttpStatus\.NOT_FOUND\)\.body\(errorResponse\);/, name: 'Not found responses' }
];

let allReturnsValid = true;
returnChecks.forEach(({ pattern, name }) => {
    if (pattern.test(templateContent)) {
        console.log(`   ✅ ${name}: Valid`);
    } else {
        console.error(`   ❌ ${name}: Missing or invalid`);
        allReturnsValid = false;
    }
});

// Final verdict
console.log('\n═══════════════════════════════════════════════════════════');
if (allHandlersPresent && !hasCorruption && allReturnsValid) {
    console.log('✅ ✅ ✅  GLOBALEXCEPTIONHANDLER IS FIXED  ✅ ✅ ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📝 Template length:', templateContent.split('\n').length, 'lines');
    console.log('📝 Total exception handlers: 7');
    process.exit(0);
} else {
    console.error('❌ ❌ ❌  GLOBALEXCEPTIONHANDLER HAS ISSUES  ❌ ❌ ❌');
    console.log('═══════════════════════════════════════════════════════════');
    if (!allHandlersPresent) console.error('   - Some handlers are missing or duplicated');
    if (hasCorruption) console.error('   - Corruption patterns detected');
    if (!allReturnsValid) console.error('   - Invalid return statements');
    process.exit(1);
}
