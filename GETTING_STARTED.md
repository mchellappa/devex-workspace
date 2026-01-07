# Getting Started

Welcome to DevEx AI Assistant! This guide will help you install and use the extension to generate Spring Boot projects in minutes.

## What You'll Need

- VS Code (1.85.0 or later)
- GitHub Copilot subscription
- Java 21
- Maven or Gradle

## Installation Steps

### 1. Install the Extension

1. Download the latest `.vsix` file from [internal releases](https://github.com/yourorg/devex-ai-assistant/releases)
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click the `...` menu (top right)
5. Select "Install from VSIX..."
6. Choose the downloaded `.vsix` file
7. Restart VS Code

### 2. Verify GitHub Copilot

Make sure GitHub Copilot is:
- Installed (check Extensions view)
- Active (look for Copilot icon in status bar)
- Licensed (you're signed in)

### 3. Configure Basics (Optional)

Open Settings (`Ctrl+,`) and search for "DevEx":

```json
{
  "devex-ai-assistant.packageName": "com.yourcompany.yourteam",
  "devex-ai-assistant.springBoot.version": "3.4.1",
  "devex-ai-assistant.java.version": "21"
}
```

## Your First Project (5 Minutes)

### Step 1: Prepare an OpenAPI Specification

Create a file `my-api.yaml`:

```yaml
openapi: 3.0.0
info:
  title: Hello API
  version: 1.0.0
paths:
  /hello:
    get:
      summary: Say hello
      operationId: sayHello
      responses:
        '200':
          description: Success
```

### Step 2: Generate Project

1. Open Command Palette (`Ctrl+Shift+P`)
2. Type: `DevEx: Generate Spring Boot Project`
3. Follow the prompts:
   - Manual time estimate: `4 hours`
   - Output directory: Choose a folder
   - OpenAPI file: Select `my-api.yaml`
   - Project name: `hello-service`
   - Use defaults for other options

Wait ~30 seconds for generation to complete.

### Step 3: Build and Run

```bash
cd hello-service
mvn spring-boot:run
```

Visit http://localhost:8080/api/swagger-ui.html to see your API!

## What Got Generated?

A complete Spring Boot project with:
- ✅ Maven/Gradle configuration
- ✅ Spring Boot application class
- ✅ REST controllers (from OpenAPI)
- ✅ Service and repository layers
- ✅ Exception handling
- ✅ OpenAPI/Swagger UI setup
- ✅ Unit tests
- ✅ README with instructions
- ✅ Proper package structure

## Next Steps

### Explore Other Commands

- **Summarize LLD**: Analyze design documents with AI
- **Parse OpenAPI**: Validate API specifications
- **Insert Templates**: Add Kubernetes/Docker configs
- **View Dashboard**: See your productivity metrics

### Customize Your Project

- Add business logic to service classes
- Configure database connections
- Add authentication
- Insert deployment templates

### Add Organizational Templates

1. Navigate to extension templates folder
2. Add your Kubernetes/Docker/CI-CD templates
3. Engineers can insert them with one command

### Track Productivity

- Check your dashboard: `DevEx: View Productivity Dashboard`
- See time saved and ROI calculations
- Export metrics for reporting

## Need Help?

- **Quick Start**: See [docs/QUICK_START.md](./docs/QUICK_START.md)
- **FAQ**: See [docs/FAQ.md](./docs/FAQ.md)
- **Slack**: #devex-ai-assistant
- **Email**: devex-team@yourcompany.com

## Examples

Check the `examples/` folder for:
- Sample LLD document
- Complete OpenAPI specification
- Sequence diagrams

Use these as templates for your own projects!

---

## Tips for Success

1. **Start with a good OpenAPI spec** - The better your spec, the better the generated code
2. **Use the LLD feature** - Summarize complex design docs to understand them better
3. **Customize after generation** - Generated code is a foundation, not the final product
4. **Track your time** - Provide honest estimates for accurate ROI calculations
5. **Share feedback** - Help us improve the tool for everyone

---

**Ready to 10x your productivity?** Generate your first project now! 🚀

---

*Having issues? Check [FAQ](./docs/FAQ.md) or reach out on Slack.*
