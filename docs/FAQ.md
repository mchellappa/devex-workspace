# Frequently Asked Questions

## General

### What is DevEx AI Assistant?

DevEx AI Assistant is an internal VS Code extension that uses GitHub Copilot to generate enterprise-grade Spring Boot microservices from design documents (LLD) and API specifications (OpenAPI). It accelerates project scaffolding while enforcing principal engineer-level standards.

### Who should use this?

- Backend engineers building Spring Boot microservices
- Teams adopting microservices architecture
- Engineers who want to focus on business logic, not boilerplate
- Teams measuring AI productivity impact

### How much time does it actually save?

**Typical savings**: 4-8 hours per project

**Breakdown**:
- Manual setup: 6-8 hours (project structure, dependencies, controllers, services, configs, tests)
- AI-assisted: 15-30 minutes (generation + review)
- **Net savings**: 5.5-7.5 hours per project

## Installation & Setup

### Do I need a GitHub Copilot license?

**Yes.** The extension uses GitHub Copilot via VS Code's Language Model API. You need an active Copilot subscription (Individual, Business, or Enterprise).

### Do I need any API keys?

**No!** The extension automatically uses your existing Copilot license. No additional API keys, tokens, or configurations needed.

### How do I install the extension?

**Current (Internal Only)**:
1. Download `.vsix` from internal GitHub releases
2. VS Code → Extensions → `...` → "Install from VSIX..."
3. Restart VS Code

**Future (Marketplace)**:
Eventually will be available in VS Code Marketplace (pending approval).

### What are the prerequisites?

**Required**:
- VS Code 1.85.0+
- GitHub Copilot extension (with active license)

**For Running Generated Projects**:
- Java 21+
- Maven 3.8+ or Gradle 8.0+

### Can I use this on company laptops with restricted permissions?

Yes, as long as:
1. You can install VS Code extensions (`.vsix` files)
2. GitHub Copilot is approved/installed
3. You have Java and Maven/Gradle

No admin rights needed after initial setup.

## Using the Extension

### What inputs do I need?

**Required**:
- OpenAPI specification (YAML or JSON, version 3.0+)

**Optional but Recommended**:
- Low-Level Design (LLD) document (Markdown)
- Sequence diagrams (in LLD)

### Can I generate a project without an OpenAPI spec?

Not currently. The OpenAPI spec is used to:
- Generate REST controllers
- Define endpoints and operations
- Create DTOs and request/response models

**Workaround**: Create a minimal OpenAPI spec with your main endpoints.

### What if my OpenAPI spec is incomplete?

The extension will:
1. Validate the spec
2. Show validation errors
3. Generate what it can from valid parts

**Recommendation**: Start with a complete spec. Use https://editor.swagger.io to validate first.

### Can I customize the generated code?

**Yes!** The generated project is 100% yours:
- Modify any file
- Add business logic
- Change configurations
- Refactor as needed

Think of it as a principal engineer-level starter template.

### What Spring Boot version is used?

**Default**: 3.4.1 (latest stable)

**Configurable**: Settings → `devex-ai-assistant.springBoot.version`

### What Java version is required?

**Default**: Java 21 (LTS)

**Configurable**: Settings → `devex-ai-assistant.java.version`

**Supported**: Java 17, 21 (LTS versions)

### Maven or Gradle?

**Default**: Maven

**Configurable**: Settings → `devex-ai-assistant.buildTool`

Both generate functionally equivalent projects.

### What libraries are included?

**Always Included**:
- Spring Boot Starter Web
- Spring Boot Starter Data JPA
- Spring Boot Starter Validation
- Spring Boot Starter Actuator
- Lombok
- MapStruct
- SpringDoc OpenAPI (Swagger UI)
- H2 Database (development)
- Spring Boot Starter Test

**Add Your Own**:
Edit `pom.xml` or `build.gradle` after generation.

### Can I add authentication/security?

Not automatically generated. **Add manually**:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        return http
            .oauth2ResourceServer(oauth2 -> oauth2.jwt())
            .authorizeHttpRequests(auth -> auth
                .anyRequest().authenticated())
            .build();
    }
}
```

Add dependency:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

### How do I change the database from H2?

**PostgreSQL Example**:

1. **Add dependency** (`pom.xml`):
```xml
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
</dependency>
```

2. **Update** `application.yml`:
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: dbuser
    password: dbpass
  jpa:
    database-platform: org.hibernate.dialect.PostgreSQLDialect
```

3. **Remove H2** (optional):
Remove `com.h2database:h2` from dependencies.

## Templates & Customization

### Where do deployment templates come from?

**Location**: `<extension-install-dir>/templates/`

**Folders**:
- `kubernetes/` - K8s manifests
- `docker/` - Dockerfiles, docker-compose
- `ci-cd/` - GitHub Actions, Azure Pipelines, etc.

### Can I add my own templates?

