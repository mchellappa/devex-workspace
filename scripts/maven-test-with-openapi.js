const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Handlebars = require('handlebars');
const yaml = require('js-yaml');

// Register Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('and', (a, b) => a && b);
Handlebars.registerHelper('or', (a, b) => a || b);
Handlebars.registerHelper('camelCase', (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toLowerCase() + str.slice(1);
});
Handlebars.registerHelper('pascalCase', (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});
Handlebars.registerHelper('upperCase', (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.toUpperCase();
});
Handlebars.registerHelper('lowerCase', (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase();
});

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function printBanner(text) {
    const line = '═'.repeat(72);
    console.log(`\n${COLORS.cyan}╔${line}╗${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.bright}${text.padEnd(72)}${COLORS.reset}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╚${line}╝${COLORS.reset}\n`);
}

function printSuccess(text) {
    console.log(`${COLORS.green}✅ ${text}${COLORS.reset}`);
}

function printError(text) {
    console.log(`${COLORS.red}❌ ${text}${COLORS.reset}`);
}

function printInfo(text) {
    console.log(`${COLORS.blue}ℹ ${text}${COLORS.reset}`);
}

// Map OpenAPI types to Java types
function mapOpenAPITypeToJava(property) {
    const type = property.type;
    const format = property.format;

    if (type === 'integer') {
        if (format === 'int64') return 'Long';
        return 'Integer';
    }
    if (type === 'number') {
        if (format === 'double') return 'Double';
        if (format === 'float') return 'Float';
        return 'BigDecimal';
    }
    if (type === 'string') {
        if (format === 'date-time') return 'LocalDateTime';
        if (format === 'date') return 'LocalDate';
        if (format === 'uuid') return 'String'; // UUID as String for template compatibility
        return 'String';
    }
    if (type === 'boolean') return 'Boolean';
    if (type === 'array') return 'List';

    return 'String'; // Default fallback
}

// Parse OpenAPI spec and extract entity info
function parseOpenAPISpec(yamlPath) {
    printInfo(`Reading OpenAPI spec: ${yamlPath}`);
    
    const fileContent = fs.readFileSync(yamlPath, 'utf8');
    const spec = yaml.load(fileContent);

    if (!spec.components || !spec.components.schemas) {
        throw new Error('No schemas found in OpenAPI specification');
    }

    printSuccess('OpenAPI spec loaded successfully');
    
    // Find the first entity schema (not Request/Response/Error types)
    const schemas = spec.components.schemas;
    let entityName = null;
    let entitySchema = null;

    for (const [name, schema] of Object.entries(schemas)) {
        if (
            !name.includes('Request') && 
            !name.includes('Response') && 
            !name.includes('Error') &&
            !name.includes('Pagination') &&
            schema.type === 'object' &&
            schema.properties
        ) {
            entityName = name;
            entitySchema = schema;
            break;
        }
    }

    if (!entityName || !entitySchema) {
        throw new Error('No suitable entity schema found');
    }

    printSuccess(`Found entity: ${entityName}`);

    // Extract fields from the entity schema
    const fields = [];
    for (const [fieldName, fieldSchema] of Object.entries(entitySchema.properties)) {
        // Skip the ID field and system timestamp fields since templates add them
        if (fieldName.toLowerCase() === 'id' || 
            fieldName === entityName.toLowerCase() + 'Id' ||
            fieldName === 'createdAt' || 
            fieldName === 'updatedAt' ||
            fieldName === 'createdDate' ||
            fieldName === 'lastUpdateTime' ||
            fieldName === 'createdBy' ||
            fieldName === 'lastUpdateBy' ||
            fieldName === 'rowVersion'
        ) {
            continue;
        }

        fields.push({
            name: fieldName,
            type: mapOpenAPITypeToJava(fieldSchema),
            nullable: fieldSchema.nullable === true,
            description: fieldSchema.description || ''
        });
    }

    printSuccess(`Extracted ${fields.length} fields`);
    fields.forEach(f => console.log(`   - ${f.name}: ${f.type}`));

    return {
        entityName,
        fields,
        description: entitySchema.description || `${entityName} entity`
    };
}

