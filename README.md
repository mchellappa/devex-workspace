# DevEx AI Assistant Extension

🚀 **AI-Powered Spring Boot Project Generator for Internal Development Teams**

## Overview

The DevEx AI Assistant is a VS Code extension that leverages GitHub Copilot to generate enterprise-grade Spring Boot microservices from Low-Level Design (LLD) documents and OpenAPI specifications. Built for internal development teams to accelerate project scaffolding while maintaining principal engineer-level standards.

## Features

### 🎯 Core Capabilities

- **AI-Powered Project Generation**: Generate complete Spring Boot projects from LLD + OpenAPI specs
- **Intelligent Code Analysis**: Summarize LLD documents and parse OpenAPI specifications using Copilot
- **Enterprise Templates**: Insert pre-approved deployment configurations (Kubernetes, Docker, CI/CD)
- **Productivity Tracking**: Built-in telemetry to measure time savings and ROI
- **Standards Enforcement**: All generated code follows principal engineer-level best practices

### 📊 Productivity Dashboard

Track your team's AI-enabled productivity:
- Time saved per engineer
- Projects generated count
- ROI calculations for executive reporting
- Feature usage analytics

### 🛠️ Commands

Access all commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

1. **Generate Spring Boot Project** - Main feature: create complete microservice
2. **Summarize LLD** - AI analysis of design documents
3. **Parse OpenAPI Spec** - Validate and analyze API specifications
4. **Insert Deployment Template** - Add Kubernetes/Docker/CI-CD files
5. **Add REST Endpoint** - Quick endpoint scaffolding (coming soon)
6. **View Productivity Dashboard** - See metrics and ROI
7. **Check for Updates** - Stay current with internal releases

## Prerequisites

- **VS Code**: Version 1.85.0 or higher
- **GitHub Copilot**: Active subscription (uses existing Copilot license)
- **JDK**: Java 21 (for running generated projects)
- **Maven/Gradle**: For building generated projects

## Installation

### Internal Distribution (Current)

1. Download the latest `.vsix` file from your internal GitHub releases page
2. In VS Code, go to Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu → "Install from VSIX..."
4. Select the downloaded `.vsix` file
5. Restart VS Code

The extension will automatically check for updates from the configured internal repository.

## Quick Start

### Generate Your First Spring Boot Project

1. **Prepare Your Inputs**:
   - LLD document (Markdown format with sequence diagrams)
   - OpenAPI specification (YAML or JSON)

2. **Run the Generator**:
   - Open Command Palette: `Ctrl+Shift+P`
   - Type: `DevEx: Generate Spring Boot Project`
   - Follow the prompts:
     - Estimate manual development time (for ROI tracking)
     - Choose output directory
     - Select OpenAPI spec file
     - (Optional) Select LLD document
     - Configure project details (name, package, Java version, etc.)

3. **Review Generated Project**:
   - Complete Maven/Gradle project structure
   - REST controllers from OpenAPI endpoints
   - Service and repository layers
   - Exception handling and validation
   - OpenAPI documentation setup
   - Unit test scaffolding
   - README with getting started instructions

4. **Build and Run**:
   ```bash
   cd <your-project>
   mvn spring-boot:run
   # or
   gradle bootRun
   ```

5. **Access Your API**:
   - Application: http://localhost:8080/api
   - Swagger UI: http://localhost:8080/api/swagger-ui.html
   - Health Check: http://localhost:8080/api/actuator/health

### Example Workflow

```
1. Design your microservice (LLD + OpenAPI spec)
2. Run extension: Generate Spring Boot Project
3. Review generated code (~2-3 minutes)
4. Customize business logic as needed
5. Insert deployment templates (Kubernetes/Docker)
6. Push to Git, CI/CD takes over
```

**Time Savings**: Manual setup (4-8 hours) → AI-generated (15 minutes)

## Configuration

Access via VS Code Settings (`Ctrl+,`) → Search "DevEx"