**Yes!** Add files to the template folders:

1. Find extension install directory:
   - Windows: `%USERPROFILE%\.vscode\extensions\yourorg.devex-ai-assistant-*`
   - Mac/Linux: `~/.vscode/extensions/yourorg.devex-ai-assistant-*`

2. Add files to `templates/kubernetes/`, `templates/docker/`, etc.

3. Use Handlebars syntax for dynamic values:
```yaml
name: {{projectName}}
image: {{artifactId}}:{{version}}
```

4. Engineers can insert via `DevEx: Insert Deployment Template`

### What template variables are available?

Common variables:
- `{{projectName}}` - Project display name
- `{{artifactId}}` - Artifact ID (usually lowercase-with-dashes)
- `{{groupId}}` - Maven group ID
- `{{packageName}}` - Java package name
- `{{version}}` - Project version
- `{{javaVersion}}` - Java version
- `{{springBootVersion}}` - Spring Boot version

See `src/services/springBootGenerator.ts` for full list.

### Can I modify the Spring Boot templates?

**Advanced Users Only**: Yes, modify files in:
```
<extension-dir>/templates/springboot/
```

**Caution**: Updates will overwrite custom changes. Consider forking the extension.

## Productivity & Telemetry

### What data is collected?

**Local Storage Only** (`~/.devex-ai-assistant/metrics.json`):
- Timestamp of project generation
- Project name (not code!)
- Manual time estimate
- Actual time taken
- Feature usage counts
- User feedback ratings

**NOT Collected**:
- Source code
- API keys or secrets
- Personal information
- Network requests (all local)

### Can I disable telemetry?

**Yes**. Settings → `devex-ai-assistant.telemetry.enabled` → `false`

**Note**: Disables productivity dashboard and ROI calculations.

### Where is telemetry data stored?

**Local file**: `~/.devex-ai-assistant/metrics.json`

**No cloud transmission**. Data never leaves your machine unless you manually export it.

### How do I export metrics for reporting?

1. Open Productivity Dashboard: `DevEx: View Productivity Dashboard`
2. Click "Export Data" button
3. CSV file saved to Downloads folder
4. Share with manager/leadership

### How is ROI calculated?

```
ROI = (Time Saved × Hourly Rate) - Tool Cost

Example:
- Projects generated: 10
- Time saved per project: 6 hours
- Hourly rate: $75
- Tool cost: $0 (uses existing Copilot)

ROI = (10 × 6 × $75) - $0 = $4,500 saved
```

**Note**: ROI assumes manual time estimates are accurate.

## Troubleshooting

### "GitHub Copilot is not available"

**Causes**:
1. Copilot extension not installed
2. No active Copilot subscription
3. Not signed in to GitHub
4. Copilot disabled in workspace

**Solutions**:
1. Install Copilot extension from marketplace
2. Check subscription: https://github.com/settings/copilot
3. Command Palette → "GitHub: Sign In"
4. Check workspace settings (no Copilot restrictions)
5. Restart VS Code

### "Failed to parse OpenAPI specification"

**Causes**:
1. Invalid YAML/JSON syntax
2. Not OpenAPI 3.0+ format
3. Missing required fields

**Solutions**:
1. Validate at https://editor.swagger.io
2. Check OpenAPI version in spec:
```yaml
openapi: 3.0.0  # Must be 3.x
```
3. Ensure `paths` section exists
4. Review error message for specifics

### Generated project won't compile

**Common Issues**:

**Wrong Java Version**:
```bash
java -version  # Must be 21+ (or configured version)
```

**Maven/Gradle Issues**:
```bash
# Clear cache
mvn clean install -U

# or
gradle clean build --refresh-dependencies
```

**Proxy/Network Issues**:
Configure Maven/Gradle proxy settings.

**Missing Dependencies**:
Check `pom.xml` or `build.gradle` for repository configuration.

### Application won't start

**Port Already in Use**:
```yaml
# Change in application.yml
server:
  port: 8081
```

**Database Connection**:
Check H2 console or update datasource configuration.

**Missing Configuration**:
Review application.yml for required properties.

### Templates not showing in "Insert Deployment Template"

**Causes**:
1. Template files not in correct folder
2. No template files exist
3. Extension needs reload

**Solutions**:
1. Check `<extension-dir>/templates/kubernetes/`, etc.
2. Add at least one `.yml` or `.yaml` file
3. Reload VS Code: Command Palette → "Developer: Reload Window"

### Extension update check fails

**Causes**:
1. GitHub URL not configured
2. Network/proxy issues
3. Private repo requires authentication

**Solutions**:
1. Settings → `devex-ai-assistant.updates.githubReleasesUrl`
2. Check network connectivity
3. Ensure GitHub access (VPN if required)

## Best Practices

### Should I commit generated code as-is?

