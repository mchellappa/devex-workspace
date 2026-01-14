import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface AIResponse {
    content: string;
    model: string;
}

export class AIService {
    async callLanguageModel(prompt: string, systemPrompt?: string): Promise<AIResponse> {
        try {
            // Try to get available Copilot models
            const models = await vscode.lm.selectChatModels({ 
                vendor: 'copilot'
            });

            if (models.length === 0) {
                throw new Error('No Copilot model available. Please ensure GitHub Copilot is installed and activated.');
            }

            // Prefer Claude Sonnet if available, otherwise use first available model
            const model = models.find(m => m.family.includes('claude')) || models[0];
            
            logger.info(`Using model: ${model.id} (family: ${model.family})`);

            if (!model) {
                throw new Error('No Copilot model available. Please ensure GitHub Copilot is installed and activated.');
            }

            const messages = [
                vscode.LanguageModelChatMessage.User(systemPrompt || ''),
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let content = '';
            for await (const fragment of response.text) {
                content += fragment;
            }

            logger.info(`AI response received (${content.length} chars)`);

            return {
                content,
                model: model.id
            };
        } catch (error: any) {
            logger.error('AI service error', error);
            
            if (error instanceof vscode.LanguageModelError) {
                vscode.window.showErrorMessage(
                    `AI model error: ${error.message}. Please check your GitHub Copilot subscription.`
                );
            } else {
                vscode.window.showErrorMessage(
                    'Failed to communicate with AI model. Please ensure GitHub Copilot is active.'
                );
            }
            
            throw error;
        }
    }

    async summarizeLLD(lldContent: string): Promise<string> {
        const systemPrompt = `You are an expert software architect. Analyze the following Low-Level Design (LLD) document and provide a concise summary including:
- Main components and their responsibilities
- Key design patterns used
- Integration points and dependencies
- Important technical decisions

Keep the summary clear and actionable for engineers.`;

        const prompt = `Please summarize this LLD document:\n\n${lldContent}`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async parseOpenAPISpec(specContent: string): Promise<string> {
        const systemPrompt = `You are an API design expert. Analyze the following OpenAPI specification and provide a structured summary including:
- API endpoints with HTTP methods
- Request/response schemas
- Authentication requirements
- Key data models

Format the output as markdown for easy reading.`;

        const prompt = `Please analyze this OpenAPI specification:\n\n${specContent}`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async reviewLLDAsArchitect(lldContent: string, focusArea: string): Promise<string> {
        // Special handling for comprehensive completeness reviews
        if (focusArea === 'Code Generation Readiness') {
            return await this.reviewLLDForCodeGenerationReadiness(lldContent);
        }

        if (focusArea === 'API Design Completeness') {
            return await this.reviewLLDForAPICompleteness(lldContent);
        }
        
        if (focusArea === 'Software Engineering Completeness') {
            return await this.reviewLLDForSoftwareEngineeringCompleteness(lldContent);
        }

        const systemPrompt = `You are a Principal Architect with 20+ years of experience reviewing system designs. Your role is to provide constructive, actionable feedback on Low-Level Design documents to help engineering teams deliver production-ready systems.

Focus on:
- Architectural concerns and anti-patterns
- Complexity assessment and simplification opportunities
- Risk identification and mitigation strategies
- Alignment with best practices and industry standards
- Practical recommendations for improvement

Provide feedback that is:
- Specific and actionable
- Balanced (acknowledge strengths, highlight concerns)
- Prioritized (critical issues first)
- Ready to share with engineering teams`;

        const prompt = `Please review this Low-Level Design document from a Principal Architect perspective.

**Focus Area:** ${focusArea}

**LLD Content:**
${lldContent}

Provide a comprehensive architectural review with the following sections:

## 1. Executive Summary
Brief overview of the design and key concerns

## 2. Architectural Assessment
- Strengths of the current design
- Areas of concern
- Complexity analysis

## 3. Key Recommendations
Prioritized list of actionable improvements (Critical, High, Medium priority)

## 4. Risk Analysis
Potential risks and mitigation strategies

## 5. Focus Area Deep Dive: ${focusArea}
Detailed review specific to the focus area

## 6. Questions for the Team
Clarifying questions to address before implementation

Format the review in clear markdown suitable for sharing with the engineering team.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async reviewLLDForSoftwareEngineeringCompleteness(lldContent: string): Promise<string> {
        const systemPrompt = `You are a Principal Engineer with 20+ years of experience in software architecture and design. Your role is to review Low-Level Design documents to ensure they cover ALL essential software engineering aspects for building production-ready systems.

You must check beyond just API design - review error handling, state management, data flow, concurrency, performance, security, monitoring, and operational concerns. Your feedback should be thorough, specific, and actionable.`;

        const prompt = `Review this LLD document for Software Engineering Completeness. Check if it covers all essential aspects for building robust, production-ready systems.

**LLD Content:**
${lldContent}

Provide a comprehensive engineering completeness review with the following sections:

## ✅ Completeness Score
Rate the LLD across all engineering dimensions: Excellent (90-100%) | Good (70-89%) | Needs Work (50-69%) | Incomplete (<50%)

## 🎯 What's Present (Good!)
List all software engineering aspects that are well-documented

## ❌ Critical Missing Information

### Error Handling & Resilience
- [ ] Is error handling strategy defined? (try-catch patterns, error boundaries)
- [ ] Are all possible error scenarios identified and handled?
- [ ] Is retry logic specified for transient failures?
- [ ] Are circuit breaker patterns mentioned for external dependencies?
- [ ] Is graceful degradation strategy defined?
- [ ] Are timeout values specified for operations?
- [ ] Is error logging and monitoring approach defined?

### State Management
- [ ] Is application state management approach clear? (stateless, stateful, session-based)
- [ ] Are state transitions documented?
- [ ] Is state persistence strategy defined? (database, cache, in-memory)
- [ ] Are state consistency requirements specified?
- [ ] Is distributed state management addressed? (for microservices)
- [ ] Are state cleanup/garbage collection mechanisms defined?

### Data Flow & Processing
- [ ] Is data flow through the system clearly documented?
- [ ] Are data transformation steps specified?
- [ ] Is data validation approach defined at each layer?
- [ ] Are input sanitization and output encoding mentioned?
- [ ] Is data serialization/deserialization format specified?
- [ ] Are batch processing vs real-time processing decisions documented?

### Concurrency & Threading
- [ ] Is concurrency model defined? (single-threaded, multi-threaded, async/await)
- [ ] Are race condition scenarios identified and mitigation strategies defined?
- [ ] Is thread safety approach specified for shared resources?
- [ ] Are locking mechanisms and strategies documented?
- [ ] Is deadlock prevention addressed?
- [ ] Are connection pool sizes and thread pool configurations mentioned?

### Transaction Management
- [ ] Is transaction boundary clearly defined?
- [ ] Is transaction isolation level specified?
- [ ] Are rollback scenarios identified?
- [ ] Is distributed transaction approach defined? (2PC, Saga pattern)
- [ ] Are idempotency requirements specified?
- [ ] Is eventual consistency vs strong consistency decision documented?

### Performance & Scalability
- [ ] Are performance requirements/SLAs defined? (response time, throughput)
- [ ] Are scalability strategies mentioned? (horizontal, vertical)
- [ ] Is caching strategy defined? (what, where, TTL, invalidation)
- [ ] Are database query optimization approaches mentioned?
- [ ] Is load balancing approach specified?
- [ ] Are resource limits defined? (memory, CPU, connections)
- [ ] Are bottlenecks identified and mitigation strategies provided?

### Security Beyond Authentication
- [ ] Is data encryption approach defined? (at rest, in transit)
- [ ] Are input validation rules comprehensive?
- [ ] Is SQL injection prevention mentioned?
- [ ] Is XSS/CSRF protection addressed?
- [ ] Are secrets management approach defined? (API keys, passwords)
- [ ] Is rate limiting/throttling strategy specified?
- [ ] Are audit logging requirements defined?
- [ ] Is PII/sensitive data handling approach clear?

### Logging & Monitoring
- [ ] Is logging strategy defined? (what to log, log levels, format)
- [ ] Are correlation IDs mentioned for distributed tracing?
- [ ] Are monitoring metrics defined? (what to measure)
- [ ] Are alerting thresholds specified?
- [ ] Is health check endpoint defined?
- [ ] Are metrics collection approach mentioned? (APM tools)
- [ ] Is log retention policy specified?

### Configuration Management
- [ ] Is configuration strategy defined? (environment-specific configs)
- [ ] Are configuration sources identified? (files, env vars, config server)
- [ ] Is feature flag approach mentioned?
- [ ] Are configuration validation mechanisms defined?
- [ ] Is dynamic configuration reload capability addressed?

### Dependency Management
- [ ] Are all external dependencies identified?
- [ ] Is dependency version management approach defined?
- [ ] Are fallback mechanisms for dependency failures specified?
- [ ] Is service discovery approach mentioned? (for microservices)
- [ ] Are API contracts with dependencies documented?

### Testing Strategy
- [ ] Are unit testing boundaries defined?
- [ ] Is integration testing approach specified?
- [ ] Are test data management strategies defined?
- [ ] Is mocking/stubbing approach for external dependencies mentioned?
- [ ] Are performance testing scenarios identified?
- [ ] Is chaos engineering/failure testing mentioned?

### Deployment & Operations
- [ ] Is deployment strategy defined? (blue-green, canary, rolling)
- [ ] Are database migration strategies specified?
- [ ] Is rollback procedure documented?
- [ ] Are backup and recovery procedures defined?
- [ ] Is disaster recovery approach mentioned?
- [ ] Are maintenance window requirements specified?

### Data Consistency & Integrity
- [ ] Are data consistency requirements defined?
- [ ] Is data validation at all layers specified?
- [ ] Are referential integrity rules documented?
- [ ] Is data deduplication approach mentioned?
- [ ] Are data archival/purging strategies defined?

## ⚠️ Unclear or Ambiguous Information
Aspects that are mentioned but lack sufficient detail

## 💡 Recommendations for LLD Enhancement
Specific suggestions to make this LLD production-ready:

### High Priority
(Critical items that could cause production issues)

### Medium Priority
(Important for maintainability and quality)

### Low Priority (Nice to Have)
(Enhancements for future consideration)

## 📝 Required Actions for Engineer
Detailed checklist of specific updates needed:

**Error Handling:**
- [ ] Specific action items

**State Management:**
- [ ] Specific action items

**Performance:**
- [ ] Specific action items

**Security:**
- [ ] Specific action items

**Operations:**
- [ ] Specific action items

## 🎓 Best Practice Recommendations
Industry standard practices to consider:
- Clean architecture principles
- SOLID principles adherence
- 12-factor app methodology
- Microservices patterns (if applicable)
- Domain-driven design concepts
- Cloud-native patterns

## 🚦 Is This LLD Production-Ready?

**Final Verdict:** YES / NO / PARTIAL

- **Error Handling:** [Ready/Not Ready] - [explanation]
- **State Management:** [Ready/Not Ready] - [explanation]
- **Performance:** [Ready/Not Ready] - [explanation]
- **Security:** [Ready/Not Ready] - [explanation]
- **Monitoring:** [Ready/Not Ready] - [explanation]
- **Operations:** [Ready/Not Ready] - [explanation]

**TOP 3 BLOCKERS to address before implementation:**
1. [Critical blocker 1]
2. [Critical blocker 2]
3. [Critical blocker 3]

If PARTIAL or NO, the engineer should address these blockers before proceeding to implementation.

Format the entire review in clear markdown with checkboxes, specific examples, and actionable recommendations.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async reviewLLDForAPICompleteness(lldContent: string): Promise<string> {
        const systemPrompt = `You are a Senior API Architect specializing in RESTful API design and code generation. Your role is to review Low-Level Design documents to ensure they contain ALL necessary details for:
1. Generating complete OpenAPI 3.0 specifications
2. Generating production-ready Spring Boot code

You must be thorough and specific, identifying exactly what's missing or unclear. Your feedback should enable engineers to update their LLD so that automated code generation can succeed.`;

        const prompt = `Review this LLD document for API Design Completeness. Check if it has all necessary details for OpenAPI spec generation and Spring Boot code generation.

**LLD Content:**
${lldContent}

Provide a detailed completeness review with the following sections:

## ✅ Completeness Score
Rate the LLD readiness for code generation: Ready (90-100%) | Nearly Ready (70-89%) | Needs Work (50-69%) | Incomplete (<50%)

## 🎯 What's Present (Good!)
List all API design elements that are well-documented

## ❌ Critical Missing Information
Details that MUST be added before code generation can succeed:

### Endpoint Details
- [ ] Are all HTTP methods specified? (GET, POST, PUT, PATCH, DELETE)
- [ ] Are all URL paths clearly defined?
- [ ] Are path parameters identified and typed?
- [ ] Are query parameters defined with types and whether required/optional?
- [ ] Are request headers specified (especially for authentication)?

### Request/Response Models
- [ ] Are all request body schemas defined with field names and types?
- [ ] Are all response body schemas defined with field names and types?
- [ ] Are required vs optional fields clearly marked?
- [ ] Are data types specific? (string, integer, boolean, array, object, etc.)
- [ ] Are field constraints specified? (min/max length, patterns, enums, ranges)
- [ ] Are date/time formats specified? (date, date-time, timestamp)
- [ ] Are nested objects fully defined?

### Status Codes & Error Handling
- [ ] Are all success HTTP status codes specified? (200, 201, 204)
- [ ] Are all error status codes defined? (400, 401, 403, 404, 409, 500)
- [ ] Is the error response format specified?
- [ ] Are validation error messages described?

### Security & Authentication
- [ ] Is the authentication method specified? (JWT, OAuth2, API Key, Basic Auth)
- [ ] Are authorization rules defined? (who can access which endpoints)
- [ ] Are security headers documented?

### Pagination & Filtering (for list endpoints)
- [ ] Are pagination parameters defined? (page, size, limit, offset)
- [ ] Are sorting parameters specified?
- [ ] Are filtering options documented?
- [ ] Is the paginated response format defined?

### Data Validation Rules
- [ ] Are field validation rules complete? (required, min, max, pattern, format)
- [ ] Are business validation rules specified?
- [ ] Are unique constraints identified?
- [ ] Are referential integrity rules defined?

### Technical Implementation Details
- [ ] Is the database schema defined or at least entity relationships?
- [ ] Are table names and column names specified?
- [ ] Is the package/namespace structure mentioned?
- [ ] Are external dependencies or integrations documented?

## ⚠️ Unclear or Ambiguous Information
Details that are mentioned but need clarification

## 💡 Recommendations for LLD Enhancement
Specific suggestions to make this LLD code-generation ready

## 📝 Required Actions for Engineer
Checklist of specific updates needed in the LLD:
- [ ] Action 1
- [ ] Action 2
- [ ] Action 3
(etc.)

## 🎓 Best Practice Suggestions
Optional improvements following REST API standards:
- Resource naming conventions (plural nouns, lowercase, hyphen-separated)
- Proper use of HTTP methods (idempotent operations)
- Versioning strategy (/api/v1/...)
- HATEOAS links (if applicable)
- API documentation standards

## 🚦 Can We Generate Code?
**Final Verdict:** YES / NO / PARTIAL

- **OpenAPI Spec Generation:** [Ready/Not Ready] - [explanation]
- **Spring Boot Code Generation:** [Ready/Not Ready] - [explanation]

If NO or PARTIAL, list the TOP 3 blockers that must be resolved first.

Format the entire review in clear markdown with checkboxes and specific file references.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async generateSpringBootCode(
        projectName: string,
        packageName: string,
        openApiSpec: string,
        lldSummary?: string
    ): Promise<string> {
        const systemPrompt = `You are a Principal Engineer expert in Spring Boot development. Generate production-ready Spring Boot code following best practices including:
- Clean architecture with proper layering (Controller, Service, Repository)
- Proper validation and error handling
- DTOs with MapStruct
- Comprehensive documentation
- Unit test examples`;

        const prompt = `Generate Spring Boot project structure for:
Project: ${projectName}
Package: ${packageName}
${lldSummary ? `\nLLD Summary:\n${lldSummary}\n` : ''}
OpenAPI Specification:
${openApiSpec}

Provide the main class names, package structure, and key code snippets.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async reviewCode(codeFiles: Array<{ path: string; content: string; language: string }>, projectType: string, projectPath: string): Promise<string> {
        const systemPrompt = `You are a Principal Engineer with 20+ years of experience in software development. Your role is to perform comprehensive code reviews that are:

**Principles:**
- Constructive and educational
- Focused on maintainability, scalability, and reliability
- Balanced (acknowledge good practices, identify improvements)
- Actionable with specific recommendations
- Security-conscious
- Performance-aware

**Review Dimensions:**
1. Code Quality & Best Practices
2. Architecture & Design Patterns
3. Error Handling & Resilience
4. Security Vulnerabilities
5. Performance Considerations
6. Testing Strategy
7. Documentation & Readability
8. Maintainability & Technical Debt

Your review should be honest yet supportive, helping the team grow while ensuring production-ready code.`;

        // Prepare file summaries (to manage token limits)
        const fileSummaries = codeFiles.map(file => {
            const lines = file.content.split('\n').length;
            const contentPreview = file.content.length > 1000 
                ? file.content.substring(0, 1000) + '\n... (truncated)'
                : file.content;
            
            return `**File:** ${file.path} (${file.language}, ${lines} lines)
\`\`\`${file.language}
${contentPreview}
\`\`\`
`;
        }).join('\n\n');

        const prompt = `Please perform a Principal Engineer code review for this ${projectType} project.

**Project Path:** ${projectPath}
**Files Reviewed:** ${codeFiles.length}

${fileSummaries}

Provide a comprehensive code review with the following sections:

## 🎯 Executive Summary
Brief overview of the codebase health and key findings

## ⭐ Strengths
What the team is doing well

## 🚨 Critical Issues
Issues that must be addressed before production (security, critical bugs, major design flaws)

## ⚠️ High Priority Recommendations
Important improvements for code quality, performance, and maintainability

## 💡 Medium Priority Suggestions
Nice-to-have improvements and best practice alignment

## 🏗️ Architecture & Design Patterns
Assessment of overall architecture, design patterns, and code organization

## 🔒 Security Considerations
Security vulnerabilities and recommendations

## 🚀 Performance Observations
Performance concerns and optimization opportunities

## 🧪 Testing & Quality Assurance
Test coverage assessment and recommendations

## 📚 Documentation & Readability
Code clarity, comments, and documentation

## 🎓 Learning Opportunities
Educational points for the team to consider

## ✅ Action Items
Prioritized checklist of specific tasks

Format the review in markdown, use emojis for visual clarity, and be specific with file names and line references where applicable.`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }

    async generateOpenAPISpec(
        lldContent: string,
        apiInfo: { serviceName: string; version: string; format: 'yaml' | 'json'; includeExamples: boolean; includeSecurity: boolean }
    ): Promise<string> {
        const systemPrompt = `You are an expert API architect specializing in OpenAPI 3.0 specifications. Your role is to create complete, production-ready OpenAPI specs that follow REST API best practices.

**Key Principles:**
- Follow OpenAPI 3.0.3 specification exactly
- Use semantic HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Proper status codes (200, 201, 400, 401, 403, 404, 500, etc.)
- Comprehensive schema definitions with validation rules
- Clear descriptions for all endpoints, parameters, and responses
- Consistent naming conventions (kebab-case for paths, camelCase for properties)
- Include common headers and error responses
- Security schemes when appropriate (Bearer, OAuth2, API Key)

**Best Practices:**
- Versioned API paths (/api/v1/...)
- Pagination for list endpoints (limit, offset, total)
- Filtering and sorting query parameters
- Standard error response format
- Request validation (required fields, formats, patterns)
- Examples for request/response bodies`;

        const examplesNote = apiInfo.includeExamples ? 
            '\n- Include realistic examples for all request and response bodies' : 
            '\n- Do not include examples in the specification';

        const securityNote = apiInfo.includeSecurity ? 
            '\n- Include security definitions (Bearer token authentication is recommended)' :
            '\n- Do not include security definitions';

        const formatNote = apiInfo.format === 'yaml' ? 
            '\n- Output MUST be valid YAML format with proper indentation (2 spaces)' :
            '\n- Output MUST be valid JSON format with proper indentation';

        const prompt = `Generate a complete OpenAPI 3.0.3 specification from the following Low-Level Design document.

**API Information:**
- Service Name: ${apiInfo.serviceName}
- Version: ${apiInfo.version}
- Format: ${apiInfo.format.toUpperCase()}${examplesNote}${securityNote}${formatNote}

**LLD Content:**
${lldContent}

**Note:** The LLD content may include HTML tables with API definitions. Parse these tables carefully to extract endpoint details, parameters, and schemas.

**Instructions:**
1. Analyze the LLD and identify all API endpoints, data models, and business logic
2. Create a complete OpenAPI 3.0.3 specification with:
   - info section (title, description, version, contact)
   - servers section (placeholder for dev/staging/prod)
   - paths section (all API endpoints with operations)
   - components/schemas section (all data models with validation)
   - components/responses section (common responses like 400, 401, 404, 500)${apiInfo.includeSecurity ? '\n   - components/securitySchemes section (authentication methods)\n   - security requirements for protected endpoints' : ''}
3. For each endpoint include:
   - Clear summary and description
   - All parameters (path, query, header)
   - Request body schema with validation rules
   - All possible response codes with schemas
   - Appropriate tags for grouping
4. For each schema include:
   - All properties with types and descriptions
   - Required fields
   - Validation rules (minLength, maxLength, pattern, minimum, maximum, enum)
   - Format specifications (email, date-time, uuid, etc.)
5. Use RESTful conventions:
   - GET for retrieving resources
   - POST for creating resources
   - PUT for full updates
   - PATCH for partial updates
   - DELETE for removing resources
6. Include standard error response format
7. Add pagination support for list endpoints (limit, offset, page)

${apiInfo.format === 'yaml' ? 
'Output the complete OpenAPI specification in YAML format. Do not include markdown code fences or explanations, ONLY the YAML content.' :
'Output the complete OpenAPI specification in JSON format. Do not include markdown code fences or explanations, ONLY the JSON content.'}`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        
        // Clean up the response - remove markdown code fences if present
        let content = response.content.trim();
        
        // Remove markdown code fences
        if (content.startsWith('```')) {
            // Remove first line (```yaml or ```json)
            content = content.substring(content.indexOf('\n') + 1);
            // Remove last line (```)
            if (content.endsWith('```')) {
                content = content.substring(0, content.lastIndexOf('```')).trim();
            }
        }
        
        return content;
    }

    async extractImplementationDetails(lldContent: string, openApiSpec: any): Promise<any> {
        const systemPrompt = `You are an expert software architect who extracts detailed implementation requirements from Low-Level Design documents. Your goal is to produce structured, actionable information that can be used to generate production-ready code with complete business logic, not just TODO placeholders.

You must extract:
1. Complete business logic for each endpoint (step-by-step implementation)
2. Validation rules and error handling
3. Data models with all constraints
4. Service layer logic
5. Repository queries
6. Exception handling strategies`;

        const prompt = `Analyze this Low-Level Design document and OpenAPI specification to extract detailed implementation requirements.

**LLD Content:**
${lldContent}

**OpenAPI Spec:**
${JSON.stringify(openApiSpec, null, 2)}

Extract and structure the following information as JSON:

{
  "entities": [
    {
      "name": "User",
      "description": "Represents a system user",
      "fields": [
        {
          "name": "id",
          "type": "Long",
          "javaType": "Long",
          "nullable": false,
          "primaryKey": true,
          "generated": true,
          "validations": ["@GeneratedValue(strategy = GenerationType.IDENTITY)"]
        },
        {
          "name": "username",
          "type": "String",
          "javaType": "String",
          "nullable": false,
          "unique": true,
          "maxLength": 50,
          "validations": ["@NotBlank", "@Size(min=3, max=50)", "@Pattern(regexp=\"^[a-zA-Z0-9]*$\")"]
        }
      ],
      "relationships": [
        {
          "type": "OneToMany",
          "target": "Order",
          "mappedBy": "user",
          "cascade": ["PERSIST", "MERGE"]
        }
      ]
    }
  ],
  "endpoints": [
    {
      "path": "/api/users/{id}",
      "method": "GET",
      "operationId": "getUserById",
      "description": "Retrieve user by ID",
      "parameters": [
        {"name": "id", "type": "Long", "location": "path", "required": true}
      ],
      "responseType": "UserDTO",
      "businessLogic": [
        "Validate authentication token",
        "Check user has permission to view (self or admin)",
        "Query user from database by ID using userRepository.findById(id)",
        "If not found, throw new UserNotFoundException(\\\"User not found with id: \\\" + id)",
        "Check authorization: if current user is not self and not admin, throw ForbiddenException",
        "Map User entity to UserDTO using userMapper.toDTO(user)",
        "Return UserDTO"
      ],
      "serviceMethodImplementation": "public UserDTO getUserById(Long id) {\\n    log.info(\\\"Fetching user by id: {}\\\", id);\\n    User currentUser = securityService.getCurrentUser();\\n    if (!currentUser.getId().equals(id) && !currentUser.isAdmin()) {\\n        log.warn(\\\"User {} attempted to access user {}\\\", currentUser.getId(), id);\\n        throw new ForbiddenException(\\\"Cannot access other user's information\\\");\\n    }\\n    User user = userRepository.findById(id).orElseThrow(() -> new UserNotFoundException(\\\"User not found with id: \\\" + id));\\n    log.info(\\\"Successfully retrieved user: {}\\\", user.getUsername());\\n    return userMapper.toDTO(user);\\n}",
      "errorHandling": [
        {"exception": "UserNotFoundException", "httpStatus": 404, "message": "User not found"},
        {"exception": "ForbiddenException", "httpStatus": 403, "message": "Cannot access other user's information"},
        {"exception": "UnauthorizedException", "httpStatus": 401, "message": "Authentication required"}
      ],
      "validations": [
        {"field": "id", "rules": ["Must be positive number", "Must exist in database"]}
      ]
    },
    {
      "path": "/api/users",
      "method": "POST",
      "operationId": "createUser",
      "description": "Create new user",
      "requestBody": "CreateUserRequest",
      "responseType": "UserDTO",
      "businessLogic": [
        "Validate all required fields using @Valid annotation",
        "Check username uniqueness: if (userRepository.existsByUsername(request.getUsername())) throw new DuplicateResourceException",
        "Check email uniqueness: if (userRepository.existsByEmail(request.getEmail())) throw new DuplicateResourceException",
        "Validate password strength using passwordValidator.isStrong(password)",
        "Hash password: passwordEncoder.encode(request.getPassword())",
        "Create new User entity and set all fields",
        "Set default role to USER",
        "Set status to ACTIVE",
        "Set createdAt to LocalDateTime.now()",
        "Save user: userRepository.save(user)",
        "Send welcome email asynchronously (don't block if it fails)",
        "Map to UserDTO and return"
      ],
      "serviceMethodImplementation": "@Transactional\\npublic UserDTO createUser(CreateUserRequest request) {\\n    log.info(\\\"Creating new user: {}\\\", request.getUsername());\\n    if (userRepository.existsByUsername(request.getUsername())) {\\n        throw new DuplicateResourceException(\\\"Username already exists\\\");\\n    }\\n    if (userRepository.existsByEmail(request.getEmail())) {\\n        throw new DuplicateResourceException(\\\"Email already exists\\\");\\n    }\\n    if (!passwordValidator.isStrong(request.getPassword())) {\\n        throw new ValidationException(\\\"Password does not meet strength requirements\\\");\\n    }\\n    User user = new User();\\n    user.setUsername(request.getUsername());\\n    user.setEmail(request.getEmail());\\n    user.setPassword(passwordEncoder.encode(request.getPassword()));\\n    user.setFirstName(request.getFirstName());\\n    user.setLastName(request.getLastName());\\n    user.setRole(Role.USER);\\n    user.setStatus(Status.ACTIVE);\\n    user.setCreatedAt(LocalDateTime.now());\\n    user = userRepository.save(user);\\n    log.info(\\\"User created successfully with id: {}\\\", user.getId());\\n    try {\\n        emailService.sendWelcomeEmail(user.getEmail(), user.getFirstName());\\n    } catch (Exception e) {\\n        log.error(\\\"Failed to send welcome email\\\", e);\\n    }\\n    return userMapper.toDTO(user);\\n}",
      "errorHandling": [
        {"exception": "ValidationException", "httpStatus": 400, "message": "Invalid input data"},
        {"exception": "DuplicateResourceException", "httpStatus": 409, "message": "Username or email already exists"}
      ]
    }
  ],
  "dtos": [
    {
      "name": "UserDTO",
      "type": "response",
      "fields": [
        {"name": "id", "type": "Long"},
        {"name": "username", "type": "String"},
        {"name": "email", "type": "String"},
        {"name": "firstName", "type": "String"},
        {"name": "lastName", "type": "String"},
        {"name": "role", "type": "String"},
        {"name": "status", "type": "String"},
        {"name": "createdAt", "type": "LocalDateTime"}
      ],
      "excludeFields": ["password"],
      "mappingNotes": "Never include password field, format timestamps as ISO-8601"
    }
  ],
  "businessRules": [
    "Username and email must be unique across the system",
    "Passwords must be at least 8 characters with uppercase, lowercase, number, and special char",
    "Only admins can delete users",
    "Users with active orders cannot be deleted",
    "Email changes require verification"
  ],
  "repositoryMethods": [
    {
      "name": "existsByUsername",
      "returnType": "boolean",
      "parameters": [{"name": "username", "type": "String"}],
      "query": "boolean existsByUsername(String username);"
    },
    {
      "name": "existsByEmail",
      "returnType": "boolean",
      "parameters": [{"name": "email", "type": "String"}],
      "query": "boolean existsByEmail(String email);"
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. Extract as much implementation detail as possible from the LLD
2. If business logic steps are mentioned in the LLD, capture them exactly
3. If error handling is described, include all scenarios
4. If the LLD lacks detail for an endpoint, use RESTful best practices to infer reasonable implementation
5. Always include proper validation, error handling, and logging
6. Provide actual method implementations, not TODO comments
7. Return ONLY valid JSON, no markdown or explanations`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        
        try {
            // Clean and parse JSON response
            let content = response.content.trim();
            if (content.startsWith('```json')) {
                content = content.substring(content.indexOf('\n') + 1);
            }
            if (content.endsWith('```')) {
                content = content.substring(0, content.lastIndexOf('```')).trim();
            }
            
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to parse implementation details JSON', error);
            logger.info(`Raw response: ${response.content}`);
            throw new Error('Failed to extract structured implementation details from LLD');
        }
    }

    async reviewLLDForCodeGenerationReadiness(lldContent: string): Promise<string> {
        const systemPrompt = `You are a Technical Lead reviewing Low-Level Design documents to ensure they contain ALL the information engineers need to generate production-ready code using the Spring Boot generator.

Your role is to verify that the LLD is complete enough for automatic code generation that produces real implementations, not TODO placeholders.

You must check if the LLD includes:
1. **Complete Data Models** with all fields, types, constraints, and JPA annotations
2. **Step-by-Step Business Logic** for each API endpoint
3. **Error Handling** scenarios for every operation
4. **Validation Rules** with specific patterns and constraints
5. **DTOs** with mapping rules
6. **Repository Methods** required for data access
7. **Security** and authorization rules

Be specific about what's missing and provide actionable guidance.`;

        const prompt = `Review this LLD document to determine if it's ready for production-ready code generation. Engineers will use this LLD with an automated Spring Boot generator. If the LLD lacks detail, the generator will produce TODO placeholders instead of working code.

**LLD Content:**
${lldContent}

Provide a comprehensive Code Generation Readiness Review with the following sections:

## 🎯 Overall Readiness Score

Rate the LLD for code generation: **Ready** | **Needs Minor Improvements** | **Needs Major Improvements** | **Not Ready**

Provide a percentage score (0-100%) indicating how much production-ready code can be generated from this LLD.

---

## ✅ What's Present (Will Generate Working Code)

List all aspects that are well-documented and will result in production-ready generated code:

### Data Models
- [ ] Complete with all required information
- What's present: [list what's documented]

### API Endpoints  
- [ ] Have step-by-step business logic
- What's present: [list which endpoints are complete]

### Error Handling
- [ ] Error scenarios documented
- What's present: [list what's covered]

### Validation Rules
- [ ] Detailed validation constraints
- What's present: [list what's specified]

### DTOs & Mappings
- [ ] Request/response models defined
- What's present: [list what's available]

---

## ❌ What's Missing (Will Generate TODOs)

### CRITICAL MISSING (Without these, code will be incomplete):

#### 📊 Data Models
Check each entity:
- [ ] **Field Definitions**: Does each entity list ALL fields with types (String, Long, Integer, etc.)?
- [ ] **Constraints**: Are constraints specified (unique, nullable, max length)?
- [ ] **JPA Annotations**: Are validation annotations mentioned (@NotBlank, @Size, @Email, etc.)?
- [ ] **Relationships**: Are entity relationships defined (OneToMany, ManyToOne, etc.)?
- [ ] **Default Values**: Are default values specified where needed?

**Missing Details**: [List specific missing information]

**Impact**: Without complete data models, generator will create empty entity classes.

**How to Fix**:
\`\`\`markdown
Add to LLD:

### Entity: User
**Fields**:
- \`id\` (Long): Primary key, auto-generated
  - JPA: @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
- \`username\` (String): Unique, required, max 50 chars
  - Validation: @NotBlank @Size(min=3, max=50) @Pattern(regexp="^[a-zA-Z0-9]*$")
  - JPA: @Column(unique=true, nullable=false, length=50)
- \`email\` (String): Unique, required, valid email format
  - Validation: @NotBlank @Email @Size(max=255)
  - JPA: @Column(unique=true, nullable=false)
[... list all fields ...]
\`\`\`

---

#### 🔄 API Endpoint Business Logic
For each endpoint, check:
- [ ] **Step-by-Step Logic**: Is the business logic broken down into numbered steps?
- [ ] **Database Operations**: Are specific repository methods mentioned?
- [ ] **Conditionals**: Are if/else conditions specified?
- [ ] **Error Scenarios**: Is error handling documented for each step?
- [ ] **Return Values**: Are return types and response data specified?

**Endpoints with Missing Logic**: [List endpoints that lack implementation details]

**Impact**: Without business logic steps, generator will create methods with \`// TODO: Implement\` comments.

**How to Fix**:
\`\`\`markdown
Add to LLD:

### POST /api/users
**Business Logic (Step-by-Step)**:
1. Validate request body using Bean Validation
2. Check username uniqueness: \`if (userRepository.existsByUsername(request.getUsername()))\`
3. If duplicate found: \`throw new DuplicateResourceException("Username already exists")\`
4. Check email uniqueness: \`if (userRepository.existsByEmail(request.getEmail()))\`
5. If duplicate found: \`throw new DuplicateResourceException("Email already exists")\`
6. Validate password strength using passwordValidator
7. Hash password: \`passwordEncoder.encode(request.getPassword())\`
8. Create new User entity with all fields
9. Set default role = USER, status = ACTIVE
10. Set createdAt = LocalDateTime.now()
11. Save: \`userRepository.save(user)\`
12. Send welcome email asynchronously (don't block if fails)
13. Map to UserDTO and return with HTTP 201

**Service Method Implementation** (optional but highly recommended):
\`\`\`java
@Transactional
public UserDTO createUser(CreateUserRequest request) {
    log.info("Creating user: {}", request.getUsername());
    if (userRepository.existsByUsername(request.getUsername())) {
        throw new DuplicateResourceException("Username already exists");
    }
    if (userRepository.existsByEmail(request.getEmail())) {
        throw new DuplicateResourceException("Email already exists");
    }
    User user = new User();
    user.setUsername(request.getUsername());
    user.setEmail(request.getEmail());
    user.setPassword(passwordEncoder.encode(request.getPassword()));
    user.setRole(Role.USER);
    user.setStatus(Status.ACTIVE);
    user.setCreatedAt(LocalDateTime.now());
    user = userRepository.save(user);
    emailService.sendWelcomeEmailAsync(user.getEmail());
    return userMapper.toDTO(user);
}
\`\`\`
\`\`\`

---

#### ⚠️ Error Handling
Check if documented:
- [ ] **Custom Exceptions**: Are specific exception classes defined?
- [ ] **HTTP Status Codes**: Is each error mapped to a status code (404, 409, 400, etc.)?
- [ ] **Error Messages**: Are user-friendly messages specified?
- [ ] **Error Response Format**: Is the JSON error structure defined?

**Missing Error Scenarios**: [List what's not covered]

**How to Fix**:
\`\`\`markdown
Add to LLD:

### Error Handling

**Custom Exceptions**:
- \`UserNotFoundException extends RuntimeException\` → HTTP 404
- \`DuplicateResourceException extends RuntimeException\` → HTTP 409
- \`ValidationException extends RuntimeException\` → HTTP 400
- \`ForbiddenException extends RuntimeException\` → HTTP 403

**Error Response Format**:
\`\`\`json
{
  "timestamp": "2026-01-10T10:30:00Z",
  "status": 404,
  "error": "Not Found",
  "message": "User not found with id: 123",
  "path": "/api/users/123"
}
\`\`\`

**Endpoint Error Handling**:
- UserNotFoundException → HTTP 404, message: "User not found with id: {id}"
- DuplicateResourceException → HTTP 409, message: "Username/email already exists"
\`\`\`

---

#### ✔️ Validation Rules
Check if specified:
- [ ] **Field Validations**: Are Bean Validation annotations listed (@NotBlank, @Size, @Email)?
- [ ] **Custom Validations**: Are business-specific rules defined?
- [ ] **Patterns**: Are regex patterns provided where needed?
- [ ] **Error Messages**: Are validation error messages customized?

**Missing Validations**: [List fields without validation rules]

**How to Fix**:
\`\`\`markdown
Add to LLD:

### CreateUserRequest Validation
- username: @NotBlank @Size(min=3, max=50) @Pattern(regexp="^[a-zA-Z0-9]*$")
- email: @NotBlank @Email @Size(max=255)
- password: @NotBlank @Size(min=8, max=100)
- firstName: @NotBlank @Size(max=100)
- lastName: @NotBlank @Size(max=100)

**Custom Password Validation**:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter  
- At least 1 digit
- At least 1 special character (!@#$%^&*)
\`\`\`

---

#### 📦 DTOs and Mappings
Check if defined:
- [ ] **Request DTOs**: Are input models documented with all fields?
- [ ] **Response DTOs**: Are output models documented?
- [ ] **Mapping Rules**: Is it clear which entity fields map to DTO fields?
- [ ] **Excluded Fields**: Are sensitive fields (like passwords) marked for exclusion?

**Missing DTOs**: [List which DTOs need to be defined]

**How to Fix**:
\`\`\`markdown
Add to LLD:

### DTOs

#### UserDTO (Response)
\`\`\`json
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
\`\`\`

**Mapping Rules**:
- Include all User entity fields EXCEPT password
- Format createdAt/updatedAt as ISO-8601
- Use MapStruct for mapping

#### CreateUserRequest (Input)
All fields required:
- username (String): @NotBlank @Size(min=3, max=50)
- email (String): @NotBlank @Email
- password (String): @NotBlank @Size(min=8)
- firstName (String): @NotBlank
- lastName (String): @NotBlank
\`\`\`

---

#### 🗄️ Repository Methods
Check if specified:
- [ ] **Custom Queries**: Are non-standard queries documented?
- [ ] **Method Signatures**: Are method names and parameters specified?
- [ ] **Return Types**: Are return types clear (Optional, List, boolean)?

**Missing Repository Methods**: [List what needs to be added]

**How to Fix**:
\`\`\`markdown
Add to LLD:

### UserRepository extends JpaRepository<User, Long>

**Custom Methods**:
\`\`\`java
boolean existsByUsername(String username);
boolean existsByEmail(String email);
Optional<User> findByUsername(String username);
Optional<User> findByEmail(String email);
List<User> findByStatus(Status status);
\`\`\`
\`\`\`

---

## 📋 Code Generation Readiness Checklist

Before using the Spring Boot generator, ensure your LLD includes:

**Data Models**:
- [ ] All entities with complete field definitions
- [ ] Field types (String, Long, Integer, etc.)
- [ ] Constraints (unique, nullable, max length)
- [ ] JPA annotations (@Id, @Column, @ManyToOne, etc.)
- [ ] Bean Validation annotations (@NotBlank, @Size, @Email, etc.)
- [ ] Relationships between entities
- [ ] Default values where applicable

**API Endpoints** (for EACH endpoint):
- [ ] Complete step-by-step business logic
- [ ] Specific repository method calls
- [ ] Conditional logic (if/else scenarios)
- [ ] Error handling for each step
- [ ] Authorization checks
- [ ] Return values and HTTP status codes
- [ ] Ideally: actual Java service method implementation

**Error Handling**:
- [ ] Custom exception class definitions
- [ ] HTTP status code mappings
- [ ] Error messages for each scenario
- [ ] Error response JSON format
- [ ] Global exception handler structure

**Validation**:
- [ ] Bean Validation annotations for all DTOs
- [ ] Custom validation rules
- [ ] Regex patterns where needed
- [ ] Password strength requirements
- [ ] Business rule validations

**DTOs**:
- [ ] Request DTO definitions with all fields
- [ ] Response DTO definitions with all fields
- [ ] Mapping rules (entity ↔ DTO)
- [ ] Excluded fields (e.g., passwords)
- [ ] Example JSON structures

**Repository**:
- [ ] Custom query method signatures
- [ ] Method return types
- [ ] Query parameters

**Security**:
- [ ] Authentication requirements
- [ ] Authorization rules (who can access what)
- [ ] Password encoding strategy
- [ ] JWT/token handling

---

## 🎓 Recommendations for Engineers

### Immediate Actions Required:
1. [List specific sections to add/enhance]
2. [List specific details to clarify]
3. [List specific business logic to document]

### Best Practices to Follow:
- Be explicit: "Check username uniqueness" → "if (userRepository.existsByUsername(request.getUsername())) throw..."
- Include error paths: Document what happens when operations fail
- Provide examples: Show sample request/response JSON
- Think like a developer: What questions would you have when implementing this?

### Reference Example:
See \`examples/complete-user-management-lld.md\` for a complete LLD that generates 100% production-ready code with no TODOs.

See \`docs/LLD_REQUIREMENTS.md\` for detailed guidance on what to include in your LLD.

---

## 📊 Summary

**Current State**: [Brief summary of what's present and what's missing]

**Code Generation Outcome**: 
- **X%** of code will be production-ready
- **Y%** will be TODO placeholders requiring manual implementation

**Recommendation**: [Ready to generate | Add missing details first | Needs significant enhancement]

**Estimated Time to Complete LLD**: [X hours to add missing information]

---

*💡 Remember: The more detailed your LLD, the more production-ready code the generator will produce. Invest time in documentation now to save development time later!*`;

        const response = await this.callLanguageModel(prompt, systemPrompt);
        return response.content;
    }
}