### Project Defaults

```json
{
  "devex-ai-assistant.springBoot.version": "3.4.1",
  "devex-ai-assistant.java.version": "21",
  "devex-ai-assistant.buildTool": "maven",
  "devex-ai-assistant.packageName": "com.yourcompany"
}
```

### Telemetry & Updates

```json
{
  "devex-ai-assistant.telemetry.enabled": true,
  "devex-ai-assistant.updates.checkOnStartup": true,
  "devex-ai-assistant.updates.githubReleasesUrl": "https://github.com/yourorg/devex-ai-assistant/releases"
}
```

### AI Model Selection

```json
{
  "devex-ai-assistant.ai.modelFamily": "claude",
  "devex-ai-assistant.ai.modelSelector": {
    "vendor": "copilot",
    "family": "claude"
  }
}
```

## Enterprise Templates

### Adding Your Organization's Templates

1. Navigate to extension installation:
   ```
   .vscode/extensions/yourorg.devex-ai-assistant-x.x.x/templates/
   ```

2. Add templates to appropriate folders:
   - `kubernetes/` - Deployment manifests, services, ingress
   - `docker/` - Dockerfiles, docker-compose configurations
   - `ci-cd/` - GitHub Actions, Azure Pipelines, Jenkins

3. Use Handlebars syntax for dynamic values:
   ```yaml
   name: {{projectName}}
   image: registry/{{artifactId}}:{{version}}
   ```

4. Engineers insert via: `DevEx: Insert Deployment Template`

## Productivity Metrics

### For Engineers

- **Personal Dashboard**: `DevEx: View Productivity Dashboard`
- See your time saved, projects generated
- Compare manual vs. AI-assisted development

### For Managers & Executives

The extension tracks:
- Total time saved across team
- Number of projects generated
- Average time per project (AI vs. manual)
- ROI calculation: `(Time Saved × Hourly Rate) - Extension Cost`

**Export Metrics**: Dashboard includes "Export Data" button for reporting

### ROI Example

```
Team: 10 engineers
Projects per quarter: 40
Time saved per project: 6 hours
Hourly rate: $75

Quarterly ROI: 40 × 6 × $75 = $18,000 saved
Annual ROI: $72,000 saved
```

## Generated Project Structure

```
my-service/
├── pom.xml (or build.gradle)
├── README.md
├── .gitignore
├── src/
│   ├── main/
│   │   ├── java/com/company/myservice/
│   │   │   ├── MyServiceApplication.java
│   │   │   ├── config/
│   │   │   │   └── OpenApiConfig.java
│   │   │   ├── controller/
│   │   │   │   └── [Generated from OpenAPI]
│   │   │   ├── service/
│   │   │   │   └── [Business logic layer]
│   │   │   ├── repository/
│   │   │   │   └── [Data access layer]
│   │   │   ├── model/
│   │   │   │   ├── entity/
│   │   │   │   └── dto/
│   │   │   └── exception/
│   │   │       └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       └── application.yml
│   └── test/
│       └── java/
│           └── MyServiceApplicationTests.java
└── (Optional) kubernetes/, docker/, .github/workflows/
```

## Best Practices

### 1. Design First
- Create detailed LLD with sequence diagrams
- Define complete OpenAPI specification
- Review with team before generating code

### 2. Customize After Generation
- Generated code provides 80% foundation
- Add business logic to services
- Implement data models
- Configure database connections
- Add security (OAuth2, JWT, etc.)

### 3. Use Templates Consistently
- Leverage organizational deployment templates
- Maintain standard CI/CD pipelines
- Follow security and compliance guidelines

### 4. Track Productivity
- Estimate manual time honestly (for accurate ROI)
- Provide feedback when prompted
- Review dashboard regularly

### 5. Keep Updated
- Extension checks for updates on startup
- Review release notes for new features
- Share feedback with DevEx team

## Troubleshooting

### GitHub Copilot Not Available

**Error**: "GitHub Copilot is not available"

