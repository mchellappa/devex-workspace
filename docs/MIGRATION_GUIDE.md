# Migration Guide: Fixing Common Compilation Errors

This guide helps fix compilation errors in projects generated with earlier versions of DevEx AI Assistant.

## Issue 1: Duplicate Field Definition Errors

### Error Message
```
[ERROR] variable id is already defined in class com.example.dto.MyEntityResponse
[ERROR] variable createdAt is already defined in class com.example.entity.MyEntity
```

### Root Cause
Your OpenAPI specification includes `id`, `createdAt`, or `updatedAt` fields in the schema properties. These fields are automatically added by the templates as system-managed fields, causing duplicates.

### Solution: Remove System Fields from OpenAPI Spec

**Before (causes errors):**
```yaml
components:
  schemas:
    User:
      type: object
      properties:
        id:                    # ❌ Remove this
          type: integer
          format: int64
        createdAt:             # ❌ Remove this
          type: string
          format: date-time
        updatedAt:             # ❌ Remove this
          type: string
          format: date-time
        username:              # ✅ Keep business fields
          type: string
        email:
          type: string
```

**After (correct):**
```yaml
components:
  schemas:
    User:
      type: object
      properties:
        username:              # ✅ Only business fields
          type: string
        email:
          type: string
        # id, createdAt, updatedAt are auto-generated
```

### Cleanup: Remove Duplicate Fields

If you've already generated code, manually remove the duplicate field declarations:

**In Entity classes (*.java in entity/ folder):**
```java
public class User implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                    // ✅ Keep this (first occurrence)
    
    // REMOVE THESE if they appear again:
    // private Long id;                 // ❌ Delete duplicate
    // private LocalDateTime createdAt; // ❌ Delete if before @CreationTimestamp field
    // private LocalDateTime updatedAt; // ❌ Delete if before @UpdateTimestamp field
    
    private String username;            // ✅ Your business fields
    private String email;
    
    @CreationTimestamp
    private LocalDateTime createdAt;    // ✅ Keep this (system-managed)
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;    // ✅ Keep this (system-managed)
}
```

**In Response DTO classes (*.java in dto/ folder):**
```java
public class UserResponse implements Serializable {
    private Long id;                    // ✅ Keep this (first occurrence)
    
    // REMOVE THESE if they appear again:
    // private Long id;                 // ❌ Delete duplicate
    // private LocalDateTime createdAt; // ❌ Delete if before @JsonFormat field
    // private LocalDateTime updatedAt; // ❌ Delete if before @JsonFormat field
    
    private String username;            // ✅ Your business fields
    private String email;
    
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;    // ✅ Keep this (system-managed)
    
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime updatedAt;    // ✅ Keep this (system-managed)
}
```

---

## Issue 2: Missing Exception Class Methods

### Error Messages
```
[ERROR] cannot find symbol: method getStatus()
[ERROR]   location: variable ex of type com.example.exception.ApplicationException
[ERROR] cannot find symbol: method getErrorCode()
[ERROR]   location: variable ex of type com.example.exception.ApplicationException
```

### Root Cause
- Older versions of `ApplicationException.java.template` used field name `httpStatus` instead of `status`
- Lombok @Getter generates `getHttpStatus()` but GlobalExceptionHandler calls `getStatus()`

### Solution: Update Exception Classes

**Option 1: Regenerate Exception Classes** (Recommended)

1. Delete your existing exception files:
   - `src/main/java/.../exception/ApplicationException.java`
   - `src/main/java/.../exception/BusinessValidationException.java`
   - `src/main/java/.../exception/ResourceNotFoundException.java`

2. Re-run the Spring Boot code generator with v1.8.5+ to get updated templates

**Option 2: Manual Fix**

Edit `ApplicationException.java`:

```java
@Getter
public class ApplicationException extends RuntimeException {
    
    // OLD: private final HttpStatus httpStatus;
    private final HttpStatus status;        // ✅ Rename to 'status'
    private final String errorCode;

    // Update constructor parameter names
    public ApplicationException(String message, HttpStatus status) {
        super(message);
        this.status = status;                // ✅ Use 'status'
        this.errorCode = "APPLICATION_ERROR";
    }

    public ApplicationException(String message, HttpStatus status, String errorCode) {
        super(message);
        this.status = status;                // ✅ Use 'status'
        this.errorCode = errorCode;
    }

    public ApplicationException(String message, Throwable cause, HttpStatus status, String errorCode) {
        super(message, cause);
        this.status = status;                // ✅ Use 'status'
        this.errorCode = errorCode;
    }
}
```

Edit `BusinessValidationException.java` to add errorCode support:

```java
public class BusinessValidationException extends ApplicationException {

    public BusinessValidationException(String message) {
        super(message, HttpStatus.BAD_REQUEST, "BUSINESS_VALIDATION_ERROR");
    }

    // ✅ Add this constructor to support custom error codes
    public BusinessValidationException(String message, String errorCode) {
        super(message, HttpStatus.BAD_REQUEST, errorCode);
    }

    public BusinessValidationException(String message, Throwable cause) {
        super(message, cause, HttpStatus.BAD_REQUEST, "BUSINESS_VALIDATION_ERROR");
    }
}
```

---

## Issue 3: Missing getId() Method Errors

### Error Message
```
[ERROR] cannot find symbol: method getId()
[ERROR]   location: variable saved of type com.example.entity.MyEntity
```

### Root Cause
Lombok @Data annotation not generating getters, or missing Lombok dependency.

### Solution: Verify Lombok Setup

1. **Check pom.xml has Lombok dependency:**
```xml
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>
```

2. **Verify @Data annotation on classes:**
```java
@Data                          // ✅ This should be present
@Entity
public class User {
    @Id
    private Long id;
    // ...
}
```

3. **Clean and rebuild:**
```bash
mvn clean compile
```

4. **If still failing, add explicit getter:**
```java
public class User {
    @Id
    private Long id;
    
    // Explicit getter as fallback
    public Long getId() {
        return id;
    }
}
```

---

## Verification

After fixes, run full build with tests:

```bash
mvn clean package
```

All tests should pass:
```
[INFO] Tests run: 22, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

---

## Prevention

To avoid these issues in future code generation:

1. **OpenAPI Spec Best Practices:**
   - ❌ Do NOT include `id`, `createdAt`, `updatedAt` in schema properties
   - ✅ Only define business/domain-specific fields
   - ✅ Let JPA and templates manage system fields

2. **Always use latest extension version:**
   ```bash
   code --install-extension devex-ai-assistant-1.8.5.vsix --force
   ```

3. **Run validation before commit:**
   ```bash
   mvn clean package  # Should complete with 0 errors
   ```

---

## Need Help?

If you encounter other compilation errors not covered here, check:
1. Extension CHANGELOG.md for known issues
2. Template comments for field requirements
3. Ensure all exception classes are present in `/exception/` folder
