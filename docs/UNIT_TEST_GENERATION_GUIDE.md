# Unit Test Generation - Quick Start Guide

## Overview

DevEx AI Assistant now includes **AI-powered unit test generation** that automatically creates comprehensive test suites targeting **80%+ code coverage** for both Java (Spring Boot) and .NET projects.

**NEW:** Tests can be automatically generated during domain-driven API story creation, ensuring complete coverage before marking stories as done! 🎯

---

## ✨ Features

### Intelligent Test Generation
- **Multi-language support**: Java (JUnit 5 + Mockito) and C# (xUnit + Moq)
- **Smart coverage**: Targets 80%+ coverage with meaningful tests (not just fluff)
- **Edge case detection**: AI identifies null checks, boundary values, exception paths
- **Mock setup**: Automatic dependency mocking
- **Best practices**: Follows Arrange-Act-Assert pattern with descriptive naming

### Two Modes

#### 1. Generate Unit Tests (Single File)
- Right-click on `.java` or `.cs` file → **"Generate Unit Tests (80%+ Coverage)"**
- AI analyzes the code structure
- Shows preview of methods and test count
- Generates comprehensive test suite
- Creates test file in correct location (src/test/java or tests/)

#### 2. Generate Tests for Entire Project
- Command Palette → **"DevEx: Generate Unit Tests for Entire Project"**
- Batch processes all source files in project
- Generates tests for every class
- Creates summary report (TEST_GENERATION_SUMMARY.md)

#### 3. Auto-Generate During Story Creation (NEW!) ⭐
- When running **"DevEx: Generate Domain-Driven APIs"**
- Choose **"Generate everything now"** option
- Select **"Generate unit tests (80%+ coverage)"** when prompted
- Tests are automatically created for all generated Spring Boot code
- Story is only marked complete after code **AND tests** are generated
- Jira comment includes test coverage statistics

---

## 🚀 Quick Start

### Integrated with Domain-Driven APIs (Recommended!) ⭐

**This is the easiest way to ensure tests are generated before marking stories complete.**

**Step 1:** Command Palette (`Ctrl+Shift+P`) → **"DevEx: Generate Domain-Driven APIs"**

**Step 2:** Follow the prompts:
- Select ERD CSV file
- Choose parent epic or project key
- Enter base package name (e.g., `com.swift.ods`)

**Step 3:** Choose **"Generate everything now"** (not "stories only")

**Step 4:** Choose **"Generate unit tests (80%+ coverage)"** ⭐ **NEW PROMPT!**

**Step 5:** Select output folder for Spring Boot projects

**Step 6:** Wait for completion. For each domain, the tool will:
   1. Create Jira story
   2. Generate OpenAPI spec
   3. Generate Spring Boot code (Controllers, Services, Repositories, DTOs)
   4. **Automatically generate unit tests** with 80%+ coverage
   5. Post Jira comment with test statistics

**Result:**
```
✅ Story Created: SWIFT-12345
✅ OpenAPI Generated: /specs/user-management-openapi.yaml
✅ Spring Boot Project: /projects/user-management/
✅ Unit Tests Generated: 8/8 test files
📊 Estimated Coverage: ~85%

Run tests:
cd /projects/user-management
mvn test
```

**Why this is better:**
- ✅ Tests generated automatically with code
- ✅ No need to remember to generate tests later
- ✅ Story not marked complete until tests exist
- ✅ Coverage metrics included in Jira comment
- ✅ Checkpoint system resumes if interrupted

---

### For a Single Class

**Step 1:** Open a Java or C# source file (e.g., `UserService.java`)

**Step 2:** Right-click anywhere in the file → **"Generate Unit Tests (80%+ Coverage)"**

**Step 3:** Select target coverage (default: 80%)

**Step 4:** Review the analysis preview:
```
📊 Test Generation Plan

Class: UserService
Methods to Test: 5
Estimated Tests: 15
Expected Coverage: ~80%

Methods:
• createUser(...) - 3 edge cases
• updateUser(...) - 4 edge cases
• deleteUser(...) - 2 edge cases
• findUserById(...) - 2 edge cases
• listUsers(...) - 4 edge cases

Generate tests now?
```

