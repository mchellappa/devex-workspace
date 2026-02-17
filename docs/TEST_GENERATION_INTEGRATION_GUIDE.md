# Test Generation Integration with Domain-Driven APIs

## Overview

**Version 1.4.7+** now includes automatic test generation during the domain-driven API workflow. When generating Spring Boot projects for multiple domains, tests can be automatically created **before marking stories as complete**.

---

## What's New?

### Before (Manual Test Generation)

```
1. Generate Domain-Driven APIs
2. Create 17 Jira stories + OpenAPI specs + Spring Boot code
3. Mark stories complete ✅
4. ❌ Forgot to write tests!
5. Tests get written weeks later (or never)
```

### After (Integrated Test Generation)

```
1. Generate Domain-Driven APIs
2. Choose "Generate unit tests" option ⭐ NEW!
3. For each domain:
   - Create Jira story ✅
   - Generate OpenAPI spec ✅
   - Generate Spring Boot code ✅
   - Auto-generate unit tests ✅ (80%+ coverage)
   - Post Jira comment with coverage metrics ✅
4. Mark stories complete ✅ (only after tests exist!)
```

---

## How It Works

### Step-by-Step Workflow

**Step 1:** Run the command

```
Command Palette → "DevEx: Generate Domain-Driven APIs"
```

**Step 2:** Follow existing prompts
- Select ERD CSV file
- Choose parent epic or project key
- Enter base package name

**Step 3:** Choose generation mode

```
❓ Choose generation mode:
   ○ Generate stories and OpenAPI only
   ● Generate everything now  ← Choose this
```

**Step 4:** **NEW PROMPT!** Choose test generation

```
❓ Generate unit tests automatically?
   ● Generate unit tests (80%+ coverage)  ← Recommended!
     Auto-generate comprehensive unit tests after code generation.
     Uses AI to analyze code and generate JUnit 5 + Mockito tests
   
   ○ Skip test generation
     Only generate Spring Boot code without tests
```

**Step 5:** Select output folder

**Step 6:** Let it run!

For each domain (17 total), the tool will:

```
Domain: User Management
├─ Create Jira story: SWIFT-12345 ✅
├─ Generate OpenAPI: /specs/user-management-openapi.yaml ✅
├─ Generate Spring Boot: /projects/user-management/ ✅
│  ├─ Controllers
│  ├─ Services
│  ├─ Repositories
│  └─ DTOs
├─ Generate Unit Tests: ✅ NEW!
│  ├─ UserControllerTest.java (85% coverage)
│  ├─ UserServiceTest.java (88% coverage)
│  ├─ UserRepositoryTest.java (80% coverage)
│  └─ ... 8 test files total
└─ Post Jira comment with metrics ✅

Jira Comment:
╔══════════════════════════════════════════════════╗
║ Spring Boot Project Generated                    ║
║ Location: `/projects/user-management`           ║
║ Package: `com.swift.ods.usermanagement`         ║
║                                                  ║
║ ✅ Unit Tests Generated                          ║
║ 📊 Test Files: 8/8                              ║
║ 📈 Estimated Coverage: ~85%                      ║
║                                                  ║
║ Project is ready to compile and run tests!      ║
║ ```bash                                          ║
║ cd /projects/user-management                     ║
║ mvn test                                         ║
║ ```                                              ║
╚══════════════════════════════════════════════════╝
```

---

## Benefits

### 1. Enforces Definition of Done

**Without Test Generation:**
- Story marked "Done" = Code exists
- Tests written later (or never)
- Tech debt accumulates

**With Test Generation:**
- Story marked "Done" = Code + Tests exist
- 80%+ coverage documented in Jira
- No tech debt from missing tests

### 2. Instant Visibility

Every Jira story automatically includes:
- ✅ Test file count (8/8)
- ✅ Estimated coverage percentage (~85%)
- ✅ Commands to run tests
- ✅ Coverage report generation instructions

### 3. Checkpoint Resume with Tests

If the 3-hour process is interrupted, the checkpoint system remembers:
- Which domains completed
- Which code was generated
- **Which tests were generated** ← NEW!
- Test generation preference

Resume continues test generation for remaining domains.

### 4. Time Savings

**17 domains with manual test writing:**
- Manual: ~2 hours per domain × 17 = 34 hours
- Automated: ~30 seconds per domain × 17 = 8.5 minutes
- **Time Saved: 33.75 hours (99.3% reduction)**

---

## Configuration

### Test Generation Options

**Option 1: Generate unit tests (80%+ coverage)** [Recommended]
- Auto-generates comprehensive tests
- Targets 80%+ code coverage
- Includes edge cases (null, empty, boundary values)
- Mocks all dependencies (Mockito)
- Follows Arrange-Act-Assert pattern
- Adds ~30-60 seconds per domain
- **Coverage metrics in Jira comment**

**Option 2: Skip test generation**
- Only generates Spring Boot code
- No test files created
- Faster execution (~10 seconds per domain)
- Must manually generate tests later
- **Not recommended for production code**

