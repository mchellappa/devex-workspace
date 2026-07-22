# Fix Relationship Naming & Controller Import Compilation Errors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix compilation errors in generated Spring Boot code caused by broken child service imports and entity name mismatches between Mermaid ERD names and generated class names.

**Architecture:** Add a `resolveEntityToClassName()` helper in `springBootGenerator.ts` that maps Mermaid entity names (e.g., `PartyRole`) to the actual generated class names (e.g., `PartyRoles`). Fix the Controller template to use `{{../packageName}}` in `{{#each}}` blocks. Deduplicate relationships pointing to the same target entity.

**Tech Stack:** TypeScript, Handlebars templates

---

### Task 1: Fix Controller.java.template — broken `{{packageName}}` in `{{#each}}` block

**Files:**
- Modify: `templates/springboot/Controller.java.template:8`

- [ ] **Step 1: Fix the import line**

Line 8 `import {{packageName}}.service.{{childServiceName}};` is inside `{{#each childEndpoints}}`. In Handlebars, parent context requires `../`. Change to `import {{../packageName}}.service.{{childServiceName}};`.

- [ ] **Step 2: Run validate-templates**

Run: `npm run validate-templates`
Expected: All templates pass

---

### Task 2: Add `resolveEntityToClassName()` and resource-name map in `springBootGenerator.ts`

**Files:**
- Modify: `src/services/springBootGenerator.ts`

The core problem: `toPascalCase("PartyRole")` → `"Partyrole"` because it has no delimiters. But the actual generated class uses the resource name from the URL path: `"party-roles"` → `toPascalCase("party-roles")` → `"PartyRoles"`.

- [ ] **Step 1: Add a `resourceNameMap` field** (Map<string, string>) that maps lowercase Mermaid entity names to the actual resource strings used by the generator.

- [ ] **Step 2: Populate the map** in `generateControllersFromOpenAPI` after building `resourceEndpoints` — for each resource, compute `toSingular(resource.toLowerCase())` and map it to `resource`.

- [ ] **Step 3: Add `resolveEntityToClassName(entityName: string): string`** that:
  1. Tries to find the entity in `resourceNameMap` (lowercased lookup)
  2. If found, returns `toPascalCase(resourceName)` (the actual generated class name)
  3. If not found, returns `entityName` as-is (preserving PascalCase from Mermaid)

- [ ] **Step 4: Update all relationship name resolution** to use `resolveEntityToClassName()`:
  - `generateController` line 538-540: `childServiceName`, `childEntityName`
  - `generateService` line 576-577: `parentEntity`, `parentFieldName`
  - `generateRepository` line 606-607: `parentEntity`, `parentFieldName`
  - `generateModelClasses` line 784-786: `childCollections` entityName/dtoType/fieldName
  - `enrichFieldsWithRelationships` line 1410, 1425-1426: `relatedEntity`, `childEntity`

---

### Task 3: Deduplicate relationships to same target entity

**Files:**
- Modify: `src/services/springBootGenerator.ts`

When an ERD has two FKs to the same entity (e.g., `PartyRelationship` has both `FromPartyID` and `ToPartyID` referencing `Party`), the `OneToMany` side generates duplicate `childEndpoints`, imports, fields, and methods.

- [ ] **Step 1: Deduplicate `childEndpoints`** in `generateController` — filter to unique `childServiceName`.

- [ ] **Step 2: Deduplicate `childCollections`** in `generateModelClasses` — filter to unique `entityName`.

- [ ] **Step 3: Deduplicate `@OneToMany` fields** in `enrichFieldsWithRelationships` — skip if `fieldName` already added.

---

### Task 4: Validate and test

- [ ] **Step 1: Run compile**: `npm run compile`
- [ ] **Step 2: Run validate-templates**: `npm run validate-templates`
- [ ] **Step 3: Run validate-tools**: `npm run validate-tools`
- [ ] **Step 4: Commit**