**Step 5:** Click **"Generate Tests"**

**Step 6:** AI generates complete test suite and saves to `src/test/java/.../UserServiceTest.java`

**Step 7:** Review and run tests!

---

### For Entire Project

**Step 1:** Command Palette (`Ctrl+Shift+P`) → **"DevEx: Generate Unit Tests for Entire Project"**

**Step 2:** Select your project root folder

**Step 3:** Choose target coverage (80% or 85%)

**Step 4:** Confirm batch generation

**Step 5:** Wait for completion (may take several minutes for large projects)

**Step 6:** Review `TEST_GENERATION_SUMMARY.md` for results

---

## 🎯 Workflow Benefits

### Definition of Done Integration

When using the integrated domain-driven workflow, **tests are automatically part of your Definition of Done**:

**Traditional Workflow (Manual):**
1. Generate code ✅
2. Create Jira story ✅
3. Mark story complete ✅
4. ❌ **Forgot to write tests!**
5. Tech debt accumulates...

**DevEx Workflow (Automated):**
1. Generate code ✅
2. **Auto-generate tests ✅** ← Happens automatically
3. Create Jira story ✅
4. Mark story complete ✅
5. ✅ **Tests already written and documented!**

### Test Coverage Metrics in Jira

Every Jira story automatically includes test metrics:

```markdown
**Spring Boot Project Generated**

Location: `/output/user-management`
Package: `com.swift.ods.usermanagement`

**Unit Tests Generated**
✅ Test Files: 8/8
📊 Estimated Coverage: ~85%

Project is ready to compile and run tests!
```bash
cd /output/user-management
mvn test
```
```

This provides **instant visibility** to:
- Product Owners (story is truly "done")
- QA Teams (test coverage metrics)
- Tech Leads (quality gates enforced)
- Future maintainers (tests exist and are documented)

### Checkpoint Resume with Tests

If the command is interrupted (network issue, timeout, etc.), the checkpoint system remembers:
- ✅ Which domains completed
- ✅ Which code was generated
- ✅ **Which tests were generated**
- ✅ Test generation preference

When you resume, it skips completed work and continues where it left off, including test generation for remaining domains.

---

## 📋 What Gets Generated

### Java/Spring Boot Example

**Input:** `UserService.java`
```java
@Service
public class UserService {
    private final UserRepository userRepository;
    
    public User createUser(String name, String email) {
        if (name == null || email == null) {
            throw new IllegalArgumentException("Name and email required");
        }
        // ... create user
    }
    
    public User findUserById(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new UserNotFoundException(id));
    }
}
```

**Output:** `UserServiceTest.java`
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
        String name = "John Doe";
        String email = "john@example.com";
        User expected = new User(name, email);
        when(userRepository.save(any(User.class))).thenReturn(expected);
        
        // Act
        User result = userService.createUser(name, email);
        
        // Assert
        assertNotNull(result);
        assertEquals(name, result.getName());
        assertEquals(email, result.getEmail());
        verify(userRepository).save(any(User.class));
    }
    
    @Test
    @DisplayName("createUser with null name should throw IllegalArgumentException")
    void createUser_withNullName_shouldThrowException() {
        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> {
            userService.createUser(null, "john@example.com");
        });
    }
    
    @Test
    @DisplayName("createUser with null email should throw IllegalArgumentException")
    void createUser_withNullEmail_shouldThrowException() {
        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> {
            userService.createUser("John Doe", null);
        });
    }
    
    @Test
    @DisplayName("findUserById with valid ID should return user")
    void findUserById_withValidId_shouldReturnUser() {
        // Arrange
        Long userId = 1L;
        User expected = new User("John", "john@example.com");
        when(userRepository.findById(userId)).thenReturn(Optional.of(expected));
        
        // Act
        User result = userService.findUserById(userId);
        
        // Assert
        assertNotNull(result);
        assertEquals(expected.getName(), result.getName());
        verify(userRepository).findById(userId);
    }
    
    @Test
    @DisplayName("findUserById with non-existent ID should throw UserNotFoundException")
    void findUserById_withNonExistentId_shouldThrowException() {
        // Arrange
        Long userId = 999L;
        when(userRepository.findById(userId)).thenReturn(Optional.empty());
        
        // Act & Assert
        assertThrows(UserNotFoundException.class, () -> {
            userService.findUserById(userId);
        });
        verify(userRepository).findById(userId);
    }
}
```

**Result:**
- ✅ 5 test methods covering happy paths + edge cases + exceptions
- ✅ ~85% code coverage
- ✅ All dependencies mocked
- ✅ Descriptive test names and assertions

---

### .NET/C# Example

**Input:** `UserService.cs`
```csharp
public class UserService {
    private readonly IUserRepository _userRepository;
    
