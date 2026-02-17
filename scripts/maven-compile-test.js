const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Handlebars = require('handlebars');

// Change to workspace root
process.chdir(path.join(__dirname, '..'));

// Register Handlebars helpers
Handlebars.registerHelper('camelCase', (str) => str.charAt(0).toLowerCase() + str.slice(1));
Handlebars.registerHelper('pascalCase', (str) => str.charAt(0).toUpperCase() + str.slice(1));
Handlebars.registerHelper('eq', (a, b) => a === b);

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║           MAVEN COMPILE TEST: Real Spring Boot Project               ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

const testProjectDir = path.join(process.cwd(), '.validation-output', 'maven-test-project');

// Clean and create test directory
if (fs.existsSync(testProjectDir)) {
    console.log('🧹 Cleaning previous test project...');
    fs.rmSync(testProjectDir, { recursive: true, force: true });
}
fs.mkdirSync(testProjectDir, { recursive: true });

// Sample data for generation
const sampleData = {
    packageName: 'com.example.test',
    serviceName: 'UserService',
    controllerClassName: 'UserController',
    entityName: 'User',
    className: 'UserService',
    repositoryName: 'UserRepository',
    resourceName: 'user',
    tableName: 'users',
    basePackage: 'com.example.test',
    projectName: 'maven-test-project',
    projectDescription: 'Test project for template validation',
    javaVersion: '17',
    springBootVersion: '3.2.0',
    fields: [
        { name: 'username', type: 'String', required: true, isString: true },
        { name: 'email', type: 'String', required: true, isString: true }
    ]
};

console.log('📦 Generating Spring Boot project from templates...\n');

// Create directory structure
const srcDir = path.join(testProjectDir, 'src', 'main', 'java', 'com', 'example', 'test');
const testDir = path.join(testProjectDir, 'src', 'test', 'java', 'com', 'example', 'test');
const resourcesDir = path.join(testProjectDir, 'src', 'main', 'resources');

