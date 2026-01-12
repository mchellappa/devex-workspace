# Low-Level Design (LLD) Requirements for Production-Ready Code Generation

## Overview
To generate production-ready Spring Boot code with complete implementations (not TODO placeholders), your LLD document must contain specific, detailed information about your system.

## Required LLD Sections

### 1. **System Overview**
```markdown
## System Overview
- **Purpose**: Brief description of what the system does
- **Business Context**: Key business rules and constraints
- **Architecture Style**: (e.g., REST API, Microservice, Event-Driven)
```

### 2. **Data Models (Critical)**
This is the MOST IMPORTANT section for code generation.

```markdown
## Data Models

### Entity: User
**Description**: Represents a system user

**Fields**:
- `id` (Long): Primary key, auto-generated
- `username` (String): Unique username, required, max 50 chars
- `email` (String): Email address, required, unique, validated format
- `firstName` (String): User's first name, required, max 100 chars
- `lastName` (String): User's last name, required, max 100 chars
- `password` (String): Hashed password, required, min 8 chars
- `role` (Enum): USER, ADMIN, MANAGER
- `status` (Enum): ACTIVE, INACTIVE, SUSPENDED
- `createdAt` (LocalDateTime): Record creation timestamp
- `updatedAt` (LocalDateTime): Last update timestamp

**Relationships**:
- One User has many Orders (One-to-Many)
- One User has one Profile (One-to-One)

**Validation Rules**:
- Email must be valid format
- Username must be alphanumeric
- Password must contain uppercase, lowercase, number, special char

**Business Rules**:
- Cannot delete user with active orders
- Email changes require verification
- Admin users have all permissions
```

### 3. **API Endpoints with Business Logic**
For each endpoint, specify the complete business logic:

```markdown
## API Endpoints

### GET /api/users/{id}
**Purpose**: Retrieve user by ID

**Request**:
- Path Parameter: `id` (Long)
- Headers: `Authorization: Bearer {token}`

**Response**:
- Success (200): UserDTO object
- Not Found (404): User not found
- Unauthorized (401): Invalid token

**Business Logic**:
1. Validate authentication token
2. Check user has permission to view (self or admin)
3. Query user from database by ID
4. If not found, throw UserNotFoundException
5. Map User entity to UserDTO (exclude password)
6. Return UserDTO

**Error Handling**:
- UserNotFoundException → 404 with message
- UnauthorizedException → 401 with message
- Database errors → 500 with generic message (log details)

---

### POST /api/users
**Purpose**: Create new user

**Request**:
- Body: CreateUserRequest
  - username (String, required)
  - email (String, required)
  - password (String, required)
  - firstName (String, required)
  - lastName (String, required)

**Response**:
- Success (201): Created UserDTO with Location header
- Bad Request (400): Validation errors
- Conflict (409): Username or email already exists

**Business Logic**:
1. Validate all required fields present
2. Check username uniqueness (query database)
3. Check email uniqueness (query database)
4. If duplicate found, throw DuplicateUserException
5. Validate password strength (min 8 chars, complexity rules)
6. Hash password using BCrypt
7. Set default role to USER
8. Set status to ACTIVE
9. Set createdAt to current timestamp
10. Save user to database
11. Send welcome email (async, don't block)
12. Map to UserDTO and return
13. Set Location header: /api/users/{newUserId}

**Validation**:
- Email format using regex
- Username: 3-50 chars, alphanumeric only
- Password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special
- Names: 1-100 chars, no special characters

**Error Handling**:
- ValidationException → 400 with field-level errors
- DuplicateUserException → 409 with which field is duplicate
- EmailServiceException → Log error but don't fail request
- Database errors → 500 with generic message

---

### PUT /api/users/{id}
**Purpose**: Update existing user

**Request**:
- Path Parameter: `id` (Long)
- Body: UpdateUserRequest
  - email (String, optional)
  - firstName (String, optional)
  - lastName (String, optional)
  - status (String, optional, admin only)

**Response**:
- Success (200): Updated UserDTO
- Not Found (404): User not found
- Forbidden (403): Cannot update other users (unless admin)

**Business Logic**:
1. Authenticate and get current user
2. Check if user is updating self OR is admin
3. If not, throw ForbiddenException
4. Load existing user from database by ID
5. If not found, throw UserNotFoundException
6. If email changed:
   - Check new email uniqueness
   - Mark email as unverified
   - Send verification email
7. Update only provided fields (partial update)
8. If status change requested:
   - Check user is admin
   - If not admin, throw ForbiddenException
   - Validate status transition rules
9. Set updatedAt to current timestamp
10. Save updated user
11. Map to UserDTO and return

**Error Handling**:
- UserNotFoundException → 404
- ForbiddenException → 403
- ValidationException → 400
- DuplicateEmailException → 409

---

### DELETE /api/users/{id}
**Purpose**: Soft delete user

**Request**:
- Path Parameter: `id` (Long)
- Headers: `Authorization: Bearer {token}`

**Response**:
- Success (204): No content
- Not Found (404): User not found
- Forbidden (403): Cannot delete other users
- Conflict (409): User has active orders

**Business Logic**:
1. Authenticate and verify admin role
2. Load user by ID
3. If not found, throw UserNotFoundException
4. Check for active orders:
   - Query orders table for userId with status PENDING or PROCESSING
   - If found, throw ActiveOrdersException
5. Set user status to INACTIVE (soft delete)
6. Set deletedAt timestamp
7. Revoke all active sessions/tokens
8. Save updated user
9. Return 204 No Content

**Business Rules**:
- Only admins can delete users
- Cannot hard delete (use soft delete)
- Users with active orders cannot be deleted
- Cascade rules: keep order history even for deleted users

**Error Handling**:
- UserNotFoundException → 404
- ForbiddenException → 403 "Admin access required"
- ActiveOrdersException → 409 "Cannot delete user with active orders"
```

