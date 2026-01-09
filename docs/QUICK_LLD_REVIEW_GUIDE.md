# Quick Guide: LLD Review for Code Generation

## 🎯 Goal
Ensure your LLD has all details needed for AI to generate OpenAPI specs and Spring Boot code.

---

## 🚀 Quick Workflow

### 1. Write Your LLD
Document your API design with as much detail as possible.

### 2. Run AI Review
**Command Palette** → `DevEx: Review LLD` → Select **"API Design Completeness"**

Or right-click your LLD file → **"Review LLD"** → Select **"API Design Completeness"**

### 3. Check the AI Feedback
The AI will tell you:
- ✅ What's already good
- ❌ What's critically missing
- ⚠️ What's unclear
- 📝 Specific actions you need to take
- 🚦 Whether code generation is ready (YES/NO/PARTIAL)

### 4. Update Your LLD
Based on AI feedback, add the missing details.

### 5. Generate Code
When ready:
1. **Generate OpenAPI Spec from LLD**
2. **Generate Spring Boot Project**

---

## ⚡ Top 5 Things AI Checks

### 1. Complete Endpoint Definitions
```markdown
✅ GOOD:
POST /api/v1/users
Authentication: Bearer token required
Request Body: (full JSON schema with types)
Response: 201 Created (full JSON schema)
Errors: 400, 401, 409, 500 (with descriptions)

❌ BAD:
POST /users
Creates a user
```

### 2. Detailed Request/Response Schemas
```markdown
✅ GOOD:
{
  "firstName": "string",  // REQUIRED, 2-50 chars, minLength=2, maxLength=50
  "email": "string",      // REQUIRED, email format, unique
  "role": "string"        // REQUIRED, enum: [USER, ADMIN, MANAGER]
}

❌ BAD:
{
  "firstName": "string",
  "email": "string",
  "role": "string"
}
```

### 3. HTTP Status Codes
```markdown
✅ GOOD:
Success: 201 Created
Errors:
- 400: Validation failed (invalid email, missing field)
- 401: Invalid or missing authentication token
- 409: User with this email already exists
- 500: Internal server error

❌ BAD:
Returns success or error
```

### 4. Validation Rules
```markdown
✅ GOOD:
- email: required, format=email, unique in database
- firstName: required, minLength=2, maxLength=50
- role: required, enum=[USER, ADMIN, MANAGER]

❌ BAD:
- email: must be valid
- firstName: required
- role: user role
```

### 5. Security Details
```markdown
✅ GOOD:
Authentication: JWT Bearer token
Header: Authorization: Bearer <token>
Authorization Rules:
- USER role: Can only access their own data
- ADMIN role: Full access to all operations

❌ BAD:
Requires authentication
```

---

## 📋 Quick Self-Check Before Running Review

Can you answer YES to these?

- [ ] Every endpoint has HTTP method (GET/POST/PUT/PATCH/DELETE)
- [ ] Every endpoint has complete URL path with parameter types
- [ ] Every request body has all field names with types
- [ ] Every response body has all field names with types
- [ ] All enums list their possible values
- [ ] Validation rules are specified (required, min/max, pattern, format)
- [ ] All HTTP status codes are documented
- [ ] Error response format is defined
- [ ] Authentication method is specified

**If YES to all → Run the review and likely ready for generation! 🎉**

**If NO to any → Add those details first, then run the review.**

---

## 💡 Pro Tips

### Tip 1: Copy from Good Examples
Look at `examples/sample-user-api-lld.md` - it's complete and ready for generation.

### Tip 2: Use the Full Checklist
See `docs/LLD_API_CHECKLIST.md` for the complete, detailed checklist.

### Tip 3: Review Early and Often
- Don't wait until LLD is "complete"
- Run review during LLD writing
- AI feedback helps you write better LLDs

### Tip 4: Focus on Specifics
- Be specific with data types (UUID not "string id")
- Be specific with formats (ISO 8601 date-time not "timestamp")
- Be specific with validation (minLength=2, maxLength=50 not "short string")

### Tip 5: Document the Why
- Explain business rules ("email must be unique because...")
- Explain authorization ("USER can only access own data because...")
- This helps AI generate better code

---

## 🔄 Iterative Process

```
Write LLD → Review → Update → Review → Generate → Success!
   ↓         ↓         ↓         ↓         ↓
  Done    AI says    Add      AI says   OpenAPI
          "needs    missing   "ready"   + Code
          work"     details            Generated
```

Don't expect perfection on first try. Iterate!

---

## 🎓 Learning from AI Feedback

The AI review teaches you:
- What details matter for code generation
- How to write better API designs
- REST API best practices
- Common things engineers forget

Over time, you'll write LLDs that need fewer iterations! 📈

---

## 📞 Examples of AI Feedback

### Example 1: Missing Data Types
**AI Says:**
❌ **Critical Missing:** Response schema doesn't specify data types for `createdAt` and `updatedAt`

**You Fix:**
```markdown
"createdAt": "string", // ISO 8601 date-time (e.g., "2026-01-08T10:00:00Z")
"updatedAt": "string"  // ISO 8601 date-time
```

### Example 2: Unclear Validation
**AI Says:**
⚠️ **Unclear:** "email must be valid" - what format? What validation?

**You Fix:**
```markdown
- email: required, format=email, must match RFC 5322, unique in database
```

### Example 3: Missing Error Details
**AI Says:**
❌ **Critical Missing:** No 409 Conflict status code documented for duplicate email

**You Fix:**
```markdown
Error Responses:
- 409 Conflict: User with this email already exists
  {
    "status": 409,
    "error": "Conflict",
    "message": "User with email 'john@example.com' already exists"
  }
```

---

## ✅ When AI Says "READY"

Final check before generation:
1. ✅ Completeness Score: 90%+ (Ready or Nearly Ready)
2. ✅ Final Verdict: YES or PARTIAL (with minor issues)
3. ✅ No critical blockers listed

Then you're good to go! Run:
- **Generate OpenAPI Spec from LLD**
- **Generate Spring Boot Project**

---

## 🆘 If AI Says "NOT READY"

Don't panic! The AI will tell you exactly what's missing.

Look for the **"Required Actions for Engineer"** section - it's a checklist of what to fix.

Fix the **TOP 3 BLOCKERS** first, then re-run the review.

---

## 📚 Additional Resources

- **Full Checklist:** `docs/LLD_API_CHECKLIST.md`
- **Complete Example:** `examples/sample-user-api-lld.md`
- **OpenAPI Spec:** [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- **REST Best Practices:** Search for "REST API design best practices"

---

**Remember: A detailed LLD = Better generated code! ⭐**