fs.mkdirSync(path.join(srcDir, 'controller'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'service'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'repository'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'entity'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'dto'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'exception'), { recursive: true });
fs.mkdirSync(path.join(srcDir, 'mapper'), { recursive: true });
fs.mkdirSync(testDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

// Generate files from templates
const templates = [
    { file: 'Service.java.template', output: path.join(srcDir, 'service', 'UserService.java'), className: 'UserService' },
    { file: 'Controller.java.template', output: path.join(srcDir, 'controller', 'UserController.java'), className: 'UserController' },
    { file: 'Repository.java.template', output: path.join(srcDir, 'repository', 'UserRepository.java'), className: 'UserRepository' },
    { file: 'Entity.java.template', output: path.join(srcDir, 'entity', 'User.java'), className: 'User' },
    { file: 'RequestDto.java.template', output: path.join(srcDir, 'dto', 'UserRequest.java'), className: 'UserRequest' },
    { file: 'ResponseDto.java.template', output: path.join(srcDir, 'dto', 'UserResponse.java'), className: 'UserResponse' },
    { file: 'GlobalExceptionHandler.java.template', output: path.join(srcDir, 'exception', 'GlobalExceptionHandler.java'), className: 'GlobalExceptionHandler' },
    { file: 'ServiceTest.java.template', output: path.join(testDir, 'UserServiceTest.java'), className: 'UserServiceTest' },
    { file: 'ControllerTest.java.template', output: path.join(testDir, 'UserControllerTest.java'), className: 'UserControllerTest' }
];

let generationErrors = 0;
templates.forEach(({ file, output, className }) => {
    try {
        const templatePath = path.join('templates', 'springboot', file);
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(templateContent);
        
        // Merge className into sample data
        const templateData = { ...sampleData, className };
        const result = template(templateData);
        fs.writeFileSync(output, result, 'utf8');
        
        const lines = result.split('\n').length;
        console.log(`   ✅ ${file} → ${path.basename(output)} (${lines} lines)`);
    } catch (e) {
        console.error(`   ❌ ${file}: ${e.message}`);
        generationErrors++;
    }
});

if (generationErrors > 0) {
    console.error(`\n❌ ${generationErrors} template(s) failed to generate. Aborting Maven compile test.\n`);
    process.exit(1);
}

// Create exception classes
console.log('\n📝 Creating exception classes...\n');

const resourceNotFoundException = `package com.example.test.exception;

public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String resource, String field, Object value) {
        super(String.format("%s not found with %s : '%s'", resource, field, value));
    }
}`;

const applicationException = `package com.example.test.exception;

import org.springframework.http.HttpStatus;

public class ApplicationException extends RuntimeException {
    private final HttpStatus status;
    private final String errorCode;
    
    public ApplicationException(String message, HttpStatus status) {
        super(message);
        this.status = status;
        this.errorCode = "APPLICATION_ERROR";
    }
    
    public ApplicationException(String message, HttpStatus status, String errorCode) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
    }
    
    public HttpStatus getStatus() {
        return status;
    }
    
    public String getErrorCode() {
        return errorCode;
    }
}`;

const businessValidationException = `package com.example.test.exception;

public class BusinessValidationException extends RuntimeException {
    private final String errorCode;
    
    public BusinessValidationException(String message) {
        super(message);
        this.errorCode = "BUSINESS_VALIDATION_ERROR";
    }
    
    public BusinessValidationException(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
    
    public String getErrorCode() {
        return errorCode;
    }
}`;

fs.writeFileSync(path.join(srcDir, 'exception', 'ResourceNotFoundException.java'), resourceNotFoundException);
console.log('   ✅ ResourceNotFoundException.java');
fs.writeFileSync(path.join(srcDir, 'exception', 'ApplicationException.java'), applicationException);
console.log('   ✅ ApplicationException.java');
fs.writeFileSync(path.join(srcDir, 'exception', 'BusinessValidationException.java'), businessValidationException);
console.log('   ✅ BusinessValidationException.java');

// Create mapper class
const mapperClass = `package com.example.test.mapper;

import com.example.test.entity.User;
import com.example.test.dto.UserRequest;
import com.example.test.dto.UserResponse;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {
    public User toEntity(UserRequest request) {
        User entity = new User();
        entity.setUsername(request.getUsername());
        entity.setEmail(request.getEmail());
        return entity;
    }
    
    public UserResponse toResponse(User entity) {
        UserResponse response = new UserResponse();
        response.setId(entity.getId());
        response.setUsername(entity.getUsername());
        response.setEmail(entity.getEmail());
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        return response;
    }
    
    public void updateEntityFromRequest(UserRequest request, User entity) {
        entity.setUsername(request.getUsername());
        entity.setEmail(request.getEmail());
    }
}`;

fs.writeFileSync(path.join(srcDir, 'mapper', 'UserMapper.java'), mapperClass);
console.log('   ✅ UserMapper.java');

// Create Application class
const applicationClass = `package com.example.test;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}`;

fs.writeFileSync(path.join(srcDir, '../Application.java'), applicationClass);
console.log('   ✅ Application.java');

// Create application.yml
const applicationYml = `spring:
  application:
    name: maven-test-project
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
    username: sa
    password: 
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: true
  h2:
    console:
      enabled: true
`;

fs.writeFileSync(path.join(resourcesDir, 'application.yml'), applicationYml);
console.log('   ✅ application.yml');

// Create pom.xml
console.log('\n📝 Creating pom.xml...\n');

const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>maven-test-project</artifactId>
    <version>1.0.0</version>
    <name>Maven Test Project</name>
    <description>Test project for template validation</description>

    <properties>
        <java.version>17</java.version>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.2.0</version>
        </dependency>
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

fs.writeFileSync(path.join(testProjectDir, 'pom.xml'), pomXml);
console.log('   ✅ pom.xml');

// Check if Maven is installed
console.log('\n🔍 Checking Maven installation...\n');
try {
    const mavenVersion = execSync('mvn --version', { encoding: 'utf8' });
    console.log('   ✅ Maven found:', mavenVersion.split('\n')[0]);
} catch (e) {
    console.error('   ❌ Maven not found! Please install Maven to run compile test.');
    console.log('\n⚠️  SKIPPING MAVEN COMPILE TEST (Maven not installed)\n');
    console.log('📌 To install Maven: https://maven.apache.org/download.cgi\n');
    process.exit(0);
}

// Run Maven package (includes compile + test)
console.log('\n🔨 Running Maven package (compile + test)...\n');
console.log('   Command: mvn clean package -q');
console.log('   Working directory: ' + testProjectDir);
console.log('   This may take a minute (downloading dependencies + running tests)...\n');

try {
    const output = execSync('mvn clean package -q', {
        cwd: testProjectDir,
        encoding: 'utf8',
        stdio: 'pipe'
    });
    
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║          ✅ ✅ ✅  MAVEN PACKAGE SUCCESSFUL  ✅ ✅ ✅                 ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ All generated Java files compiled successfully');
    console.log('✅ All tests passed');
    console.log('✅ No compilation errors');
    console.log('✅ No syntax errors');
    console.log('✅ All dependencies resolved\n');
    
    // Count generated files
    const countFiles = (dir) => {
        let count = 0;
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            if (entry.isDirectory()) {
                count += countFiles(path.join(dir, entry.name));
            } else if (entry.name.endsWith('.java')) {
                count++;
            }
        });
        return count;
    };
    
    const javaFiles = countFiles(path.join(testProjectDir, 'src'));
    console.log(`📊 Project Statistics:`);
    console.log(`   • Java files: ${javaFiles}`);
    console.log(`   • Templates used: ${templates.length}`);
    console.log(`   • Project size: ${(getDirSize(testProjectDir) / 1024).toFixed(2)} KB\n`);
    
    console.log('🎯 READY TO PACKAGE v1.8.3\n');
    process.exit(0);
    
} catch (e) {
    console.error('╔════════════════════════════════════════════════════════════════════════╗');
    console.error('║             ❌ ❌ ❌  MAVEN PACKAGE FAILED  ❌ ❌ ❌                   ║');
    console.error('╚════════════════════════════════════════════════════════════════════════╝\n');
    
    const errorOutput = e.stdout || e.message;
    console.error('📋 Build/Test Errors:\n');
    console.error(errorOutput);
    console.error('\n⚠️  DO NOT PACKAGE until Maven package succeeds!\n');
    console.error('💡 Tip: Check the generated files in: ' + testProjectDir + '\n');
    process.exit(1);
}

function getDirSize(dirPath) {
    let size = 0;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    files.forEach(file => {
        const filePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            size += getDirSize(filePath);
        } else {
            size += fs.statSync(filePath).size;
        }
    });
    return size;
}
