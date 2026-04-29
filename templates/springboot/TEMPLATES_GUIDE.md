# Spring Boot Templates Guide

## Overview
This directory contains Handlebars templates for generating Spring Boot 3.x projects with Java 21.

## Java Version
- **Default**: Java 21
- **Spring Boot**: 3.x compatible
- **Jakarta EE**: All templates use `jakarta.*` packages (not `javax.*`)

## Templates

### Core Application Files
- **Application.java.template**: Main Spring Boot application class with `@SpringBootApplication`
- **pom.xml.template**: Maven build file with Spring Boot 3.x dependencies
- **build.gradle.template**: Gradle build file (alternative to Maven)
- **application.yml.template**: Application configuration
- **ApplicationTests.java.template**: Basic test class

### API Layer
- **Controller.java.template**: REST controllers with Swagger annotations
  - Uses `jakarta.validation.Valid` for request validation
  - Includes OpenAPI/Swagger documentation
- **Service.java.template**: Service layer business logic
- **Repository.java.template**: Spring Data JPA repositories

### DTOs (Data Transfer Objects)
- **RequestDto.java.template**: Request DTOs with Jakarta validation
  - `@NotNull`, `@NotBlank` annotations
  - Lombok `@Data`, `@Builder` support
- **ResponseDto.java.template**: Response DTOs with Jackson
  - `@JsonInclude` for null handling
  - Timestamps and status fields

### Exception Handling
- **GlobalExceptionHandler.java.template**: Global exception handler with `@RestControllerAdvice`
  - Handles validation errors (`MethodArgumentNotValidException`)
  - Handles custom exceptions (ApplicationException, ResourceNotFoundException, BusinessValidationException)
  - Returns structured error responses
- **ApplicationException.java.template**: Base exception class
  - Contains HttpStatus and errorCode
- **ResourceNotFoundException.java.template**: 404 not found exceptions
- **BusinessValidationException.java.template**: 400 business validation errors

### Security (Spring Boot 3.x)
- **SecurityConfig.java.template**: Spring Security 6.x configuration
  - Uses `SecurityFilterChain` bean (not deprecated WebSecurityConfigurerAdapter)
  - JWT authentication enabled
  - Stateless session management
  - Public endpoints: `/api/auth/**`, `/swagger-ui/**`, `/actuator/health`
- **JwtRequestFilter.java.template**: JWT token validation filter
  - Extends `OncePerRequestFilter`
  - Uses Jakarta servlet imports
  - Validates Bearer tokens
- **JwtAuthenticationEntryPoint.java.template**: Unauthorized (401) handler
  - Returns JSON error response
- **JwtTokenUtil.java.template**: JWT token utilities
  - Token generation and validation
  - Uses jjwt 0.12.x (modern API)
  - HMAC-SHA256 signing

### Configuration
- **OpenApiConfig.java.template**: Swagger/OpenAPI configuration

### Other
- **.gitignore.template**: Git ignore rules for Java/Maven/Gradle projects
- **README.md.template**: Project README with build/run instructions

## Dependencies Added

### pom.xml
```xml
<!-- Spring Security -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>

<!-- JWT -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.12.3</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>
```

## Important Changes from Previous Versions

### ⚠️ Breaking Changes
1. **javax → jakarta**: All `javax.validation.*` imports changed to `jakarta.validation.*`
2. **Security Config**: No longer extends `WebSecurityConfigurerAdapter` (deprecated)
   - Now uses `@Bean SecurityFilterChain` approach
3. **Java Version**: Default changed from 17 to 21

### Migration Guide (If Updating Existing Projects)
1. Update Java version to 21 in pom.xml:
   ```xml
   <java.version>21</java.version>
   ```
2. Replace all `javax.validation` imports with `jakarta.validation`
3. Update Spring Security config to use `SecurityFilterChain` bean
4. Update jjwt dependencies to 0.12.x
5. Replace `javax.servlet` with `jakarta.servlet` in filters

## Generated Project Structure
```
project-name/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com.example.project/
│   │   │       ├── ProjectNameApplication.java
│   │   │       ├── config/
│   │   │       │   ├── OpenApiConfig.java
│   │   │       │   └── SecurityConfig.java
│   │   │       ├── controller/
│   │   │       │   └── ResourceController.java
│   │   │       ├── service/
│   │   │       │   └── ResourceService.java
│   │   │       ├── repository/
│   │   │       │   └── ResourceRepository.java
│   │   │       ├── model/
│   │   │       │   ├── dto/
│   │   │       │   │   ├── ResourceRequest.java
│   │   │       │   │   └── ResourceResponse.java
│   │   │       │   └── entity/
│   │   │       ├── exception/
│   │   │       │   ├── GlobalExceptionHandler.java
│   │   │       │   ├── ApplicationException.java
│   │   │       │   ├── ResourceNotFoundException.java
│   │   │       │   └── BusinessValidationException.java
│   │   │       ├── security/
│   │   │       │   ├── JwtRequestFilter.java
│   │   │       │   ├── JwtAuthenticationEntryPoint.java
│   │   │       │   └── JwtTokenUtil.java
│   │   │       └── util/
│   │   └── resources/
│   │       └── application.yml
│   └── test/
│       └── java/
│           └── com.example.project/
│               └── ProjectNameApplicationTests.java
├── pom.xml (or build.gradle)
├── README.md
└── .gitignore
```

## Usage in Code Generation

The SpringBootGenerator service automatically:
1. Creates the directory structure
2. Generates all required classes from templates
3. Applies proper package names
4. Configures Spring Boot 3.x dependencies
5. Sets Java 21 as target version

## Testing Generated Projects

```bash
# Build the project
mvn clean install

# Run the application
mvn spring-boot:run

# Access Swagger UI
http://localhost:8080/swagger-ui.html

# Health check
http://localhost:8080/actuator/health
```

## Security Configuration Notes

### Default Behavior
- All endpoints require authentication (except public paths)
- JWT tokens required in `Authorization: Bearer <token>` header
- Stateless sessions (no JSESSIONID cookies)

### Public Endpoints (No Auth Required)
- `/api/auth/**` - Authentication endpoints
- `/v3/api-docs/**` - OpenAPI docs
- `/swagger-ui/**` - Swagger UI
- `/actuator/health` - Health check

### JWT Configuration (application.yml)
```yaml
jwt:
  secret: your-secret-key-here-minimum-256-bits
  expiration: 86400  # 24 hours in seconds
```

⚠️ **Important**: Change the JWT secret in production!

## Customization

To customize templates:
1. Edit the `.template` files in this directory
2. Handlebars variables: `{{packageName}}`, `{{className}}`, `{{resourceName}}`, etc.
3. Conditional logic: `{{#if condition}}...{{/if}}`
4. Loops: `{{#each items}}...{{/each}}`

## Support

For issues or questions about templates:
- Check SpringBootGenerator.ts for how templates are used
- Review generated code to ensure proper package/class names
- Verify Spring Boot 3.x compatibility

---

**Generated by**: DevEx AI Assistant v1.3.46
**Last Updated**: 2026-02-05