### 4. **Business Rules & Validations**

```markdown
## Business Rules

### User Management
1. **Uniqueness**: Username and email must be unique across system
2. **Password Policy**: Min 8 chars, must include uppercase, lowercase, number, special char
3. **Email Verification**: New emails must be verified before becoming primary
4. **Role Assignment**: 
   - Only admins can assign ADMIN role
   - Default role is USER for self-registration
5. **Deletion Policy**: Soft delete only; users with dependencies cannot be deleted

### Order Management
1. **Order Creation**:
   - User must be ACTIVE status
   - Minimum order amount: $10.00
   - Maximum order amount: $10,000.00
   - Must have at least one item
2. **Order Status Transitions**:
   - PENDING → PROCESSING (payment confirmed)
   - PROCESSING → SHIPPED (items dispatched)
   - SHIPPED → DELIVERED (customer confirmed)
   - Any state → CANCELLED (before shipping)
3. **Payment Rules**:
   - Payment must be validated before processing
   - Failed payments move order to PAYMENT_FAILED
   - Refunds only available for cancelled orders

### Inventory Management
1. **Stock Checks**: 
   - Check stock availability before order creation
   - Reserve inventory on order creation
   - Release inventory on order cancellation
2. **Low Stock Alerts**:
   - Send alert when stock < 10 units
   - Prevent orders when stock = 0
```

### 5. **Error Handling Strategy**

```markdown
## Error Handling

### Exception Hierarchy
- `BusinessException` (base for all business errors)
  - `ResourceNotFoundException` (404)
  - `DuplicateResourceException` (409)
  - `ValidationException` (400)
  - `UnauthorizedException` (401)
  - `ForbiddenException` (403)
  - `BusinessRuleViolationException` (422)

### Error Response Format
```json
{
  "timestamp": "2026-01-10T10:30:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed for object='createUserRequest'",
  "errors": [
    {
      "field": "email",
      "rejectedValue": "invalid-email",
      "message": "must be a well-formed email address"
    }
  ],
  "path": "/api/users"
}
```

### Logging Strategy
- **INFO**: Successful operations, business events
- **WARN**: Validation failures, business rule violations
- **ERROR**: System errors, external service failures, database errors
- **DEBUG**: Detailed request/response for troubleshooting

### Retry Logic
- Database deadlocks: Retry 3 times with exponential backoff
- External API calls: Retry 2 times with 1s delay
- Message queue failures: Dead letter queue after 5 attempts
```

### 6. **DTOs and Mappings**

```markdown
## Data Transfer Objects (DTOs)

### UserDTO (Response)
```java
{
  "id": 1,
  "username": "johndoe",
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "USER",
  "status": "ACTIVE",
  "createdAt": "2026-01-10T10:00:00Z"
}
```
**Mapping Rules**:
- NEVER include password field
- Include all other fields from User entity
- Format timestamps as ISO-8601

### CreateUserRequest (Input)
```java
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecureP@ss123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### UpdateUserRequest (Input)
```java
{
  "email": "newemail@example.com",  // optional
  "firstName": "John",               // optional
  "lastName": "Smith"                // optional
}
```
**Rules**: All fields optional for partial updates

### Mapping Logic
- Use MapStruct for entity-DTO conversions
- Handle null values gracefully
- Apply validation before mapping to entity
- Use custom mappers for complex transformations
```

### 7. **Service Layer Logic**

```markdown
## Service Layer Implementation

### UserService

#### Method: getUserById(Long id)
**Purpose**: Retrieve user by ID with authorization check

