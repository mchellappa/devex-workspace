# Template Validation Guide

## The Problem

Previously, finding template bugs required a slow 15-minute cycle:
1. Publish extension (vsce package)
2. Install VSIX
3. Generate code
4. Run Maven compile
5. See errors
6. Fix template
7. Repeat...

## The Solution

Run `npm run validate-templates` to catch errors in **seconds** instead of minutes!

## What It Validates

### 1. Template Parameters ✅
Ensures all `{{variables}}` in templates have matching parameters passed by the generator:
```javascript
// Generator must provide:
{
    packageName, className, serviceName, 
    entityName, resourceName, repositoryName, fields
}

// Template uses:
{{packageName}}, {{className}}, {{serviceName}}, etc.
```

### 2. Common Compilation Errors ✅
- **Missing variable names**: `private UserService ;` (no variable name)
- **Type mismatches**: `UserResponse result = service.getById()` when it returns `Optional<UserResponse>`
- **Duplicate suffixes**: `class UserServiceTestTest` 
- **Missing imports**: Uses `ArgumentMatchers.any()` without import
- **Hardcoded setters**: `testEntity.setName()` that may not exist

### 3. Java Syntax Patterns ✅
- Class declarations
- Package statements
- Test annotations
- Assert statements

### 4. Generated Sample Output 📁
Creates actual `.java` files in `.validation-output/` for manual inspection

## How to Use

### Before Publishing
```bash
# 1. Edit template
vim templates/springboot/ServiceTest.java.template

# 2. Validate immediately
npm run validate-templates

# 3. If validation passes, publish
npm run package
```

### Output Format
```
╔════════════════════════════════════════════════════════════════════════════╗
║                    SPRING BOOT TEMPLATE VALIDATOR                          ║
╚════════════════════════════════════════════════════════════════════════════╝

================================================================================
Validating: User Service Test
================================================================================

1. Checking template parameters...
   Template variables: packageName, entityName, repositoryName, className
   Generator provides: packageName, className, serviceName, entityName
   ✅ All template variables have matching parameters

2. Compiling template...
   ✅ Template compiled successfully (231 lines)

3. Running validation rules...
   ✅ All validation rules passed

4. Checking Java syntax patterns...
   ✅ Java syntax patterns look good

5. Sample output saved to: .validation-output/UserServiceTest.java

================================================================================
✅ ALL VALIDATIONS PASSED - Templates should compile successfully!
================================================================================
```

## Test Scenarios

The validator runs multiple scenarios automatically:

1. **Generic User Entity** - Tests with simple name/email fields
2. **Complex Entity** - Tests with ProposalStatusTypeMappings (real-world example)
3. **Controller Tests** - Validates MockMvc patterns
4. **Service Tests** - Validates Mockito patterns

## What Gets Checked

### ServiceTest.java.template
```java
// ✅ Correct parameter usage
private {{serviceName}} {{camelCase serviceName}};
// Generates: private UserService userService;

// ✅ Optional return types
Optional<{{entityName}}Response> result = {{camelCase serviceName}}.getById(1L);
assertThat(result).isPresent();

// ❌ Would catch this error:
{{entityName}}Response result = {{camelCase serviceName}}.getById(1L);
// Error: incompatible types: Optional<UserResponse> cannot be converted to UserResponse
```

### ControllerTest.java.template
```java
// ✅ Correct MockBean declaration
@MockBean
private {{serviceName}} {{camelCase serviceName}};
// Generates: private UserService userService;

// ✅ ArgumentMatchers import
import org.mockito.ArgumentMatchers;
when(userService.create(ArgumentMatchers.any(UserRequest.class)))
```

## Adding New Validation Rules

Edit `validate-templates.js`:

```javascript
const validationRules = [
    {
        name: 'Your validation name',
        pattern: /regex-pattern/g,  // For pattern matching
        error: 'Error message to display'
    },
    {
        name: 'Custom check',
        check: (code) => {
            // Custom validation logic
            return code.includes('problem');
        },
        error: 'Custom error description'
    }
];
```

## Benefits

⚡ **10x Faster** - Validate in seconds vs 15-minute publish cycle  
🛡️ **Early Detection** - Catch errors before publishing  
📊 **Comprehensive** - Checks parameters, types, syntax, and patterns  
📁 **Inspectable** - Generates actual Java files to review  
🔄 **Repeatable** - Run as many times as needed  

## Real-World Example

**Before Validator** (v1.7.4 → v1.7.10):
- 7 versions published
- 6 template bugs found
- ~90 minutes of debugging cycles
- User frustration with repeated errors

**With Validator**:
```bash
npm run validate-templates
# ❌ VALIDATION FAILED
# Fix template
npm run validate-templates
# ✅ ALL VALIDATIONS PASSED
npm run package  # Only publish once!
```

## CI/CD Integration

Add to pre-publish script in `package.json`:

```json
{
  "scripts": {
    "vscode:prepublish": "npm run validate-templates && npm run compile",
    "validate-templates": "node validate-templates.js"
  }
}
```

This prevents publishing broken templates!

## Troubleshooting

### False Positives

If validator reports missing parameters that are actually Handlebars helpers:
```javascript
// Add to exclusion list in validate-templates.js:
.filter(v => !['camelCase', 'pascalCase', 'eq', 'if', 'else', 'each', 'name', 'type'].includes(v))
```

### Missing Validation

Add your scenario to `testScenarios` array:
```javascript
{
    name: 'My Entity Test',
    entity: 'MyEntity',
    template: 'ServiceTest.java.template',
    data: {
        packageName: 'com.example',
        className: 'MyEntityServiceTest',
        serviceName: 'MyEntityService',
        entityName: 'MyEntity',
        resourceName: 'myEntities',
        repositoryName: 'MyEntityRepository',
        fields: [/* your fields */]
    }
}
```

## Files Generated

```
.validation-output/
├── UserServiceTest.java                              # Generic example
├── UserControllerTest.java                           # Generic controller
└── ProposalStatusTypeMappingsServiceTest.java       # Real-world entity
```

## Next Steps

After validation passes:
1. Review generated files in `.validation-output/`
2. Run `npm run package` to publish
3. Install and test with real project
4. If issues found, add new validation rules!

---

**🎯 Bottom line**: Never publish a broken template again. Validate first, publish once.