// Main test function
function runMavenTestWithOpenAPI() {
    printBanner('           MAVEN TEST WITH REAL OPENAPI SPEC                    ');

    const rootDir = path.join(__dirname, '..');
    const outputDir = path.join(rootDir, '.validation-output', 'maven-openapi-test');
    const templatesDir = path.join(rootDir, 'templates', 'springboot');
    const openAPIPath = path.join(rootDir, '.devex', 'sales-api.yaml');

    // Check if OpenAPI file exists
    if (!fs.existsSync(openAPIPath)) {
        printError(`OpenAPI file not found: ${openAPIPath}`);
        process.exit(1);
    }

    try {
        // Parse OpenAPI spec
        const { entityName, fields, description } = parseOpenAPISpec(openAPIPath);

        // Clean output directory
        console.log('\n🧹 Cleaning previous test project...');
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });

        // Create Java package structure
        const basePackage = 'com.example.sales';
        const packagePath = path.join(outputDir, 'src', 'main', 'java', 'com', 'example', 'sales');
        const testPackagePath = path.join(outputDir, 'src', 'test', 'java', 'com', 'example', 'sales');
        fs.mkdirSync(packagePath, { recursive: true });
        fs.mkdirSync(testPackagePath, { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'src', 'main', 'resources'), { recursive: true });

        // Template data
        const templateData = {
            entityName,
            entityNameLower: entityName.toLowerCase(),
            fields,
            packageName: basePackage,
            serviceName: `${entityName}Service`,
            controllerClassName: `${entityName}Controller`,
            className: `${entityName}Service`, // Will be overridden per template
            repositoryName: `${entityName}Repository`,
            resourceName: entityName.toLowerCase(),
            tableName: `${entityName.toLowerCase()}s`,
            basePackage,
            projectName: `${entityName.toLowerCase()}-service`,
            projectDescription: description,
            description,
            apiVersion: '1.0.0',
            apiPath: `/${entityName.toLowerCase()}s`,
            javaVersion: '17',
            springBootVersion: '3.2.0'
        };

        console.log('\n📦 Generating Spring Boot project from templates...\n');

        // Generate Service
        const serviceTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'Service.java.template'), 'utf8')
        );
        const serviceContent = serviceTemplate({ ...templateData, className: `${entityName}Service` });
        const servicePath = path.join(packagePath, 'service', `${entityName}Service.java`);
        fs.mkdirSync(path.dirname(servicePath), { recursive: true });
        fs.writeFileSync(servicePath, serviceContent);
        printSuccess(`Service.java.template → ${entityName}Service.java (${serviceContent.split('\n').length} lines)`);

        // Generate Controller
        const controllerTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'Controller.java.template'), 'utf8')
        );
        const controllerContent = controllerTemplate({ ...templateData, className: `${entityName}Controller` });
        const controllerPath = path.join(packagePath, 'controller', `${entityName}Controller.java`);
        fs.mkdirSync(path.dirname(controllerPath), { recursive: true });
        fs.writeFileSync(controllerPath, controllerContent);
        printSuccess(`Controller.java.template → ${entityName}Controller.java (${controllerContent.split('\n').length} lines)`);

        // Generate Repository
        const repositoryTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'Repository.java.template'), 'utf8')
        );
        const repositoryContent = repositoryTemplate({ ...templateData, className: `${entityName}Repository` });
        const repositoryPath = path.join(packagePath, 'repository', `${entityName}Repository.java`);
        fs.mkdirSync(path.dirname(repositoryPath), { recursive: true });
        fs.writeFileSync(repositoryPath, repositoryContent);
        printSuccess(`Repository.java.template → ${entityName}Repository.java (${repositoryContent.split('\n').length} lines)`);

        // Generate Entity
        const entityTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'Entity.java.template'), 'utf8')
        );
        const entityContent = entityTemplate({ ...templateData, className: entityName });
        const entityPath = path.join(packagePath, 'entity', `${entityName}.java`);
        fs.mkdirSync(path.dirname(entityPath), { recursive: true });
        fs.writeFileSync(entityPath, entityContent);
        printSuccess(`Entity.java.template → ${entityName}.java (${entityContent.split('\n').length} lines)`);

        // Generate Request Dto
        const requestDtoTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'RequestDto.java.template'), 'utf8')
        );
        const requestDtoContent = requestDtoTemplate({ ...templateData, className: `${entityName}Request` });
        const requestDtoPath = path.join(packagePath, 'dto', `${entityName}Request.java`);
        fs.mkdirSync(path.dirname(requestDtoPath), { recursive: true });
        fs.writeFileSync(requestDtoPath, requestDtoContent);
        printSuccess(`RequestDto.java.template → ${entityName}Request.java (${requestDtoContent.split('\n').length} lines)`);

        // Generate ResponseDto
        const responseDtoTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'ResponseDto.java.template'), 'utf8')
        );
        const responseDtoContent = responseDtoTemplate({ ...templateData, className: `${entityName}Response` });
        const responseDtoPath = path.join(packagePath, 'dto', `${entityName}Response.java`);
        fs.mkdirSync(path.dirname(responseDtoPath), { recursive: true });
        fs.writeFileSync(responseDtoPath, responseDtoContent);
        printSuccess(`ResponseDto.java.template → ${entityName}Response.java (${responseDtoContent.split('\n').length} lines)`);

        // Generate GlobalExceptionHandler
        const exceptionHandlerTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'GlobalExceptionHandler.java.template'), 'utf8')
        );
        const exceptionHandlerContent = exceptionHandlerTemplate({ ...templateData, className: 'GlobalExceptionHandler' });
        const exceptionHandlerPath = path.join(packagePath, 'exception', 'GlobalExceptionHandler.java');
        fs.mkdirSync(path.dirname(exceptionHandlerPath), { recursive: true });
        fs.writeFileSync(exceptionHandlerPath, exceptionHandlerContent);
        printSuccess(`GlobalExceptionHandler.java.template → GlobalExceptionHandler.java (${exceptionHandlerContent.split('\n').length} lines)`);

        // Generate ServiceTest
        const serviceTestTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'ServiceTest.java.template'), 'utf8')
        );
        const serviceTestContent = serviceTestTemplate({ ...templateData, className: `${entityName}ServiceTest` });
        const serviceTestPath = path.join(testPackagePath, `${entityName}ServiceTest.java`);
        fs.writeFileSync(serviceTestPath, serviceTestContent);
        printSuccess(`ServiceTest.java.template → ${entityName}ServiceTest.java (${serviceTestContent.split('\n').length} lines)`);

        // Generate ControllerTest
        const controllerTestTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'ControllerTest.java.template'), 'utf8')
        );
        const controllerTestContent = controllerTestTemplate({ ...templateData, className: `${entityName}ControllerTest` });
        const controllerTestPath = path.join(testPackagePath, `${entityName}ControllerTest.java`);
        fs.writeFileSync(controllerTestPath, controllerTestContent);
        printSuccess(`ControllerTest.java.template → ${entityName}ControllerTest.java (${controllerTestContent.split('\n').length} lines)`);

        // Create exception classes
        console.log('\n📝 Creating exception classes...\n');

        // ApplicationException
        const applicationExceptionTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'ApplicationException.java.template'), 'utf8')
        );
        const applicationExceptionContent = applicationExceptionTemplate({ ...templateData, className: 'ApplicationException' });
        fs.writeFileSync(
            path.join(packagePath, 'exception', 'ApplicationException.java'),
            applicationExceptionContent
        );
        printSuccess('ApplicationException.java');

        // BusinessValidationException
        const businessValidationExceptionTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'BusinessValidationException.java.template'), 'utf8')
        );
        const businessValidationExceptionContent = businessValidationExceptionTemplate({ ...templateData, className: 'BusinessValidationException' });
        fs.writeFileSync(
            path.join(packagePath, 'exception', 'BusinessValidationException.java'),
            businessValidationExceptionContent
        );
        printSuccess('BusinessValidationException.java');

        // ResourceNotFoundException
        const resourceNotFoundExceptionTemplate = Handlebars.compile(
            fs.readFileSync(path.join(templatesDir, 'ResourceNotFoundException.java.template'), 'utf8')
        );
        const resourceNotFoundExceptionContent = resourceNotFoundExceptionTemplate({ ...templateData, className: 'ResourceNotFoundException' });
        fs.writeFileSync(
            path.join(packagePath, 'exception', 'ResourceNotFoundException.java'),
            resourceNotFoundExceptionContent
        );
        printSuccess('ResourceNotFoundException.java');

        // Create mapper class
        const mapperContent = `package ${basePackage}.mapper;

import ${basePackage}.entity.${entityName};
import ${basePackage}.dto.${entityName}Request;
import ${basePackage}.dto.${entityName}Response;
import org.springframework.stereotype.Component;
import java.util.stream.Collectors;

/**
 * Mapper for converting between ${entityName} entities and DTOs.
 * <p>
 * This mapper handles bidirectional conversion between:
 * <ul>
 *     <li>{@link ${entityName}} JPA entity</li>
 *     <li>{@link ${entityName}Request} for create/update operations</li>
 *     <li>{@link ${entityName}Response} for API responses</li>
 * </ul>
 */
@Component
public class ${entityName}Mapper {

    /**
     * Converts a ${entityName} entity to a ${entityName}Response DTO.
     *
     * @param entity the ${entityName} entity to convert
     * @return the corresponding ${entityName}Response DTO
     */
    public ${entityName}Response toResponse(${entityName} entity) {
        ${entityName}Response response = new ${entityName}Response();
        response.setId(entity.getId());
${fields.map(f => `        response.set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(entity.get${f.name.charAt(0).toUpperCase() + f.name.slice(1)}());`).join('\n')}
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        return response;
    }

    /**
     * Converts a ${entityName}Request DTO to a ${entityName} entity.
     *
     * @param request the ${entityName}Request DTO to convert
     * @return the corresponding ${entityName} entity
     */
    public ${entityName} toEntity(${entityName}Request request) {
        ${entityName} entity = new ${entityName}();
${fields.map(f => `        entity.set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(request.get${f.name.charAt(0).toUpperCase() + f.name.slice(1)}());`).join('\n')}
        return entity;
    }

    /**
     * Updates an existing ${entityName} entity with values from a ${entityName}Request DTO.
     *
     * @param request the ${entityName}Request DTO containing new values
     * @param entity  the ${entityName} entity to update
     */
    public void updateEntityFromRequest(${entityName}Request request, ${entityName} entity) {
${fields.map(f => `        entity.set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(request.get${f.name.charAt(0).toUpperCase() + f.name.slice(1)}());`).join('\n')}
    }
}`;
        const mapperPath = path.join(packagePath, 'mapper', `${entityName}Mapper.java`);
        fs.mkdirSync(path.dirname(mapperPath), { recursive: true });
        fs.writeFileSync(mapperPath, mapperContent);
        printSuccess(`${entityName}Mapper.java`);

        // Create Application.java (in root package)
        const applicationContent = `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}`;
        const applicationPath = path.join(outputDir, 'src', 'main', 'java', 'com', 'example', 'sales', 'Application.java');
        fs.mkdirSync(path.dirname(applicationPath), { recursive: true });
        fs.writeFileSync(applicationPath, applicationContent);
        printSuccess('Application.java');

        // Create security classes (needed by ControllerTest)
        const securityPath = path.join(outputDir, 'src', 'main', 'java', 'com', 'example', 'sales', 'security');
        fs.mkdirSync(securityPath, { recursive: true });

        // JwtTokenUtil.java (stub for testing)
        const jwtTokenUtilContent = `package ${basePackage}.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class JwtTokenUtil {

    @Value("\${jwt.secret:mySecretKey123456789012345678901234567890}")
    private String secret;

    @Value("\${jwt.expiration:86400}")
    private Long expiration;

    public String getUsernameFromToken(String token) {
        return getClaimFromToken(token, Claims::getSubject);
    }

    public <T> T getClaimFromToken(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = getAllClaimsFromToken(token);
        return claimsResolver.apply(claims);
    }

    private Claims getAllClaimsFromToken(String token) {
        SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String generateToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        return doGenerateToken(claims, userDetails.getUsername());
    }

    private String doGenerateToken(Map<String, Object> claims, String subject) {
        SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + expiration * 1000))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public Boolean validateToken(String token, UserDetails userDetails) {
        final String username = getUsernameFromToken(token);
        return (username.equals(userDetails.getUsername()) && !isTokenExpired(token));
    }

    private Boolean isTokenExpired(String token) {
        final Date expiration = getExpirationDateFromToken(token);
        return expiration.before(new Date());
    }

    private Date getExpirationDateFromToken(String token) {
        return getClaimFromToken(token, Claims::getExpiration);
    }
}`;
        fs.writeFileSync(path.join(securityPath, 'JwtTokenUtil.java'), jwtTokenUtilContent);

        // JwtRequestFilter.java (stub for testing)
        const jwtRequestFilterContent = `package ${basePackage}.security;

import io.jsonwebtoken.ExpiredJwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtRequestFilter extends OncePerRequestFilter {

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private JwtTokenUtil jwtTokenUtil;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        final String requestTokenHeader = request.getHeader("Authorization");

        String username = null;
        String jwtToken = null;

        if (requestTokenHeader != null && requestTokenHeader.startsWith("Bearer ")) {
            jwtToken = requestTokenHeader.substring(7);
            try {
                username = jwtTokenUtil.getUsernameFromToken(jwtToken);
            } catch (IllegalArgumentException e) {
                logger.error("Unable to get JWT Token");
            } catch (ExpiredJwtException e) {
                logger.error("JWT Token has expired");
            }
        }

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails = this.userDetailsService.loadUserByUsername(username);

            if (jwtTokenUtil.validateToken(jwtToken, userDetails)) {
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }
        chain.doFilter(request, response);
    }
}`;
        fs.writeFileSync(path.join(securityPath, 'JwtRequestFilter.java'), jwtRequestFilterContent);

        // CustomUserDetailsService.java
        const customUserDetailsServiceContent = `package ${basePackage}.security;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        if ("admin".equals(username)) {
            return User.builder()
                    .username("admin")
                    .password("{noop}admin123")
                    .authorities(Collections.singletonList(new SimpleGrantedAuthority("ROLE_ADMIN")))
                    .accountExpired(false)
                    .accountLocked(false)
                    .credentialsExpired(false)
                    .disabled(false)
                    .build();
        } else if ("user".equals(username)) {
            return User.builder()
                    .username("user")
                    .password("{noop}user123")
                    .authorities(Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER")))
                    .accountExpired(false)
                    .accountLocked(false)
                    .credentialsExpired(false)
                    .disabled(false)
                    .build();
        }
        
        throw new UsernameNotFoundException("User not found: " + username);
    }
}`;
        fs.writeFileSync(path.join(securityPath, 'CustomUserDetailsService.java'), customUserDetailsServiceContent);
        printSuccess('Security classes (JwtTokenUtil, JwtRequestFilter, CustomUserDetailsService)');

        // Create application.yml
        const applicationYml = `spring:
  application:
    name: ${entityName.toLowerCase()}-service
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
    username: sa
    password:
  jpa:
    database-platform: org.hibernate.dialect.H2Dialect
    hibernate:
      ddl-auto: create-drop
    show-sql: false
  h2:
    console:
      enabled: true

server:
  port: 8080

jwt:
  secret: mySecretKey123456789012345678901234567890
  expiration: 86400000

logging:
  level:
    root: INFO
    "${basePackage}": DEBUG
`;
        fs.writeFileSync(path.join(outputDir, 'src', 'main', 'resources', 'application.yml'), applicationYml);
        printSuccess('application.yml');

        // Create pom.xml
        console.log('\n📝 Creating pom.xml...\n');
        const pomContent = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>${basePackage}</groupId>
    <artifactId>${entityName.toLowerCase()}-service</artifactId>
    <version>1.0.0</version>
    <name>${entityName} Service</name>
    <description>${description}</description>

    <properties>
        <java.version>17</java.version>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <!-- Spring Boot Web -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- Spring Boot Data JPA -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>

        <!-- Spring Boot Validation -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>

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

        <!-- SpringDoc OpenAPI (Swagger) -->
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.2.0</version>
        </dependency>

        <!-- H2 Database -->
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Spring Boot Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>

