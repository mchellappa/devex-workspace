# Quick Start Guide

Get productive with DevEx AI Assistant in 10 minutes! 🚀

## Step 1: Verify Prerequisites (2 minutes)

### Check GitHub Copilot
1. Open VS Code
2. Look for Copilot icon in status bar (bottom-right)
3. If not present, install from Extensions marketplace
4. Ensure you're signed in and licensed

### Check Java & Build Tools
```bash
# Check Java version (need 21+)
java -version

# Check Maven (if using Maven)
mvn -version

# Check Gradle (if using Gradle)
gradle -version
```

If missing, download from:
- Java 21: https://adoptium.net
- Maven: https://maven.apache.org/download.cgi
- Gradle: https://gradle.org/install

## Step 2: Install Extension (2 minutes)

1. Download `.vsix` from internal releases
2. VS Code → Extensions (`Ctrl+Shift+X`)
3. Click `...` → "Install from VSIX..."
4. Select downloaded file
5. Restart VS Code

## Step 3: Configure Basics (1 minute)

Open Settings (`Ctrl+,`) and search "DevEx":

```json
{
  "devex-ai-assistant.packageName": "com.yourcompany.yourteam",
  "devex-ai-assistant.updates.githubReleasesUrl": "https://github.com/yourorg/devex-ai-assistant/releases"
}
```

## Step 4: Prepare Your First Project (3 minutes)

### Create OpenAPI Specification

Save as `petstore-api.yaml`:

```yaml
openapi: 3.0.0
info:
  title: Pet Store API
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      responses:
        '200':
          description: Array of pets
    post:
      summary: Create a pet
      operationId: createPet
      responses:
        '201':
          description: Pet created
  /pets/{petId}:
    get:
      summary: Get a pet by ID
      operationId: getPetById
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Pet details
```

### (Optional) Create LLD

Save as `petstore-lld.md`:

```markdown
# Pet Store Service - Low Level Design

## Overview
Microservice for managing pet inventory

## Sequence Diagram
\`\`\`
Client -> API Gateway -> Pet Service -> Database
\`\`\`

## Endpoints
- GET /pets - List all pets
- POST /pets - Create new pet
- GET /pets/{id} - Get pet details

## Data Model
- Pet: id, name, species, age, status
```

## Step 5: Generate Project (2 minutes)

1. **Open Command Palette**: `Ctrl+Shift+P`
2. **Type**: `DevEx: Generate Spring Boot Project`
3. **Follow prompts**:
   - Manual time estimate: `6 hours`
   - Output directory: Select folder
   - OpenAPI file: Select `petstore-api.yaml`
   - LLD file: (Optional) Select `petstore-lld.md`
   - Project name: `pet-store-service`
   - Package name: Use configured default
   - Java version: `21`
   - Build tool: `maven`

4. **Wait for generation** (~30 seconds)
5. **Open generated project**: VS Code will prompt

## Step 6: Verify & Run (2 minutes)

### Build
```bash
cd pet-store-service
mvn clean package
```

### Run
```bash
mvn spring-boot:run
```

### Test
Open browser:
- API: http://localhost:8080/api
- Swagger UI: http://localhost:8080/api/swagger-ui.html
- Health: http://localhost:8080/api/actuator/health

## Step 7: Customize (Ongoing)

### Add Business Logic

Edit `src/main/java/.../service/PetService.java`:

```java
@Service
public class PetService {
    private final PetRepository repository;

    public List<Pet> findAll() {
        return repository.findAll();
    }

    public Pet create(Pet pet) {
        // Add validation
        // Add business rules
        return repository.save(pet);
    }
}
```

### Configure Database

Edit `src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/petstore
    username: your_user
    password: your_password
  jpa:
    database-platform: org.hibernate.dialect.PostgreSQLDialect
```

## Step 8: Add Deployment Templates

1. **Open Command Palette**: `Ctrl+Shift+P`
2. **Type**: `DevEx: Insert Deployment Template`
3. **Select**: `kubernetes/deployment.yml`
4. File inserted at project root
5. **Customize** for your environment

## Step 9: View Productivity Gains

1. **Open Command Palette**: `Ctrl+Shift+P`
2. **Type**: `DevEx: View Productivity Dashboard`
3. See metrics:
   - Time saved: 5.5 hours (vs 6 hours manual)
   - Projects generated: 1
   - ROI calculation

## Step 10: Share Feedback

The extension will prompt for feedback after generation. Rate your experience:
- Time savings accurate?
- Code quality meets standards?
- Any issues encountered?

Your feedback helps improve the tool!

---

## Common Next Steps

### Add Authentication
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    // Configure OAuth2, JWT, etc.
}
```

### Add More Endpoints
Use `DevEx: Add REST Endpoint` (coming soon) or manually:

```java
@GetMapping("/pets/search")
public ResponseEntity<List<Pet>> searchPets(
    @RequestParam String query) {
    return ResponseEntity.ok(
        petService.search(query));
}
```

### Add Integration Tests
```java
@SpringBootTest
@AutoConfigureMockMvc
class PetControllerIT {
    @Autowired MockMvc mockMvc;
    
    @Test
    void shouldListPets() throws Exception {
        mockMvc.perform(get("/pets"))
               .andExpect(status().isOk());
    }
}
```

### Configure CI/CD
Insert pipeline template:
- `DevEx: Insert Deployment Template`
- Select `.github/workflows/build.yml`
- Commit to trigger build

---

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
mvn clean install -U

# Check Java version
java -version  # Must be 21+
```

### Port Already in Use
```yaml
# Change in application.yml
server:
  port: 8081  # Or any available port
```

### Copilot Not Working
1. Check Copilot status icon
2. Command Palette → "GitHub: Sign In"
3. Restart VS Code

---

## Quick Reference

### Commands
- `Ctrl+Shift+P` → Command Palette
- `DevEx: Generate Spring Boot Project` → Main generator
- `DevEx: View Productivity Dashboard` → See metrics
- `DevEx: Insert Deployment Template` → Add K8s/Docker

### Key Files in Generated Project
- `pom.xml` / `build.gradle` → Dependencies
- `application.yml` → Configuration
- `src/main/java/.../controller/` → REST APIs
- `src/main/java/.../service/` → Business logic
- `src/main/java/.../repository/` → Data access

### Useful Commands
```bash
# Build
mvn clean package

# Run
mvn spring-boot:run

# Test
mvn test

# Create Docker image
mvn spring-boot:build-image
```

---

## Success! 🎉

You've generated your first AI-assisted Spring Boot project!

**Time Spent**: ~10 minutes
**Time Saved**: ~6 hours
**ROI**: 36x productivity boost

### What's Next?
1. Generate more projects
2. Share with your team
3. Customize templates for your org
4. Track collective productivity gains

### Need Help?
- Slack: #devex-ai-assistant
- Email: devex-team@yourcompany.com
- GitHub: Open an issue

---

*Happy coding! 🚀*
