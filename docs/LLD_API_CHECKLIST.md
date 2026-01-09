# LLD API Design Checklist
## Ensuring Your LLD is Ready for OpenAPI & Code Generation

This checklist ensures your Low-Level Design (LLD) contains all necessary details for automated OpenAPI specification generation and Spring Boot code generation.

---

## 🎯 Completeness Criteria

Your LLD is ready for code generation when you can answer **"YES"** to all items in the Critical sections.

---

## 1️⃣ API Endpoints (CRITICAL)

### For Each Endpoint, Document:

- [ ] **HTTP Method** (GET, POST, PUT, PATCH, DELETE)
- [ ] **Complete URL Path** (e.g., `/api/v1/users/{id}`)
- [ ] **Path Parameters** (with name, type, description)
  ```
  Example: {id} - UUID - The user's unique identifier
  ```
- [ ] **Query Parameters** (with name, type, required/optional, default)
  ```
  Example: 
  - page: integer, optional, default: 0
  - size: integer, optional, default: 20, max: 100
  - sort: string, optional, default: "createdAt,desc"
  ```
- [ ] **Request Headers** (especially authentication)
  ```
  Example: Authorization: Bearer <token>
  ```

### Example (COMPLETE):
```markdown
### Create User
**Endpoint:** POST /api/v1/users
**Description:** Creates a new user in the system
**Authentication:** Required (Bearer token)
**Request Headers:**
- Authorization: Bearer <token> (required)
- Content-Type: application/json (required)
```

---

## 2️⃣ Request Bodies (CRITICAL)

### For POST/PUT/PATCH Endpoints, Specify:

- [ ] **Complete JSON schema** with all field names
- [ ] **Data type for each field** (string, integer, boolean, array, object, number, etc.)
- [ ] **Required vs Optional** fields clearly marked
- [ ] **Field constraints:**
  - String: minLength, maxLength, pattern (regex)
  - Number: minimum, maximum, multipleOf
  - Enums: list all possible values
  - Format: email, uuid, date, date-time, uri, etc.

### Example (COMPLETE):
```markdown
**Request Body:**
{
  "firstName": "string",      // REQUIRED, 2-50 characters
  "lastName": "string",       // REQUIRED, 2-50 characters
  "email": "string",          // REQUIRED, email format, unique
  "phoneNumber": "string",    // OPTIONAL, E.164 format (+1-555-0123)
  "role": "string",           // REQUIRED, enum: [USER, ADMIN, MANAGER]
  "dateOfBirth": "string"     // OPTIONAL, date format (YYYY-MM-DD)
}

**Validation Rules:**
- firstName: required, minLength=2, maxLength=50
- lastName: required, minLength=2, maxLength=50
- email: required, format=email, unique in database
- phoneNumber: optional, pattern=^\+[1-9]\d{1,14}$
- role: required, enum=[USER, ADMIN, MANAGER]
- dateOfBirth: optional, format=date
```

---

## 3️⃣ Response Bodies (CRITICAL)

### For All Success Responses, Document:

- [ ] **Complete JSON schema** for response body
- [ ] **All field names and types**
- [ ] **Nested objects** fully defined
- [ ] **Array items** type specified
- [ ] **Timestamps** format specified (ISO 8601, epoch, etc.)
- [ ] **ID fields** format specified (UUID, integer, string)

### Example (COMPLETE):
```markdown
**Response:** 201 Created
{
  "id": "uuid",                    // UUID v4
  "firstName": "string",           // 2-50 characters
  "lastName": "string",            // 2-50 characters
  "email": "string",               // email format
  "phoneNumber": "string | null",  // E.164 format or null
  "role": "string",                // enum: USER, ADMIN, MANAGER
  "status": "string",              // enum: ACTIVE, INACTIVE, SUSPENDED
  "createdAt": "string",           // ISO 8601 date-time (2026-01-08T10:00:00Z)
  "updatedAt": "string"            // ISO 8601 date-time
}
```

---

## 4️⃣ HTTP Status Codes (CRITICAL)

### For Each Endpoint, Document:

- [ ] **All success status codes** (200, 201, 204)
- [ ] **All error status codes** (400, 401, 403, 404, 409, 500)
- [ ] **What each status code means** in context

### Example (COMPLETE):
```markdown
**Success Responses:**
- 200 OK: User retrieved successfully
- 201 Created: User created successfully
- 204 No Content: User deleted successfully

**Error Responses:**
- 400 Bad Request: Validation failed (invalid email, missing required field)
- 401 Unauthorized: Missing or invalid authentication token
- 403 Forbidden: User doesn't have permission to perform this action
- 404 Not Found: User with specified ID doesn't exist
- 409 Conflict: User with this email already exists
- 500 Internal Server Error: Unexpected server error
```

---

## 5️⃣ Error Response Format (CRITICAL)

### Define Standard Error Structure:

- [ ] **Error response schema** used across all endpoints
- [ ] **Error field names and types**
- [ ] **Validation error format** (for 400 errors)

