# ERD Primary Key Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the actual PK field from the ERD/OpenAPI schema (e.g. `PartyId`, `BeneficiaryTypeCode`) as the entity's `@Id` field instead of hardcoding a generic `private Long id` on every entity.

**Architecture:** The generator must detect which field is the PK (via OpenAPI `readOnly: true` or naming convention `*Id`/`*Code`), pass PK metadata (`pkFieldName`, `pkFieldType`, `pkColumnName`) to all templates, and all templates must use this metadata instead of hardcoded `Long id`. The PK field must be excluded from the non-PK `fields` list so it doesn't appear twice.

**Tech Stack:** TypeScript (generator), Handlebars (templates), Java Spring Boot (output)

---

## Summary of Changes

The hardcoded `private Long id` assumption exists in **8 templates** and **3 generator methods**. Every instance must be replaced with dynamic PK metadata.

### Files to modify

| File | What changes |
|------|-------------|
| `src/services/springBootGenerator.ts` | Detect PK field, extract metadata, pass to templates |
| `src/services/aiService.ts` | Ensure LLM prompt explicitly marks PK with `readOnly: true` |
| `templates/springboot/Entity.java.template` | Use `{{pkFieldName}}` / `{{pkFieldType}}` / `{{pkColumnName}}` |
| `templates/springboot/ResponseDto.java.template` | Use `{{pkFieldName}}` / `{{pkFieldType}}` instead of `Long id` |
| `templates/springboot/Repository.java.template` | Use `{{pkFieldType}}` in `JpaRepository<Entity, {{pkFieldType}}>` |
| `templates/springboot/Controller.java.template` | Use `{{pkFieldType}}` for `@PathVariable`, pass to service |
| `templates/springboot/Service.java.template` | Use `{{pkFieldType}}` for `getById`, `update`, `delete` params |
| `templates/springboot/ControllerTest.java.template` | Use `{{pkFieldName}}` in builder calls, correct PK type in assertions |
| `templates/springboot/ServiceTest.java.template` | Use `{{pkFieldName}}` in builder calls, correct PK type |

---

### Task 1: Detect PK field and extract metadata in the generator

**Files:**
- Modify: `src/services/springBootGenerator.ts` — `convertOpenAPISchemaToFields` (~line 1056), `generateModelClasses` (~line 803)

The generator needs to:
1. Capture `readOnly` from OpenAPI properties in `convertOpenAPISchemaToFields`
2. Detect the PK field (readOnly + naming convention) in `generateModelClasses`
3. Remove the PK field from the regular `fields` list
4. Pass PK metadata to all template compilations

- [ ] **Step 1: Capture `readOnly` in `convertOpenAPISchemaToFields`**

In `src/services/springBootGenerator.ts`, find the `convertOpenAPISchemaToFields` method (~line 1083). Add `readOnly` to the field object:

```typescript
// In the fields.push() call inside convertOpenAPISchemaToFields, add:
fields.push({
    name: propName,
    type: javaType,
    required: requiredFields.has(propName),
    readOnly: prop.readOnly === true,  // <-- ADD THIS
    isString: javaType === 'String',
    // ... rest stays the same
});
```

- [ ] **Step 2: Extract PK metadata in `generateModelClasses`**

In `src/services/springBootGenerator.ts`, in the `generateModelClasses` method, after the camelCase conversion (after line ~843), add PK detection logic:

```typescript
// After: fields = fields.map(field => ({ ...field, columnName: ..., name: ... }));

// Detect PK field: look for readOnly field, or field ending in 'Id'/'Code' that matches entity name pattern
let pkField = fields.find(f => f.readOnly === true);
if (!pkField) {
    // Fallback: first field whose name ends with 'Id' or 'Code' (common PK patterns)
    pkField = fields.find(f => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('id') || lower.endsWith('code');
    });
}

// PK metadata for templates
const pkFieldName = pkField ? pkField.name : 'id';
const pkFieldType = pkField ? pkField.type : 'Long';
const pkColumnName = pkField ? (pkField.columnName || pkField.name) : 'id';
const pkIsGenerated = pkFieldType === 'Long' || pkFieldType === 'Integer';

// Remove PK field from the regular fields list so it doesn't appear twice
if (pkField) {
    fields = fields.filter(f => f.name !== pkField!.name);
}
```

- [ ] **Step 3: Pass PK metadata to Entity, Request DTO, and Response DTO template compilations**

In `generateModelClasses`, update the three template compilation calls to include PK metadata:

For the Entity template (~line 855):
```typescript
const entityContent = entityCompiled({
    packageName: config.packageName,
    className: entityName,
    tableName: this.mermaidEntityMap.get(entityName) || resource.toLowerCase(),
    resourceName: resource,
    fields: entityFields,
    entityName: entityName,
    imports: entityImports.join('\n'),
    pkFieldName,      // ADD
    pkFieldType,      // ADD
    pkColumnName,     // ADD
    pkIsGenerated     // ADD
});
```

For the Request DTO (~line 871):
```typescript
const requestContent = requestCompiled({
    packageName: config.packageName,
    className: entityName + 'Request',
    resourceName: resource,
    fields,
    entityName,       // ADD (needed for javadoc)
    imports: imports.join('\n')
});
```

For the Response DTO (~line 910):
```typescript
const responseContent = responseCompiled({
    packageName: config.packageName,
    className: entityName + 'Response',
    resourceName: resource,
    fields,
    entityName,        // ADD (needed for javadoc)
    childCollections: childCollections.length > 0 ? childCollections : undefined,
    imports: responseImports.join('\n'),
    pkFieldName,       // ADD
    pkFieldType        // ADD
});
```

- [ ] **Step 4: Pass PK metadata to Controller, Service, Repository, and test template compilations**

Find all calls to `generateController`, `generateService`, `generateRepository`, `generateControllerTest`, `generateServiceTest` — add `pkFieldName`, `pkFieldType`, `pkColumnName`, `pkIsGenerated` as parameters.

This requires updating the method signatures to accept PK metadata and forward it to their template compilation. Each method follows the same pattern — add pk params to the method signature, then include them in the Handlebars compilation context.

**For generateController** (~line 426):
Add params `pkFieldName: string, pkFieldType: string` to signature. Add to compiled context.

**For generateService** (~line 493):
Add params `pkFieldName: string, pkFieldType: string` to signature. Add to compiled context.

**For generateRepository** (~line 574):
Add params `pkFieldName: string, pkFieldType: string` to signature. Add to compiled context.

**For generateControllerTest** (~line 1379):
Add params `pkFieldName: string, pkFieldType: string` to signature. Add to compiled context.

**For generateServiceTest** (~line 1445):
Add params `pkFieldName: string, pkFieldType: string` to signature. Add to compiled context.

Update the call sites in `generateControllersFromOpenAPI` (lines ~411-418) and `generateTests` (lines ~1300-1310) to pass the PK metadata.

- [ ] **Step 5: Compile and fix any TypeScript errors**

Run: `npm run compile`

---

### Task 2: Update Entity.java.template to use dynamic PK

**Files:**
- Modify: `templates/springboot/Entity.java.template`

Replace the hardcoded `@Id` block (lines 62-69) with dynamic PK:

- [ ] **Step 1: Replace hardcoded PK in Entity template**

Replace lines 62-69:
```java
    /**
     * Primary key for the {{entityName}} entity.
     * Auto-generated using database identity column.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;
```

With:
```java
    /**
     * Primary key for the {{entityName}} entity.
     {{#if pkIsGenerated}}
     * Auto-generated using database identity column.
     {{/if}}
     */
    @Id
    {{#if pkIsGenerated}}
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    {{/if}}
    @Column(name = "{{pkColumnName}}", nullable = false, updatable = false)
    private {{pkFieldType}} {{pkFieldName}};
```

---

### Task 3: Update ResponseDto.java.template to use dynamic PK

**Files:**
- Modify: `templates/springboot/ResponseDto.java.template`

- [ ] **Step 1: Replace hardcoded `id` field**

Replace lines 53-58:
```java
    /**
     * Unique identifier for this {{entityName}}.
     * Assigned by the database on creation.
     */
    @Schema(description = "Unique identifier", example = "1", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;
```

With:
```java
    /**
     * Primary key for this {{entityName}}.
     */
    @Schema(description = "Primary key identifier", accessMode = Schema.AccessMode.READ_ONLY)
    private {{pkFieldType}} {{pkFieldName}};
```

---

### Task 4: Update Repository.java.template to use dynamic PK type

**Files:**
- Modify: `templates/springboot/Repository.java.template`

- [ ] **Step 1: Replace hardcoded `Long` in JpaRepository generic**

Replace line 50-51:
```java
public interface {{className}} extends JpaRepository<{{entityName}}, Long>, 
                                        JpaSpecificationExecutor<{{entityName}}> {
```