### Coverage Target

Currently fixed at **80%** (optimal balance of coverage vs. execution time).

Future versions may allow customization (85%, 90%, etc.).

---

## What Gets Generated?

### Test Structure

For each Spring Boot class:

```
src/main/java/com/swift/ods/usermanagement/
├─ controller/
│  └─ UserController.java
├─ service/
│  └─ UserService.java
├─ repository/
│  └─ UserRepository.java
└─ model/
   ├─ User.java
   └─ dto/
      ├─ UserRequest.java
      └─ UserResponse.java

src/test/java/com/swift/ods/usermanagement/  ← AUTO-GENERATED!
├─ controller/
│  └─ UserControllerTest.java (3+ tests per endpoint)
├─ service/
│  └─ UserServiceTest.java (3+ tests per method)
├─ repository/
│  └─ UserRepositoryTest.java (CRUD + edge cases)
└─ model/
   └─ dto/
      ├─ UserRequestTest.java (validation tests)
      └─ UserResponseTest.java (serialization tests)
```

### Test Quality

Each test class includes:

✅ **Happy Path Tests** - Expected success scenarios
✅ **Edge Case Tests** - Null, empty, boundary values
✅ **Exception Tests** - Invalid inputs, error conditions
✅ **Mock Setup** - All dependencies mocked with Mockito
✅ **Arrange-Act-Assert** - Clear test structure
✅ **Descriptive Names** - `createUser_withValidInput_shouldReturnCreatedUser()`
✅ **Meaningful Assertions** - Verifies business logic, not just `assertNotNull()`

Example:

```java
@DisplayName("UserService Unit Tests")
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @InjectMocks
    private UserService userService;
    
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }
    
    @Test
    @DisplayName("createUser with valid inputs should return created user")
    void createUser_withValidInputs_shouldReturnCreatedUser() {
        // Arrange
        UserRequest request = new UserRequest("John Doe", "john@example.com");
        User expectedUser = new User(1L, "John Doe", "john@example.com");
        when(userRepository.save(any(User.class))).thenReturn(expectedUser);
        
        // Act
        User result = userService.createUser(request);
        
        // Assert
        assertNotNull(result);
        assertEquals("John Doe", result.getName());
        assertEquals("john@example.com", result.getEmail());
        verify(userRepository, times(1)).save(any(User.class));
    }
    
    @Test
    @DisplayName("createUser with null request should throw exception")
    void createUser_withNullRequest_shouldThrowException() {
        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> {
            userService.createUser(null);
        });
    }
    
    @Test
    @DisplayName("createUser with invalid email should throw exception")
    void createUser_withInvalidEmail_shouldThrowException() {
        // Arrange
        UserRequest request = new UserRequest("John Doe", "invalid-email");
        
        // Act & Assert
        assertThrows(ValidationException.class, () -> {
            userService.createUser(request);
        });
    }
}
```

---

## Running Tests

### After Generation

Once tests are generated, verify coverage:

**Step 1:** Navigate to project folder

```bash
cd /output/user-management
```

**Step 2:** Run tests

```bash
mvn test
```

**Step 3:** Generate coverage report (JaCoCo)

```bash
mvn clean test jacoco:report
```

**Step 4:** View coverage report

```bash
open target/site/jacoco/index.html
```

### Expected Results

```
Tests run: 47, Failures: 0, Errors: 0, Skipped: 0

Coverage Summary:
- Line Coverage: 85%
- Branch Coverage: 78%
- Method Coverage: 92%
```

---

## Checkpoint System with Tests

### How Checkpoints Work

Checkpoint saved at: `~/.devex/swift-ods/checkpoint.json`

**Contains:**
```json
{
  "parentIssueKey": "SWIFT-74713",
  "basePackage": "com.swift.ods",
  "generateSpringBootNow": true,
  "generateTests": true,  ← NEW!
  "outputRootFolder": "/output/swift-ods",
  "completedDomains": [
    {
      "issueKey": "SWIFT-12345",
      "domainName": "User Management",
      "openAPIPath": "/specs/user-management-openapi.yaml",
      "springBootPath": "/output/user-management",
      "testCount": 8,  ← NEW!
      "estimatedCoverage": 85  ← NEW!
    },
    // ... more domains
  ],
  "timestamp": 1707804123456
}
```

### Resume After Interruption

If the command is interrupted after completing 10 of 17 domains:

**Step 1:** Re-run command

```
Command Palette → "DevEx: Generate Domain-Driven APIs"
```

**Step 2:** Choose "Resume"

```
❓ Found Previous Session

Completed: 10 domains
Parent Epic: SWIFT-74713
Package: com.swift.ods

Resume from checkpoint or start fresh?
   ● Resume  ← Choose this
   ○ Start Fresh
   ○ Cancel
```

**Step 3:** It resumes!