    public User CreateUser(string name, string email) {
        if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(email)) {
            throw new ArgumentException("Name and email required");
        }
        // ... create user
    }
}
```

**Output:** `UserServiceTests.cs`
```csharp
using Xunit;
using Moq;
using FluentAssertions;

public class UserServiceTests {
    private readonly Mock<IUserRepository> _userRepositoryMock;
    private readonly UserService _userService;
    
    public UserServiceTests() {
        _userRepositoryMock = new Mock<IUserRepository>();
        _userService = new UserService(_userRepositoryMock.Object);
    }
    
    [Fact]
    public void CreateUser_WithValidInputs_ShouldReturnCreatedUser() {
        // Arrange
        var name = "John Doe";
        var email = "john@example.com";
        var expected = new User { Name = name, Email = email };
        _userRepositoryMock.Setup(r => r.Save(It.IsAny<User>())).Returns(expected);
        
        // Act
        var result = _userService.CreateUser(name, email);
        
        // Assert
        result.Should().NotBeNull();
        result.Name.Should().Be(name);
        result.Email.Should().Be(email);
        _userRepositoryMock.Verify(r => r.Save(It.IsAny<User>()), Times.Once);
    }
    
    [Theory]
    [InlineData(null, "john@example.com")]
    [InlineData("", "john@example.com")]
    public void CreateUser_WithInvalidName_ShouldThrowException(string name, string email) {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => _userService.CreateUser(name, email));
    }
    
    [Theory]
    [InlineData("John", null)]
    [InlineData("John", "")]
    public void CreateUser_WithInvalidEmail_ShouldThrowException(string name, string email) {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => _userService.CreateUser(name, email));
    }
}
```

---

## 🎯 Coverage Goals

### What "80%+ Coverage" Means

**Line Coverage:** 80%+ of executable lines are tested
**Branch Coverage:** 70%+ of conditional branches are tested
**Method Coverage:** 95%+ of public methods have tests

### How We Achieve It

1. **Happy Path Tests**: Every public method has at least one test for the expected success scenario
2. **Edge Case Tests**: Null parameters, empty collections, boundary values (0, -1, MAX)
3. **Exception Tests**: Invalid inputs, error conditions
4. **Branch Coverage**: Each conditional branch (if/else) is tested
5. **Indirect Coverage**: Private methods are covered via public method tests

### Not Just Coverage Fluff

Generated tests are **meaningful**, not just coverage boosters:
- ✅ Real assertions (not just `assertNotNull()`)
- ✅ Business logic validation
- ✅ Mock verification (did dependencies get called?)
- ✅ Exception message verification
- ✅ State assertions

---

## 📊 Verifying Coverage

### Java (JaCoCo)

**Step 1:** Add JaCoCo plugin to `pom.xml`:
```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.11</version>
    <executions>
        <execution>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
                <goal>report</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

**Step 2:** Run tests with coverage:
```bash
mvn clean test
mvn jacoco:report
```

**Step 3:** Open report:
```bash
open target/site/jacoco/index.html
```

### .NET (Coverlet)

