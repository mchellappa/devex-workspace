# DevEx AI Assistant - Example Files

This folder contains sample design artifacts you can use to test the DevEx AI Assistant extension after installation.

## 📋 What's Included

- **`sample-lld.md`** - Example Low-Level Design document for an Order Management microservice
- **`order-management-api.yaml`** - OpenAPI 3.0 specification defining REST API endpoints for order management

## 🚀 Quick Start Guide

After installing the DevEx AI Assistant extension, follow these steps to generate your first Spring Boot project:

### Step 1: Open the Examples Folder

1. Open VS Code
2. File → Open Folder → Navigate to this `examples` folder
3. You should now see both `sample-lld.md` and `order-management-api.yaml`

### Step 2: Review the Sample LLD (Optional)

1. Open `sample-lld.md`
2. Right-click in the editor
3. Select **"DevEx: Summarize LLD Document"**
4. The AI will analyze and summarize the design document

**Expected Output**: A concise summary highlighting key components, design patterns, and integration points.

### Step 3: Review the OpenAPI Spec (Optional)

1. Open `order-management-api.yaml`
2. Right-click in the editor
3. Select **"DevEx: Parse OpenAPI Specification"**
4. The AI will validate and analyze the API specification

**Expected Output**: A structured summary of endpoints, schemas, and authentication requirements.

### Step 4: Generate Spring Boot Project

1. In the VS Code Explorer, right-click on the `examples` folder (or any folder where you want to generate the project)
2. Select **"DevEx: Generate Spring Boot Project from Design"**
3. When prompted:
   - **Project Name**: `order-management-service` (or your choice)
   - **Package Name**: `com.company.order` (or your choice)
   - **Select LLD**: Browse and select `sample-lld.md`
   - **Select OpenAPI Spec**: Browse and select `order-management-api.yaml`
   - **Build Tool**: Choose `Maven` or `Gradle`
   - **Java Version**: Choose `17` or `21`
   - **Spring Boot Version**: Use default or specify (e.g., `3.4.1`)

4. Wait ~30 seconds while the AI generates your project

**Expected Output**: A complete Spring Boot project structure with:
- Controllers, Services, Repositories
- Configuration files (application.yml, pom.xml/build.gradle)
- Unit test scaffolding
- OpenAPI documentation
- README with getting started instructions

### Step 5: Explore the Generated Code

Navigate through the generated project to see:

```
order-management-service/
├── src/
│   ├── main/
│   │   ├── java/com/company/order/
│   │   │   ├── OrderManagementApplication.java
│   │   │   ├── controller/
│   │   │   │   └── OrderController.java
│   │   │   ├── service/
│   │   │   │   └── OrderService.java
│   │   │   ├── repository/
│   │   │   │   └── OrderRepository.java
│   │   │   ├── model/
│   │   │   │   └── Order.java
│   │   │   └── config/
│   │   │       ├── OpenApiConfig.java
│   │   │       └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       └── application.yml
│   └── test/
│       └── java/com/company/order/
│           └── OrderManagementApplicationTests.java
├── pom.xml (or build.gradle)
└── README.md
```

### Step 6: Build and Run (Optional)

If you have Java and Maven/Gradle installed:

```bash
# For Maven
cd order-management-service
mvn clean install
mvn spring-boot:run

# For Gradle
cd order-management-service
gradle build
gradle bootRun
```

Visit: `http://localhost:8080/swagger-ui.html` to see the API documentation.

## 🎯 Additional Features to Test

### Insert Deployment Templates

1. Open any file in your generated project
2. Run command: **DevEx: Insert Deployment Template**
3. Choose a template:
   - **Kubernetes** - Deployment manifests, services, ingress
   - **Docker** - Dockerfile, docker-compose
   - **CI/CD** - GitHub Actions, Azure Pipelines

### View Productivity Dashboard

1. Run command: **DevEx: View Productivity Dashboard**
2. View metrics:
   - Projects generated
   - Time saved
   - ROI calculation
   - Feature usage statistics

### Add API Endpoint (Future Feature)

1. Open an OpenAPI spec
2. Run command: **DevEx: Add API Endpoint from OpenAPI**
3. Follow prompts to add new endpoints to existing projects

## 📝 Sample Use Cases

### Use Case 1: E-commerce Order Management
The provided examples implement a basic order management system with:
- Create, retrieve, update, and cancel orders
- Order status management (PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED)
- RESTful API design
- Error handling and validation

### Use Case 2: Customization
Modify the provided files to match your requirements:
- Edit `sample-lld.md` to describe your microservice
- Update `order-management-api.yaml` to define your API endpoints
- Re-generate with your customized artifacts

## ⏱️ Expected Time

- **First-time setup**: 2-3 minutes
- **Project generation**: 30-60 seconds
- **Code review**: 5-10 minutes
- **Build and run**: 2-5 minutes

**Total**: ~10-15 minutes for a complete working Spring Boot microservice!

## 🆘 Troubleshooting

### Issue: "No Copilot model available"
**Solution**: Ensure GitHub Copilot is installed and your subscription is active.

### Issue: Generation takes too long (>2 minutes)
**Solution**: Check your internet connection and Copilot service status.

### Issue: Generated code doesn't compile
**Solution**: 
1. Check Java version compatibility
2. Verify Maven/Gradle is properly configured
3. Review the generated pom.xml/build.gradle for dependency issues

### Issue: OpenAPI spec validation fails
**Solution**: Verify your YAML syntax is correct using an online validator.

## 💡 Tips for Best Results

1. **Clear LLD**: The more detailed your LLD, the better the generated code
2. **Valid OpenAPI**: Ensure your OpenAPI spec follows 3.0+ standards
3. **Consistent Naming**: Use consistent naming between LLD and OpenAPI
4. **Review Generated Code**: Always review and customize the generated code for your specific needs
5. **Save Time**: Let the AI handle boilerplate, focus your time on business logic

## 🔗 Additional Resources

- [Quick Start Guide](../docs/QUICK_START.md)
- [FAQ](../docs/FAQ.md)
- [Development Guide](../docs/DEVELOPMENT.md)
- [Main README](../README.md)

## 📧 Feedback

Have feedback or suggestions? Reach out to:
- **Slack**: #devex-ai-assistant
- **Email**: devex-team@yourcompany.com
- **GitHub**: Open an issue or discussion

---

**Happy Coding!** 🎉

*Generated projects save an average of 5.5 hours per microservice!*