**No.** Always review and customize:
1. Add business logic to services
2. Implement data models
3. Configure database connections
4. Add authentication/authorization
5. Write integration tests
6. Review security settings

**Treat as 80% foundation, not 100% production-ready.**

### How should I estimate manual time?

Be realistic:
- Project setup: 1-2 hours
- Dependencies & config: 30 min
- Controller generation: 2-3 hours
- Service/repository layers: 1-2 hours
- Exception handling: 30 min
- Tests: 1-2 hours
- Documentation: 30 min

**Typical**: 6-8 hours for a new microservice

### Should I use this for every project?

**Good Fit**:
- New Spring Boot microservices
- REST APIs with OpenAPI specs
- Standardized architecture

**Not Ideal**:
- Existing projects (migration)
- Non-Spring Boot frameworks
- Highly customized architectures
- Proof of concepts (may be overkill)

### How do I share this with my team?

**Internal Rollout**:
1. Pilot with 2-3 engineers
2. Gather feedback and metrics
3. Refine templates for your org
4. Present ROI to management
5. Roll out to wider team
6. Track collective productivity gains

See [docs/PILOT_ROLLOUT.md](./PILOT_ROLLOUT.md) for detailed plan.

## Administration & Governance

### How do I update the extension?

**Automatic Check**:
Extension checks for updates on VS Code startup (if enabled).

**Manual Update**:
1. Download new `.vsix` from releases
2. Install from VSIX (overwrites old version)
3. Reload VS Code

### How do I distribute to my team?

**Current**:
1. Upload `.vsix` to internal GitHub releases
2. Share download link with team
3. Engineers install manually

**Future**:
- Internal extension marketplace
- Auto-update mechanism

### Can I restrict who uses this?

**License Level**: Anyone with VS Code + Copilot can use it

**Organizational Control**:
- Distribute only to approved teams
- Private GitHub repo (access control)
- Monitor via shared metrics

### How do I measure team-wide impact?

**Aggregate Metrics**:
1. Each engineer exports their dashboard data (CSV)
2. Combine in spreadsheet
3. Calculate:
   - Total projects generated
   - Total time saved
   - Team ROI

**Example Report**:
```
Q1 2025 DevEx AI Assistant Impact
Team: Backend Engineering (12 engineers)
Projects Generated: 45
Average Time Saved: 6.2 hours/project
Total Time Saved: 279 hours
Hourly Rate: $75
Quarterly ROI: $20,925 saved
```

### How do I customize for our organization?

**Extension Level** (requires forking):
- Modify default settings
- Add company-specific templates
- Customize branding/naming
- Add internal integrations

**Template Level** (no code changes):
- Add deployment templates
- Kubernetes manifests with company standards
- CI/CD pipelines
- Docker configurations

### Can this be used outside our company?

**License**: Internal use only (currently)

**Future**: May be open-sourced or published to marketplace with different licensing.

## Roadmap & Feature Requests

### What features are coming next?

**v1.1** (Q1 2025):
- Add REST Endpoint (incremental updates)
- Enhanced error handling

**v1.2** (Q2 2025):
- Database migration scripts (Flyway/Liquibase)
- Enhanced test generation

**v1.3** (Q2 2025):
- API versioning support
- GraphQL support

**v2.0** (Q3 2025):
- Multi-module projects
- Service-to-service communication
- gRPC support

### How do I request a feature?

1. **Slack**: Post in #devex-ai-assistant
2. **GitHub**: Open issue with `enhancement` label
3. **Email**: devex-team@yourcompany.com

Include:
- Use case description
- Expected behavior
- How it saves time/improves quality

### Can I contribute code?

**Yes!** Internal contributors welcome.

See [docs/CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Coding standards
- Pull request process

## Support

### Where do I get help?

**Self-Service**:
1. This FAQ
2. [README.md](../README.md)
3. [Quick Start Guide](./QUICK_START.md)

**Community**:
- Slack: #devex-ai-assistant
- GitHub Discussions

**Direct Support**:
- Email: devex-team@yourcompany.com
- Office hours: Tuesdays 2-3 PM

### How do I report a bug?

**GitHub Issue**:
1. Go to internal repo
2. Click "Issues" → "New Issue"
3. Select "Bug Report" template
4. Provide:
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/logs
   - Extension version
   - VS Code version

**Urgent Bugs**: Slack #devex-ai-assistant with `@devex-team`

### Is there training available?

**Self-Paced**:
- Quick Start Guide (10 minutes)
- Video walkthrough (internal wiki)

**Live Training**:
- Monthly onboarding sessions
- Team workshops (on request)

**Contact**: devex-team@yourcompany.com to schedule

---

## Still Have Questions?

**Ask in Slack**: #devex-ai-assistant

**Email Us**: devex-team@yourcompany.com

**Open a Discussion**: GitHub Discussions in internal repo

We're here to help you succeed! 🚀

---

*Last Updated: January 2025*