- Skips 10 completed domains ✅
- Continues with remaining 7 domains
- **Generates tests for remaining 7** (because checkpoint saved `generateTests: true`)
- Updates checkpoint after each domain

**Result:**
- No duplicate work
- No lost progress
- Test generation continues seamlessly

---

## Migration from Previous Versions

### If You Already Generated Code (v1.4.6 or earlier)

You have two options:

#### Option 1: Regenerate with Tests (Recommended)

**Pros:**
- Fresh code + tests
- 80%+ coverage guaranteed
- Metrics in Jira

**Cons:**
- Overwrites existing code (backup first!)
- Takes 3 hours for 17 domains

**Steps:**
1. Backup existing projects
2. Re-run "Generate Domain-Driven APIs"
3. Choose "Generate everything now"
4. Choose "Generate unit tests"
5. Select same output folder (overwrites)

#### Option 2: Generate Tests Manually

**Pros:**
- Keeps existing code unchanged
- Faster (no code regeneration)

**Cons:**
- Manual process per project
- No Jira comment updates

**Steps:**
1. Open each Spring Boot project
2. Command Palette → "DevEx: Generate Unit Tests for Entire Project"
3. Select project folder
4. Choose 80% coverage
5. Review TEST_GENERATION_SUMMARY.md
6. Manually update Jira comment (optional)

**For 17 domains:**
- Time: ~30 minutes (vs. 3 hours for full regen)
- Coverage: Same quality, just manual invocation

---

## Best Practices

### When to Use Integrated Test Generation

**Always use for:**
- ✅ New domain-driven API projects
- ✅ Production code requiring 80%+ coverage
- ✅ Stories with strict Definition of Done
- ✅ Projects with quality gates
- ✅ Microservices with 5+ endpoints

**Skip test generation for:**
- ❌ Proof-of-concept / spike code
- ❌ Code planned for significant refactoring
- ❌ Simple CRUD with no business logic
- ❌ Extreme time constraints (generate tests later)

### Workflow Recommendations

**Best: Integrated (Default)**
```
Generate Domain-Driven APIs 
→ Generate everything now 
→ ✅ Generate unit tests
→ Tests created with code
→ Story marked complete with tests
```

**Alternative: Manual Later**
```
Generate Domain-Driven APIs 
→ Generate everything now 
→ ❌ Skip tests
→ Later: Generate Unit Tests for Entire Project
→ Update Jira comments manually
```

---

## Troubleshooting

### Tests Don't Compile

**Issue:** Generated tests have compilation errors

**Solutions:**
1. Check JUnit 5 dependency in `pom.xml`:
   ```xml
   <dependency>
       <groupId>org.junit.jupiter</groupId>
       <artifactId>junit-jupiter</artifactId>
       <scope>test</scope>
   </dependency>
   ```

2. Check Mockito dependency:
   ```xml
   <dependency>
       <groupId>org.mockito</groupId>
       <artifactId>mockito-core</artifactId>
       <scope>test</scope>
   </dependency>
   ```

3. Run Maven update:
   ```bash
   mvn dependency:resolve
   ```

### Coverage Lower Than Expected

**Issue:** JaCoCo reports 65% instead of 85%

**Solutions:**
1. Check which files are untested:
   ```bash
   open target/site/jacoco/index.html
   # Click on red packages
   ```

2. Add missing tests manually for complex logic

3. Private methods may need indirect tests via public methods

### Test Generation Failed

**Issue:** Jira comment shows "Test generation failed"

**Solutions:**
1. Check logs: View → Output → DevEx AI Assistant

2. Retry manually:
   ```
   Command Palette → "DevEx: Generate Unit Tests for Entire Project"
   Select: /output/<domain-name>
   ```

3. Report issue if problem persists

---

## FAQ

### Q: Can I customize the coverage target?

**A:** Currently fixed at 80%. Future versions may allow customization.

### Q: Does this work with Gradle projects?

**A:** Yes! Generated tests work with both Maven and Gradle.

### Q: Can I regenerate tests if I modify code?

**A:** Yes:
1. Delete existing test files
2. Run "Generate Unit Tests for Entire Project"
3. Select project folder

### Q: Will tests be overwritten if I regenerate?

**A:** Yes, if you re-run "Generate Domain-Driven APIs" on the same folder. Backup existing tests first!

### Q: Can I skip tests for specific domains?

**A:** Not currently. It's all-or-nothing. You can delete unwanted test files afterward.

### Q: How long does test generation add per domain?

**A:** ~30-60 seconds per domain. For 17 domains: ~8.5-17 minutes total.

### Q: What if I only want tests for controllers?

**A:** Delete unwanted test files (services, repositories) after generation. Or generate tests manually per file.

---

## Support

For issues or questions:
- Check [Unit Test Generation Guide](UNIT_TEST_GENERATION_GUIDE.md)
- Internal wiki: DevEx AI Assistant Docs
- Slack: #devex-support
- Email: devex@company.com

---

Generated by DevEx AI Assistant v1.4.7+