### Example (COMPLETE):
```markdown
**Standard Error Response Format:**
{
  "timestamp": "string",      // ISO 8601 date-time
  "status": "integer",        // HTTP status code
  "error": "string",          // Error type (e.g., "Bad Request")
  "message": "string",        // Human-readable error message
  "path": "string",           // Request path that caused error
  "errors": [                 // Optional: validation errors array
    {
      "field": "string",      // Field name that failed validation
      "message": "string",    // Validation error message
      "rejectedValue": "any"  // The value that was rejected (optional)
    }
  ]
}

**Example 400 Response:**
{
  "timestamp": "2026-01-08T10:00:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/v1/users",
  "errors": [
    {
      "field": "email",
      "message": "Email must be valid",
      "rejectedValue": "invalid-email"
    },
    {
      "field": "firstName",
      "message": "First name is required"
    }
  ]
}
```

---

## 6️⃣ Security & Authentication (CRITICAL)

### Document:

- [ ] **Authentication method** (JWT Bearer, OAuth2, API Key, Basic Auth)
- [ ] **How to pass credentials** (header name, format)
- [ ] **Authorization rules** per endpoint
- [ ] **Required scopes/roles** for each endpoint

### Example (COMPLETE):
```markdown
## Security
**Authentication Method:** JWT Bearer Token

**How to Authenticate:**
All endpoints require JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

**Token Requirements:**
- Token must be valid (not expired)
- Token must contain user ID and role

**Authorization Rules (RBAC):**
- USER role:
  - GET /api/v1/users/{id} - Only their own profile
  - PUT /api/v1/users/{id} - Only their own profile
  
- MANAGER role:
  - GET /api/v1/users - All users
  - GET /api/v1/users/{id} - Any user
  - PUT /api/v1/users/{id} - Any USER role (not ADMIN/MANAGER)
  
- ADMIN role:
  - Full access to all operations
```

---

## 7️⃣ Data Models & Entities (REQUIRED)

### Define:

- [ ] **All entity/domain models** with complete field list
- [ ] **Field types and constraints** for each model
- [ ] **Relationships** between entities (if any)
- [ ] **Enum definitions** with all possible values

### Example (COMPLETE):
```markdown
## Data Models

### User Entity
**Description:** Represents a user in the system

**Fields:**
| Field        | Type      | Required | Constraints                    | Description                |
|--------------|-----------|----------|--------------------------------|----------------------------|
| id           | UUID      | Yes      | Primary key, auto-generated    | Unique user identifier     |
| firstName    | String    | Yes      | 2-50 chars                     | User's first name          |
| lastName     | String    | Yes      | 2-50 chars                     | User's last name           |
| email        | String    | Yes      | Email format, unique           | User's email address       |
| phoneNumber  | String    | No       | E.164 format                   | User's phone number        |
| role         | Enum      | Yes      | [USER, ADMIN, MANAGER]         | User's role in system      |
| status       | Enum      | Yes      | [ACTIVE, INACTIVE, SUSPENDED]  | User's account status      |
| createdAt    | DateTime  | Yes      | ISO 8601, auto-generated       | Account creation timestamp |
| updatedAt    | DateTime  | Yes      | ISO 8601, auto-updated         | Last update timestamp      |

**Enums:**
- UserRole: USER, ADMIN, MANAGER
- UserStatus: ACTIVE, INACTIVE, SUSPENDED
```

---

## 8️⃣ Pagination & Filtering (for List Endpoints)

### For GET endpoints that return lists, specify:

- [ ] **Pagination parameters** (page, size, limit, offset)
- [ ] **Default values** for pagination
- [ ] **Maximum page size** allowed
- [ ] **Sort parameters** (field, direction)
- [ ] **Filter parameters** (which fields can be filtered)
- [ ] **Paginated response format** with metadata

### Example (COMPLETE):
```markdown
### List Users
**Endpoint:** GET /api/v1/users

**Pagination Parameters:**
- page: integer, optional, default: 0, min: 0 - Page number (zero-indexed)
- size: integer, optional, default: 20, min: 1, max: 100 - Items per page
- sort: string, optional, default: "createdAt,desc" - Sort field and direction

**Filter Parameters:**
- role: string, optional, enum: [USER, ADMIN, MANAGER] - Filter by role
- status: string, optional, enum: [ACTIVE, INACTIVE, SUSPENDED] - Filter by status
- search: string, optional, minLength: 2 - Search in firstName, lastName, email

**Response Format:**
{
  "content": [                      // Array of user objects
    { /* user object */ }
  ],
  "pageable": {
    "pageNumber": 0,                // Current page number
    "pageSize": 20,                 // Items per page
    "sort": "createdAt,desc",       // Sort applied
    "offset": 0,                    // Offset in total results
    "paged": true,                  // Whether paging is enabled
    "unpaged": false
  },
  "totalElements": 150,             // Total items across all pages
  "totalPages": 8,                  // Total number of pages
  "last": false,                    // Whether this is the last page
  "first": true,                    // Whether this is the first page
  "numberOfElements": 20,           // Number of items in this page
  "size": 20,                       // Page size
  "number": 0,                      // Current page number
  "empty": false                    // Whether the result is empty
}
```

---