With:
```java
public interface {{className}} extends JpaRepository<{{entityName}}, {{pkFieldType}}>, 
                                        JpaSpecificationExecutor<{{entityName}}> {
```

Also update all `Long` references for ID parameters in the parent relationship queries (lines 208, 217) — these should remain `Long` since they reference parent entity IDs which may still be Long. Leave those as-is.

---

### Task 5: Update Controller.java.template to use dynamic PK type

**Files:**
- Modify: `templates/springboot/Controller.java.template`

- [ ] **Step 1: Replace `@PathVariable Long id` with `@PathVariable {{pkFieldType}} id`**

Find all occurrences of `@PathVariable Long id` in the Controller template (lines 206, 289, 323, 352) and replace `Long` with `{{pkFieldType}}`.

Note: The child endpoint at line 352 uses the parent's PK — this should remain `Long` for now since child endpoints reference the parent's ID. Only replace the 3 occurrences for the entity's own endpoints (getById, update, delete).

---

### Task 6: Update Service.java.template to use dynamic PK type

**Files:**
- Modify: `templates/springboot/Service.java.template`

- [ ] **Step 1: Replace `Long id` parameters with `{{pkFieldType}} id`**

Replace all `Long id` method parameters and return types that refer to the entity's own PK (getById, update, delete, existsById, findById, deleteById) with `{{pkFieldType}} id`.

Affected methods: `getById` (line 169), `update` (line 193), `delete` (line 221).
Also `findById(id)` and `existsById(id)` calls — these use the JPA repository which now has `{{pkFieldType}}` as the ID type.

---

### Task 7: Update ControllerTest.java.template for dynamic PK

**Files:**
- Modify: `templates/springboot/ControllerTest.java.template`

- [ ] **Step 1: Replace hardcoded `.id(1L)` and `Long` references**

In the setUp method (lines 85-90), replace:
```java
        testResponse = {{entityName}}Response.builder()
                .id(1L)
```
With:
```java
        testResponse = {{entityName}}Response.builder()
                .{{pkFieldName}}({{#if (eq pkFieldType "String")}}"PK1"{{else if (eq pkFieldType "Integer")}}1{{else}}1L{{/if}})
```

Also update the second response builder (line 94):
```java
                {{entityName}}Response.builder().id(2L).build()
```
To:
```java
                {{entityName}}Response.builder().{{pkFieldName}}({{#if (eq pkFieldType "String")}}"PK2"{{else if (eq pkFieldType "Integer")}}2{{else}}2L{{/if}}).build()
```

Update all `is(1)` / `is(1L)` assertions that check `$.id` to use `$.{{pkFieldName}}`.

Update all `getById(1L)` / `getById(999L)` mock calls to use the correct PK type.

---

### Task 8: Update ServiceTest.java.template for dynamic PK

**Files:**
- Modify: `templates/springboot/ServiceTest.java.template`

- [ ] **Step 1: Replace hardcoded `setId(1L)` and `.id(1L)` references**

Replace `testEntity.setId(1L)` with the appropriate setter for the PK field:
```java
        testEntity.set{{pascalCase pkFieldName}}({{#if (eq pkFieldType "String")}}"PK1"{{else if (eq pkFieldType "Integer")}}1{{else}}1L{{/if}});
```

Replace `.id(1L)` in the response builder with `.{{pkFieldName}}(...)`.

Update all `findById(1L)`, `findById(999L)`, `existsById(1L)`, `existsById(999L)`, `deleteById(any())` calls to use correct PK type values.

Update assertions like `result.get().getId()` to `result.get().get{{pascalCase pkFieldName}}()`.

---

### Task 9: Validate, bump version, commit, push, package

- [ ] **Step 1: Compile**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 2: Validate templates**

Run: `npm run validate-templates`
Expected: All pass

- [ ] **Step 3: Validate tools**

Run: `npm run validate-tools`
Expected: All pass

- [ ] **Step 4: Bump version to 1.14.14**

In `package.json`, change `"version": "1.14.13"` to `"version": "1.14.14"`.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git reset HEAD .adaloom/
git commit -m "feat: use ERD primary key fields instead of hardcoded Long id (v1.14.14)

- Detect PK field from OpenAPI readOnly or naming convention (*Id/*Code)
- Pass pkFieldName, pkFieldType, pkColumnName to all templates
- Entity uses actual PK with correct @Column and conditional @GeneratedValue
- Repository, Controller, Service use correct PK type
- Tests use correct PK field name and type in builders/assertions"
git push
```

- [ ] **Step 6: Package VSIX**

Run: `npx vsce package`