**Step 1:** Install Coverlet:
```bash
dotnet add package coverlet.collector
```

**Step 2:** Run tests with coverage:
```bash
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=opencover
```

**Step 3:** Generate HTML report:
```bash
dotnet tool install -g dotnet-reportgenerator-globaltool
reportgenerator -reports:coverage.opencover.xml -targetdir:coveragereport
open coveragereport/index.html
```

---

## 🔧 Configuration Options

### Integrated Workflow Options

When running **"Generate Domain-Driven APIs"** with **"Generate everything now"**:

**Test Generation Options:**
- ✅ **Generate unit tests (80%+ coverage)** [Recommended]
  - Auto-generates tests after each Spring Boot project
  - Targets 80%+ coverage with edge cases
  - Includes Jira comment with coverage metrics
  - Adds ~30-60 seconds per domain (worth it!)
  
- ❌ **Skip test generation**
  - Only generates Spring Boot code
  - You must manually generate tests later
  - Story marked complete without tests (not recommended)

### Target Coverage

**In integrated workflow:** Fixed at 80% (optimal balance)

**In manual workflow:** When generating tests manually, you can select:
- **80%** (Default - Recommended for most projects)
- **85%** (High coverage - good for critical business logic)
- **90%** (Very high - may be excessive, diminishing returns)
- **Custom** (Enter any value 50-100%)

### Test Frameworks Supported

- **Java**: JUnit 5 + Mockito
- **C#**: xUnit + Moq + FluentAssertions

---

## 💡 Best Practices

### When to Use Integrated Test Generation

**Always use for:**
- ✅ New domain-driven API development
- ✅ Microservices with 5+ endpoints
- ✅ Production code requiring 80%+ coverage
- ✅ Stories that must be "done done" with tests
- ✅ Projects with strict quality gates

**Skip test generation for:**
- ❌ Proof-of-concept / throwaway code
- ❌ Code you plan to significantly refactor
- ❌ Simple CRUD with no business logic
- ❌ When time is extremely constrained (can generate later)

### Workflow Recommendations

**Recommended: Integrated Workflow**
```
Generate Domain-Driven APIs 
→ Generate everything now 
→ ✅ Generate unit tests
→ 80%+ coverage automatically
```

**Alternative: Manual Later**
```
Generate Domain-Driven APIs 
→ Generate everything now 
→ ❌ Skip tests
→ Later: DevEx: Generate Unit Tests for Entire Project
```

### Do's ✅
- **Review generated tests** - AI is smart but not perfect
- **Adjust assertions** - Match your business logic
- **Add domain-specific tests** - AI doesn't know your business rules
- **Run tests frequently** - Make sure they pass
- **Commit tests with code** - Treat tests as first-class code

### Don'ts ❌
- **Don't blindly trust 100% coverage** - Quality > quantity
- **Don't skip review** - Generated tests need human validation
- **Don't ignore failing tests** - Fix them or remove them
- **Don't test private methods directly** - Test through public APIs
- **Don't mock everything** - Use real objects when possible (e.g., DTOs)

---

## 🎬 Demo: End-to-End Example

**Scenario:** Generate tests for `OrderService.java` in a Spring Boot app

**Step 1:** Open `OrderService.java`
```java
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    
    public Order createOrder(Long userId, List<OrderItem> items) {
        if (items == null || items.isEmpty()) {
            throw new InvalidOrderException("Order must have items");
        }
        // ... business logic
    }
    
    public void cancelOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        
        if (order.getStatus() == OrderStatus.SHIPPED) {
            throw new OrderAlreadyShippedException(orderId);
        }
        
        paymentService.refund(order.getPaymentId());
        order.setStatus(OrderStatus.CANCELLED);
        orderRepository.save(order);
    }
}
```

**Step 2:** Right-click → **"Generate Unit Tests"**

**Step 3:** Select **80%** coverage

**Step 4:** AI Analysis:
```
Class: OrderService
Methods to Test: 2
Estimated Tests: 8
Expected Coverage: ~85%

Methods:
• createOrder(...) - null items, empty items, valid items
• cancelOrder(...) - not found, already shipped, successful cancel
```