**Implementation**:
```java
public UserDTO getUserById(Long id) {
    log.info("Fetching user by id: {}", id);
    
    // Get current authenticated user
    User currentUser = securityService.getCurrentUser();
    
    // Authorization check: user can view self or admin can view anyone
    if (!currentUser.getId().equals(id) && !currentUser.isAdmin()) {
        log.warn("User {} attempted to access user {}", currentUser.getId(), id);
        throw new ForbiddenException("Cannot access other user's information");
    }
    
    // Fetch user
    User user = userRepository.findById(id)
        .orElseThrow(() -> {
            log.error("User not found with id: {}", id);
            return new UserNotFoundException("User not found with id: " + id);
        });
    
    log.info("Successfully retrieved user: {}", user.getUsername());
    return userMapper.toDTO(user);
}
```

#### Method: createUser(CreateUserRequest request)
**Purpose**: Create new user with validation and password hashing

**Implementation**:
```java
@Transactional
public UserDTO createUser(CreateUserRequest request) {
    log.info("Creating new user: {}", request.getUsername());
    
    // Check username uniqueness
    if (userRepository.existsByUsername(request.getUsername())) {
        log.warn("Duplicate username attempt: {}", request.getUsername());
        throw new DuplicateResourceException("Username already exists");
    }
    
    // Check email uniqueness
    if (userRepository.existsByEmail(request.getEmail())) {
        log.warn("Duplicate email attempt: {}", request.getEmail());
        throw new DuplicateResourceException("Email already exists");
    }
    
    // Validate password strength
    if (!passwordValidator.isStrong(request.getPassword())) {
        throw new ValidationException("Password does not meet strength requirements");
    }
    
    // Create user entity
    User user = new User();
    user.setUsername(request.getUsername());
    user.setEmail(request.getEmail());
    user.setPassword(passwordEncoder.encode(request.getPassword()));
    user.setFirstName(request.getFirstName());
    user.setLastName(request.getLastName());
    user.setRole(Role.USER);
    user.setStatus(Status.ACTIVE);
    user.setCreatedAt(LocalDateTime.now());
    
    // Save user
    user = userRepository.save(user);
    log.info("User created successfully with id: {}", user.getId());
    
    // Send welcome email asynchronously
    try {
        emailService.sendWelcomeEmail(user.getEmail(), user.getFirstName());
    } catch (Exception e) {
        log.error("Failed to send welcome email to {}", user.getEmail(), e);
        // Don't fail the request if email fails
    }
    
    return userMapper.toDTO(user);
}
```
```

### 8. **Database Schema**

```markdown
## Database Schema

### Table: users
```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status)
);
```

### Table: orders
```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```
```

## Complete LLD Example

See: [examples/sample-lld.md](../examples/sample-lld.md) for a complete example that will generate production-ready code.

## How the Generator Uses This Information

### 1. **Data Models → Entity Classes**
- Field definitions → JPA annotations
- Validation rules → Bean Validation annotations
- Relationships → JPA relationship annotations

### 2. **Business Logic → Service Methods**
- Step-by-step logic → Actual Java implementation
- Business rules → If/else conditions and validations
- Error handling → Try-catch blocks and custom exceptions

### 3. **API Endpoints → Controller Methods**
- Request/response definitions → Method signatures
- Business logic steps → Service method calls
- Error scenarios → Exception handling

### 4. **Error Handling → Exception Classes**
- Exception hierarchy → Custom exception classes
- Error responses → GlobalExceptionHandler implementation

## Quick Checklist

Before generating code, ensure your LLD has:

- [ ] Complete data model with all fields and types
- [ ] Validation rules for each field
- [ ] Relationships between entities
- [ ] Business logic for EACH endpoint (step-by-step)
- [ ] Error handling for each scenario
- [ ] Business rules and constraints
- [ ] DTO definitions and mapping rules
- [ ] Database schema with constraints
- [ ] Authentication and authorization rules
- [ ] Logging requirements
- [ ] External service integrations (if any)

## Tips for Better Code Generation

1. **Be Specific**: "Validate email format" is better than "validate email"
2. **Include Edge Cases**: What happens when data is missing, duplicate, or invalid?
3. **Define Happy Path + Error Paths**: Every operation should have both
4. **Use Examples**: Provide example request/response bodies
5. **State Dependencies**: "Check stock before creating order"
6. **Define Transactions**: Which operations should be atomic?
7. **Specify Async Operations**: "Send email asynchronously, don't block"
8. **Include Performance Considerations**: "Use pagination for list endpoints"

## Common Mistakes to Avoid

❌ Vague requirements: "Handle user creation"
✅ Specific steps: "1. Validate input, 2. Check uniqueness, 3. Hash password..."

❌ Missing error scenarios: Only defining happy path
✅ Complete error handling: Define what happens for each error type

❌ No validation rules: "email field"
✅ Detailed validation: "email: String, required, unique, valid format, max 255 chars"

❌ Abstract business rules: "Follow business logic"
✅ Explicit rules: "Users with active orders cannot be deleted"