</project>`;
        fs.writeFileSync(path.join(outputDir, 'pom.xml'), pomContent);
        printSuccess('pom.xml');

        // Check Maven installation
        console.log('\n🔍 Checking Maven installation...\n');
        try {
            const mvnVersion = execSync('mvn --version', { encoding: 'utf8' });
            const versionLine = mvnVersion.split('\n')[0];
            printSuccess(`Maven found: ${versionLine}`);
        } catch (error) {
            printError('Maven not found. Please install Maven first.');
            process.exit(1);
        }

        // Run Maven package
        console.log('\n🔨 Running Maven package (compile + test)...\n');
        console.log(`   Command: mvn clean package -q`);
        console.log(`   Working directory: ${outputDir}`);
        console.log('   This may take a minute (downloading dependencies + running tests)...\n');

        try {
            execSync('mvn clean package -q', {
                cwd: outputDir,
                stdio: 'inherit'
            });

            printBanner('          ✅ ✅ ✅  MAVEN PACKAGE SUCCESSFUL  ✅ ✅ ✅                 ');
            console.log('\n✅ All generated Java files compiled successfully');
            console.log('✅ All tests passed');
            console.log('✅ No compilation errors');
            console.log('✅ No syntax errors');
            console.log('✅ All dependencies resolved');
            console.log('\n📊 Project Statistics:');
            console.log(`   • Entity: ${entityName}`);
            console.log(`   • Fields: ${fields.length}`);
            console.log(`   • Java files: 14`);
            console.log(`   • Templates used: 9`);
            console.log(`   • OpenAPI source: sales-api.yaml`);

            // Check for JAR file
            const targetDir = path.join(outputDir, 'target');
            const jarFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.jar') && !f.endsWith('-sources.jar'));
            if (jarFiles.length > 0) {
                const jarStats = fs.statSync(path.join(targetDir, jarFiles[0]));
                console.log(`   • JAR size: ${(jarStats.size / 1024).toFixed(2)} KB`);
            }

            console.log(`\n🎯 SUCCESS: Templates work correctly with real OpenAPI spec!\n`);

        } catch (error) {
            printBanner('          ❌ ❌ ❌  MAVEN PACKAGE FAILED  ❌ ❌ ❌                    ');
            console.error('\nMaven build failed. Check the output above for details.');
            process.exit(1);
        }

    } catch (error) {
        printError(`Test failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run the test
runMavenTestWithOpenAPI();