**Step 5:** Click **"Generate Tests"**

**Step 6:** Generated `OrderServiceTest.java` with 8 tests:
1. `createOrder_withValidItems_shouldCreateOrder()`
2. `createOrder_withNullItems_shouldThrowException()`
3. `createOrder_withEmptyItems_shouldThrowException()`
4. `cancelOrder_withValidOrder_shouldCancelAndRefund()`
5. `cancelOrder_withNonExistentOrder_shouldThrowNotFoundException()`
6. `cancelOrder_withShippedOrder_shouldThrowException()`
7. `cancelOrder_shouldCallRefundService()`
8. `cancelOrder_shouldUpdateOrderStatus()`

**Step 7:** Run tests:
```bash
mvn test
```

**Result:**
```
Tests run: 8, Failures: 0, Errors: 0, Skipped: 0
Coverage: 87%
```

✅ **Done!** 8 comprehensive tests covering all edge cases and business logic.

---

## 🚨 Troubleshooting

### "GitHub Copilot is not available"
- Ensure you have GitHub Copilot subscription
- Check VS Code settings: Copilot enabled
- Reload VS Code

### "Failed to parse analysis JSON"
- Retry generation (AI may have returned invalid JSON)
- Check source file is valid Java/C#
- Report issue if persists

### "Tests don't compile"
- Review generated imports
- Check framework versions match your project
- Adjust package names if needed

### "Coverage lower than expected"
- Run coverage report to see actual numbers
- Add additional tests for complex branches
- Review private method coverage (may need indirect tests)

---

## 📈 Metrics & ROI

### Time Savings

**Manual Test Writing:**
- 5-10 minutes per test method
- 15 tests = 75-150 minutes (1.25-2.5 hours)

**AI-Generated Tests:**
- 30 seconds analysis + generation
- **Time Saved: ~2 hours per class**

**For 50-class project:**
- Manual: ~100 hours
- AI-Generated: ~30 minutes
- **Time Saved: 99.5 hours**

**For Domain-Driven APIs (17 domains):**
- Manual: ~34 hours (2 hours × 17 domains)
- Integrated Auto-Generation: ~15 minutes (30 sec × 17 domains + 7.5 min API calls)
- **Time Saved: ~33.75 hours (99.3% reduction)**

### Quality Improvements

- ✅ Consistent test structure across codebase
- ✅ Fewer missed edge cases
- ✅ Better mock usage patterns
- ✅ Immediate coverage for new code
- ✅ Reduced production bugs
- ✅ **Tests created before story marked complete** (Definition of Done)
- ✅ **Coverage metrics tracked in Jira** (visibility)

---

## 🤝 Integration with MaintainabilityAI

This feature directly supports the **MaintainabilityAI framework**:

✅ **Risk Adverse Development** - Comprehensive tests catch issues before production
✅ **AI Enabled Engineering Excellence** - 80%+ coverage without manual effort
✅ **Vulnerability Free Code** - Edge case tests prevent security bugs
✅ **Future Ready Talent** - Engineers learn to leverage AI for testing
✅ **Enhanced Collaboration** - Consistent test patterns across squads
✅ **Engineer Rotational Program Support** - Standardized testing practices

---

## 🎓 Training & Adoption

### Team Rollout Plan

**Week 1: Demo & Training**
- Demo test generation to engineering team
- Show coverage improvements
- Highlight time savings

**Week 2: Pilot**
- 2-3 engineers use on new features
- Gather feedback
- Refine prompts

**Week 3: Rollout**
- All engineers use for new code
- Track coverage metrics
- Celebrate wins

**Week 4: Optimization**
- Review generated test quality
- Adjust coverage targets per project
- Share best practices

---

## 📞 Support

**Questions?** Contact DevEx team or check:
- Internal wiki: [DevEx AI Assistant Docs]
- Slack: #devex-support
- Email: devex@company.com

---

Generated by DevEx AI Assistant