## 9️⃣ Database Schema (HIGHLY RECOMMENDED)

### Document:

- [ ] **Table names** and column names
- [ ] **Primary keys** and foreign keys
- [ ] **Indexes** for performance
- [ ] **Constraints** (unique, not null, check constraints)
- [ ] **Default values**

### Example (COMPLETE):
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(20),
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_role CHECK (role IN ('USER', 'ADMIN', 'MANAGER')),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
```

---

## 🔟 Technical Implementation Hints (RECOMMENDED)

### Specify:

- [ ] **Technology stack** (Spring Boot version, Java version)
- [ ] **Build tool** (Maven or Gradle)
- [ ] **Database** (PostgreSQL, MySQL, MongoDB, etc.)
- [ ] **Package structure** suggestion
- [ ] **Dependencies** needed (Spring Data JPA, Spring Security, etc.)

### Example (COMPLETE):
```markdown
## Technical Implementation

**Technology Stack:**
- Spring Boot: 3.2.x
- Java: 21
- Database: PostgreSQL 15+
- Build Tool: Maven
- ORM: Spring Data JPA with Hibernate

**Key Dependencies:**
- spring-boot-starter-web
- spring-boot-starter-data-jpa
- spring-boot-starter-security
- spring-boot-starter-validation
- postgresql (driver)
- lombok
- mapstruct (for DTO mapping)
- springdoc-openapi-starter-webmvc-ui (for API docs)

**Package Structure:**
com.company.user
├── controller (REST controllers)
├── service (business logic)
├── repository (data access)
├── model
│   ├── entity (JPA entities)
│   └── dto (request/response DTOs)
├── mapper (MapStruct mappers)
├── exception (custom exceptions and handler)
├── config (configuration classes)
└── security (security configuration)
```

---

## 📋 Pre-Generation Checklist

Before running "Generate OpenAPI Spec" or "Generate Spring Boot Project", verify:

### ✅ Minimum Requirements (MUST HAVE):
- [ ] All endpoints have HTTP methods and paths
- [ ] All request bodies have complete field definitions with types
- [ ] All response bodies have complete field definitions with types
- [ ] All endpoints have success and error status codes
- [ ] Error response format is defined
- [ ] Authentication method is specified
- [ ] Data validation rules are complete

### ✨ Recommended (SHOULD HAVE):
- [ ] Pagination is defined for list endpoints
- [ ] All enums list possible values
- [ ] Database schema is provided
- [ ] Authorization rules are specified per endpoint
- [ ] Examples are provided for requests/responses

### 🎯 Best Practice (NICE TO HAVE):
- [ ] API follows REST conventions (proper HTTP methods, status codes)
- [ ] Resource URLs use plural nouns and kebab-case
- [ ] API versioning strategy is mentioned
- [ ] Rate limiting considerations
- [ ] Caching strategy (if applicable)
- [ ] Idempotency keys for critical operations

---

## 🚀 How to Use This Checklist

### Step 1: Write Your LLD
Create your LLD document with as much detail as possible.

### Step 2: Self-Review
Go through this checklist yourself and mark what's complete.

### Step 3: AI Review
Run: **DevEx: Review LLD** → Select **"API Design Completeness"**

The AI will:
- Check your LLD against this checklist
- Identify what's missing
- Provide specific recommendations
- Tell you if code generation is ready

### Step 4: Update LLD
Based on AI feedback, add missing details to your LLD.

### Step 5: Re-Review (Optional)
Run the review again to confirm everything is ready.

### Step 6: Generate!
Once complete, run:
1. **DevEx: Generate OpenAPI Spec from LLD**
2. **DevEx: Generate Spring Boot Project**

---

## 📚 Example LLDs

See these examples in the `examples/` folder:
- `sample-user-api-lld.md` - ✅ Complete (ready for generation)
- `sample-lld.md` - ⚠️ Basic (needs enhancement)

---

## 💡 Tips for Success

1. **Be Specific, Not Generic**
   - ❌ Bad: "id: string"
   - ✅ Good: "id: UUID v4 (e.g., '550e8400-e29b-41d4-a716-446655440000')"

2. **Show Examples**
   - Include sample request/response JSON
   - Show what validation errors look like
   - Demonstrate pagination format

3. **Define All Enums**
   - Don't just say "status: string"
   - Say "status: enum [ACTIVE, INACTIVE, SUSPENDED]"

4. **Specify Formats**
   - date, date-time, email, uuid, uri, ipv4, ipv6, etc.
   - This ensures proper validation in generated code

5. **Think About Edge Cases**
   - What happens if required field is missing?
   - What if ID doesn't exist?
   - What if user doesn't have permission?

6. **Document Business Rules**
   - "Email must be unique in the system"
   - "Users cannot delete their own account"
   - "Only ADMIN can change roles"

---

## 🆘 Need Help?

If you're unsure about any section:
1. Run **DevEx: Review LLD** with "API Design Completeness" focus
2. Check the `examples/` folder for reference
3. Ask your team's Principal Engineer or Architect
4. Review OpenAPI 3.0 specification docs

---

**Remember:** The more complete your LLD, the better the generated code will be! 🎯