**Solution**:
1. Ensure Copilot extension is installed
2. Check Copilot subscription status
3. Sign in to GitHub: Command Palette → "GitHub: Sign In"
4. Restart VS Code

### OpenAPI Parsing Fails

**Error**: "Failed to parse OpenAPI specification"

**Solution**:
1. Validate spec at https://editor.swagger.io
2. Ensure file is valid YAML/JSON
3. Check OpenAPI version (3.0+ supported)
4. Review error message for specific issues

### Generated Code Won't Compile

**Solution**:
1. Check Java version: `java -version` (need 21+)
2. Verify Maven/Gradle installation
3. Run `mvn clean install` or `gradle clean build`
4. Check dependency resolution (network/proxy issues)
5. Review generated pom.xml/build.gradle

### Templates Not Showing

**Solution**:
1. Verify templates exist in extension folder
2. Check file naming (must have extensions like .yml, .yaml, .md)
3. Reload VS Code: `Developer: Reload Window`

## FAQ

**Q: Do I need a separate AI API key?**
A: No! The extension uses your existing GitHub Copilot license via VS Code's Language Model API.

**Q: What data is collected?**
A: All telemetry is stored locally in `~/.devex-ai-assistant/metrics.json`. No cloud transmission. Data includes: project generation timestamps, time estimates, feature usage.

**Q: Can I customize generated code templates?**
A: Yes! Advanced users can modify templates in the extension installation folder. See [Customization Guide](./docs/CUSTOMIZATION.md).

**Q: What Spring Boot version is used?**
A: Configurable, default is 3.4.1 (latest stable). Change via settings.

**Q: Does this work with microservices architecture?**
A: Yes! Generate each microservice independently. Use organizational templates for service mesh, API gateway configurations.

**Q: Can I generate projects without LLD?**
A: Yes, LLD is optional. At minimum, provide an OpenAPI specification.

**Q: How do I justify this to leadership?**
A: Use the Productivity Dashboard to show concrete ROI. Export metrics showing time saved, multiply by team's loaded hourly rate.

**Q: Is this approved for production use?**
A: Generated code follows best practices but requires code review. Treat as accelerated scaffolding, not production-ready without review.

**Q: Can I contribute improvements?**
A: Yes! This is an internal project. Contact the DevEx team or open issues on internal GitHub.

## Support

### Internal Resources

- **Slack**: #devex-ai-assistant
- **Email**: devex-team@yourcompany.com
- **GitHub**: https://github.com/yourorg/devex-ai-assistant (issues, discussions)
- **Wiki**: Internal confluence/wiki page

### Getting Help

1. Check this README and FAQ
2. Search existing GitHub issues
3. Post in Slack channel
4. Contact DevEx team directly

## Roadmap

### Upcoming Features

- ✅ **v1.0**: Core Spring Boot generation
- 🚧 **v1.1**: Add REST Endpoint (incremental updates)
- 📋 **v1.2**: Database migration scripts generation
- 📋 **v1.3**: Integration test generation
- 📋 **v1.4**: API versioning support
- 📋 **v2.0**: Multi-module projects, service-to-service communication

### Feedback Welcome

This is an evolving tool! Share your ideas:
- What features would save the most time?
- What templates are missing?
- What pain points remain?

## Contributing

Internal contributors welcome! See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

## License

Internal use only - Proprietary to [Your Company Name]

## Acknowledgments

- **DevEx Team**: Building tools to accelerate development
- **Early Adopters**: Pilot team feedback was invaluable
- **GitHub Copilot**: Powering the AI capabilities
- **Spring Boot Community**: For excellent documentation and patterns

---

## Get Started Today!

1. Install the extension
2. Generate your first project
3. Share feedback in #devex-ai-assistant
4. Help us measure the productivity impact!

**Questions?** Reach out to the DevEx team. We're here to help! 🚀

---

*Last Updated: January 2025 | Version 1.0.0*
