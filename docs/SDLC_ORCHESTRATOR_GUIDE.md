# SDLC Orchestrator Agent - Engineer's Guide

## Overview

The **SDLC Orchestrator** is an intelligent AI agent that guides you through the complete software development lifecycle—from Jira story analysis to production deployment. It automates workflow coordination, enforces quality gates, and ensures you follow best practices at every step.

**Time Savings**: Reduces manual coordination overhead by 70%, turning 4-6 hours of workflow planning into 30 minutes of guided execution.

---

## Quick Start

### 1. Invoke the Agent

Open GitHub Copilot Chat and use the `@` mention:

```
@SDLC Orchestrator I have story SWIFT-12345 to implement
```

The agent will:
1. Analyze your Jira story
2. Detect dependencies and scope
3. Recommend a complete workflow
4. Guide you step-by-step through execution

### 2. Let It Guide You

The orchestrator will present a phase-by-phase plan:

```
📋 Phase 1: Requirements Analysis
✓ Single-repo story detected
✓ RESTful API feature identified

Recommended workflow:
1. ✅ Analyze Jira (DONE)
2. ⏳ Generate LLD from requirements
3. ⏳ Review LLD for completeness  
4. ⏳ Generate OpenAPI specification
5. ⏳ Generate Spring Boot code
6. ⏳ Generate unit tests
7. ⏳ Insert deployment templates
8. ⏳ Complete Jira story

Ready to proceed with Phase 2: Design? (Y/n)
```

### 3. Follow the Plan

Simply respond "Y" or provide feedback. The agent will execute each phase and validate outputs before moving forward.

---

## Common Workflows

### Workflow 1: Complete Feature Development (Most Common)

**When to use**: You have a Jira story and need to implement it end-to-end.

**Prompt**:
```
@SDLC Orchestrator Implement SWIFT-12345 from start to finish
```

**What happens**:
1. **Requirements Analysis** (2 min)
   - Fetches Jira story details
   - Extracts acceptance criteria
   - Creates TODO list
   - Detects multi-repo dependencies

2. **Design Phase** (15-30 min)
   - Generates comprehensive LLD from requirements
   - Includes sequence diagrams, error handling, security
   - Reviews LLD for completeness (API design + software engineering)
   - Iterates based on feedback

3. **API Design** (5-10 min)
   - Generates OpenAPI 3.0 specification from LLD
   - Validates schema consistency
   - Ensures all endpoints documented

4. **Code Generation** (2-5 min)
   - Creates Spring Boot 3.4.1 project (Java 21)
   - Controllers, services, repositories, DTOs
   - Exception handling, security config
   - Docker, Kubernetes, CI/CD templates

5. **Quality Assurance** (10-15 min)
   - Generates unit tests (80%+ coverage)
   - JUnit 5 + Mockito
   - Reviews code for best practices

6. **Deployment** (5 min)
   - Inserts K8s manifests
   - Creates Dockerfile
   - Adds GitHub Actions CI/CD

7. **Completion** (3 min)
   - Creates Pull Request
   - Updates Jira status
   - Adds implementation summary as comment

**Total Time**: ~45-75 minutes (vs 6-8 hours manual)

---

### Workflow 2: Multi-Repo Story

**When to use**: Your Jira story affects multiple microservices.

**Prompt**:
```
@SDLC Orchestrator Help me implement multi-repo story SWIFT-45678
```

**What happens**:
1. Agent detects multi-repo scope from story description
2. Maps affected repositories (interactive if first time)
3. Saves mapping to `.devex/repo-mappings.json` for future use
4. Creates coordination plan with dependencies
5. Guides you through each service implementation
6. Ensures integration points align

**Example**: Story affects both `user-service` and `notification-service`
- Phase 1: Design both service changes
- Phase 2: Identify integration contract (events/APIs)
- Phase 3: Implement user-service first (dependency)
- Phase 4: Implement notification-service (consumer)
- Phase 5: Integration testing guidance

---

### Workflow 3: Design-First Approach

**When to use**: You have a requirements document (PDF/Word/Markdown) or need architectural review.

**Prompt**:
```
@SDLC Orchestrator Generate LLD from my requirements document
```

**What happens**:
1. Reads your requirements document
2. Asks clarifying questions (conversational workflow)
3. Generates comprehensive LLD with:
   - Architecture diagrams
   - Sequence diagrams
   - Security considerations
   - Performance requirements
   - Monitoring strategy
4. Reviews LLD (software engineering completeness)
5. Saves to `.docx` with track changes enabled
6. Proceeds to OpenAPI generation when approved

**Best for**: Complex features requiring upfront design validation

---

### Workflow 4: Quick Implementation (Have OpenAPI)

**When to use**: You already have a validated OpenAPI spec.

**Prompt**:
```
@SDLC Orchestrator I have an OpenAPI spec, generate the Spring Boot project
```

**What happens**:
1. Validates OpenAPI specification
2. Generates Spring Boot project
3. Creates comprehensive unit tests
4. Reviews generated code
5. Inserts deployment templates
6. Clean project structure ready for development

**Time**: ~20-30 minutes (vs 4-5 hours manual setup)

---

### Workflow 5: Resume Interrupted Work

**When to use**: You started a workflow but got interrupted.

**Prompt**:
```
@SDLC Orchestrator Resume completing story SWIFT-12345
```

**What happens**:
1. Checks `.devex/pending-completions.json` for saved state
2. Identifies where you left off
3. Presents remaining steps
4. Continues from last checkpoint

---

## Phase-by-Phase Guide

### Phase 1: Requirements & Planning

**Commands Used**:
- `devex.analyzeJiraTicket` - Smart story analysis
- `devex.fetchMyJiraTickets` - Retrieve assigned work
- `devex.validateLLDAgainstJira` - Coverage check

**What You'll Get**:
- Summarized requirements
- TODO list with acceptance criteria
- Multi-repo detection
- Dependency analysis
- Implementation phases

**Tips**:
- Ensure Jira is configured in settings
- Review TODO list before proceeding
- Ask for clarification if requirements unclear

---

### Phase 2: Design & Architecture

**Commands Used**:
- `devex.generateLLDFromRequirements` - Create LLD
- `devex.reviewLLD` - Validate completeness
- `devex.generateKDD` - Architectural decisions
- `devex.generateCALMArchitecture` - System diagrams

**What You'll Get**:
- Comprehensive LLD (.docx format)
- Software engineering review (error handling, security, monitoring)
- API design review (completeness for code generation)
- CALM architecture diagrams (optional)

**Quality Gates** ✓:
- All requirements covered
- Security considerations documented
- Error handling strategy defined
- Performance requirements specified
- Monitoring/observability planned

**Tips**:
- LLD review happens twice (engineering + API)
- Iterate on feedback before proceeding
- Save LLD for team review/approval

---

### Phase 3: API Design

**Commands Used**:
- `devex.generateOpenAPISpec` - Create from LLD
- `devex.parseOpenAPI` - Validate existing spec

**What You'll Get**:
- OpenAPI 3.0 specification
- Complete schemas for all DTOs
- Error responses documented
- Authentication/authorization defined

**Quality Gates** ✓:
- All endpoints have request/response schemas
- Error codes documented
- Security schemes defined
- No validation errors

**Tips**:
- Review generated spec before code generation
- Ensure contracts align with consumers
- Use OpenAPI preview extensions

---

### Phase 4: Code Generation

**Commands Used**:
- `devex.generateSpringBootProject` - Full microservice
- `devex.implementJiraStory` - Story-specific code
- `devex.addEndpoint` - Quick scaffolding

**What You'll Get**:
- Spring Boot 3.4.1 + Java 21 project
- Controllers, services, repositories
- DTOs, mappers, validators
- Exception handlers
- Security configuration
- Application properties
- Maven POM (dependencies configured)

**Quality Gates** ✓:
- Code follows enterprise patterns
- Exception handling implemented
- Security configured
- Logging added
- Configuration externalized

**Tips**:
- Review generated code structure
- Customize business logic in service layer
- Add custom validations as needed

---

### Phase 5: Quality & Testing

**Commands Used**:
- `devex.generateUnitTests` - 80%+ coverage
- `devex.reviewCode` - AI-powered review
- `devex.validateGeneratedCode` - Verify output

**What You'll Get**:
- JUnit 5 test classes
- Mockito mocks for dependencies
- Edge case coverage
- Error scenario testing
- Code quality feedback

**Quality Gates** ✓:
- 80%+ code coverage
- All controllers tested
- Service layer tested
- Repository layer tested
- Exception scenarios covered

**Tips**:
- Run tests locally before committing
- Review AI feedback on code quality
- Add integration tests manually

---

### Phase 6: Deployment

**Commands Used**:
- `devex.insertDeploymentTemplate` - K8s/Docker/CI-CD

**What You'll Get**:
- Kubernetes deployment manifests
- Docker multi-stage builds
- GitHub Actions workflows
- Azure Pipelines (optional)
- Health check endpoints

**Quality Gates** ✓:
- Docker builds successfully
- K8s manifests validated
- CI/CD pipeline configured
- Health checks working

**Tips**:
- Customize resource limits for your environment
- Update image registry URLs
- Configure secrets management

---

### Phase 7: Completion

**Commands Used**:
- `devex.completeJiraStory` - PR creation + status update
- `devex.addJiraComment` - Document decisions

**What You'll Get**:
- Pull Request created
- Jira status updated (In Review/Done)
- Implementation summary added as comment
- Team notified

**Quality Gates** ✓:
- All tests passing
- Code committed to branch
- PR linked to Jira
- Ready for peer review

**Tips**:
- Review PR before submitting
- Ensure branch naming follows conventions
- Add reviewers manually if needed

---

## Agent Interaction Patterns

### Pattern 1: Interactive Guidance

The agent asks questions and waits for your input:

```
Agent: I detected this is a multi-repo story affecting:
- user-service
- notification-service

Which repository should we start with? (Recommend user-service due to dependency)
1. user-service (creates events)
2. notification-service (consumes events)

Your choice:
```

**Best Practice**: Trust the agent's recommendations initially—they're based on dependency analysis.

---

### Pattern 2: Automatic Execution

For tasks with clear next steps, the agent executes automatically:

```
Agent: ✓ LLD review passed with no blockers
      ⏳ Generating OpenAPI specification...
      ✓ OpenAPI generated successfully
      ⏳ Validating specification...
      ✓ Validation passed - no errors found

Ready to proceed to code generation? (Y/n)
```

**Best Practice**: Review outputs at each checkpoint before proceeding.

---

### Pattern 3: Decision Points

The agent offers choices when multiple paths exist:

```
Agent: Your LLD is complete. Next steps:

A. Generate OpenAPI and proceed to code generation (recommended)
B. Generate KDD to document architectural decisions
C. Generate CALM architecture diagram for stakeholders
D. Validate LLD against Jira story for completeness

Select option or describe custom workflow:
```

**Best Practice**: Choose based on your team's requirements (KDD may be mandatory for your org).

---

## Example Conversations

### Example 1: New Engineer, First Story

**Engineer**:
```
@SDLC Orchestrator I'm new to the team and just got assigned SWIFT-56789. 
What should I do?
```

**Agent**:
```
Welcome! I'll guide you through implementing SWIFT-56789 step-by-step. 🚀

📋 Step 1: Let me analyze the story...
[Fetches Jira details]

Story Summary:
- Type: New Feature
- Component: Payment Service
- Scope: Single repository
- Complexity: Medium

Requirements:
1. Create REST API for payment processing
2. Integrate with Stripe payment gateway
3. Store transaction records
4. Send confirmation emails

I'll guide you through:
Phase 1 ✅ Requirements (DONE)
Phase 2 ⏳ Design (Generate LLD)
Phase 3 ⏳ API Specification
Phase 4 ⏳ Code Generation
Phase 5 ⏳ Testing
Phase 6 ⏳ Deployment
Phase 7 ⏳ PR Creation

This will take about 60-90 minutes total. Ready to start with LLD generation?
(I'll ask clarifying questions to ensure we capture all requirements)
```

---

### Example 2: Experienced Engineer, Fast Track

**Engineer**:
```
@SDLC Orchestrator SWIFT-44556, I have the OpenAPI spec ready, 
just generate code and tests
```

**Agent**:
```
Fast-track mode activated! ⚡

I'll skip design phases and go straight to implementation:
1. ⏳ Validate OpenAPI spec
2. ⏳ Generate Spring Boot project
3. ⏳ Generate unit tests (80%+ coverage)
4. ⏳ Review code quality
5. ⏳ Insert deployment templates

[Validates spec...]
✓ OpenAPI spec is valid - 12 endpoints detected

[Generates project...]
✓ Spring Boot project created
  - 12 controllers
  - 24 services
  - 18 DTOs
  - Exception handlers configured

Estimated time: 15 minutes
Continue? (Y/n)
```

---

### Example 3: Multi-Repo Story

**Engineer**:
```
@SDLC Orchestrator Story SWIFT-78901 affects both order-service 
and inventory-service. How should I approach this?
```

**Agent**:
```
Multi-repo story detected! I'll coordinate the implementation. 🔄

📋 Analysis:
- order-service (creates orders)
- inventory-service (reserves stock)

Integration Pattern: Event-driven
- order-service publishes OrderCreated event
- inventory-service consumes and reserves inventory

Recommended Implementation Order:
1. ✅ Design integration contract (event schema)
2. ⏳ Implement inventory-service first (can be tested independently)
3. ⏳ Implement order-service (publishes events)
4. ⏳ Integration testing guidance

I'll create a coordination plan with phases. First, do you have 
the repository URLs mapped?
[Interactive repo mapping begins...]
```

---

## Tips & Best Practices

### ✅ DO

1. **Trust the Workflow**: The agent knows the optimal sequence—follow recommendations
2. **Review Outputs**: Check LLDs, code, tests at each phase before proceeding
3. **Ask Questions**: The agent can explain any step in detail
4. **Use Checkpoints**: Phase outputs are saved—you can resume anytime
5. **Customize After**: Generate first, then customize business logic
6. **Save Artifacts**: LLDs, OpenAPI specs are reusable for future stories

### ❌ DON'T

1. **Skip Quality Gates**: LLD reviews and code validation prevent rework
2. **Rush Through Phases**: Each phase builds on the previous—validate first
3. **Ignore Multi-Repo Warnings**: Agent detects dependencies—plan accordingly
4. **Manual Workarounds**: Let the agent execute commands—it handles errors better
5. **Forget Context**: Keep conversations in same chat window for context retention

---

## Troubleshooting

### Issue: "Agent doesn't understand my request"

**Solution**: Be specific about your starting point:
```
Bad:  "Help me with my story"
Good: "I have story SWIFT-123 and need to implement it from scratch"
```

---

### Issue: "Agent skipped a phase I wanted"

**Solution**: Explicitly request it:
```
@SDLC Orchestrator Before generating code, I want to create a KDD 
for architectural decisions
```

---

### Issue: "Commands are failing"

**Solution**: Check prerequisites:
1. Jira configured in settings
2. GitHub Copilot active
3. Workspace folder open
4. Required files exist (LLD, OpenAPI, etc.)

Ask the agent:
```
@SDLC Orchestrator Why did the LLD generation fail?
```

---

### Issue: "I need to restart a workflow"

**Solution**: Use resume command:
```
@SDLC Orchestrator Resume completing SWIFT-12345
```

Or start fresh:
```
@SDLC Orchestrator Restart workflow for SWIFT-12345 from Phase 3 (API Design)
```

---

### Issue: "Agent is too verbose / not verbose enough"

**Solution**: Set preferences:
```
@SDLC Orchestrator I prefer minimal explanations, just execute the workflow
```

or

```
@SDLC Orchestrator I'm learning—please explain each step in detail
```

---

## Advanced Usage

### Custom Workflows

You can define custom sequences:

```
@SDLC Orchestrator I want to:
1. Generate LLD from requirements doc
2. Skip OpenAPI generation
3. Manually create API spec
4. Then generate code from my spec

Is this workflow supported?
```

The agent will adapt and guide you through your custom flow.

---

### Parallel Work

For multi-repo stories, you can work in parallel:

```
@SDLC Orchestrator I have two team members. Can we split the 
multi-repo work for SWIFT-99999?
```

Agent will create parallel execution plans for each repository.

---

### Partial Implementations

Start where you are:

```
@SDLC Orchestrator I already have LLD and OpenAPI. Start from code generation.
```

---

## Integration with Team Workflows

### Code Review Process

After agent generates PR:
1. Agent updates Jira status to "In Review"
2. Add peer reviewers manually
3. Address review comments
4. Merge when approved

---

### Architectural Review Board

For stories requiring ARB approval:
1. Generate LLD and KDD
2. Export to team review format
3. Present to ARB
4. Resume workflow after approval:
   ```
   @SDLC Orchestrator ARB approved the design, continue with implementation
   ```

---

### CI/CD Integration

Generated deployment templates work with:
- GitHub Actions (default)
- Azure Pipelines
- Jenkins
- GitLab CI

Customize in Phase 6 (Deployment).

---

## Performance Metrics

Track your productivity gains:

| Phase | Manual Time | With Orchestrator | Savings |
|-------|-------------|-------------------|---------|
| Requirements Analysis | 30-60 min | 5 min | 85% |
| LLD Creation | 4-8 hours | 20-30 min | 92% |
| OpenAPI Generation | 1-2 hours | 5 min | 95% |
| Code Generation | 4-6 hours | 5 min | 98% |
| Unit Test Creation | 2-4 hours | 15 min | 94% |
| Deployment Setup | 1-2 hours | 10 min | 92% |
| **Total** | **12-23 hours** | **1-1.5 hours** | **~93%** |

View your personal metrics:
```
Command Palette → DevEx: View Productivity Dashboard
```

---

## Getting Help

### In-Chat Help

```
@SDLC Orchestrator What commands are available in Phase 4?
@SDLC Orchestrator Explain the difference between LLD and KDD
@SDLC Orchestrator Show me an example workflow for a microservice
```

### Documentation

- **LLD Review Guide**: [docs/LLD_REVIEW_GUIDE.md](LLD_REVIEW_GUIDE.md)
- **Quick Start**: [docs/QUICK_START.md](QUICK_START.md)
- **Test Generation**: [docs/UNIT_TEST_GENERATION_GUIDE.md](UNIT_TEST_GENERATION_GUIDE.md)

### Team Support

- **Slack**: #devex-ai-assistant
- **Wiki**: Internal DevEx knowledge base
- **Office Hours**: Tuesdays 2-3 PM for live help

---

## FAQ

**Q: Can I use this for non-Spring Boot projects?**  
A: Currently optimized for Spring Boot. .NET support coming soon.

**Q: Does this replace code reviews?**  
A: No—it automates generation and enforces patterns, but peer review is still required.

**Q: What if I disagree with the agent's recommendation?**  
A: You're in control—override any suggestion. The agent adapts to your choices.

**Q: Can I customize the generated code templates?**  
A: Yes—templates are in `templates/springboot/`. Customize org-wide standards there.

**Q: How does this affect my productivity metrics?**  
A: The dashboard tracks time saved. Use for self-improvement or team reporting.

**Q: Is my code sent to external services?**  
A: GitHub Copilot processes code per Microsoft's privacy policy. No additional external services.

---

## Quick Reference Card

### Essential Prompts

| Goal | Prompt |
|------|--------|
| Full workflow | `@SDLC Orchestrator Implement story SWIFT-123` |
| Resume work | `@SDLC Orchestrator Resume SWIFT-123` |
| Design only | `@SDLC Orchestrator Generate and review LLD for SWIFT-123` |
| Code only | `@SDLC Orchestrator I have OpenAPI spec, generate Spring Boot project` |
| Multi-repo | `@SDLC Orchestrator Coordinate multi-repo story SWIFT-123` |
| Help | `@SDLC Orchestrator Explain Phase 4` |

### Phase Checklist

- [ ] **Phase 1**: Jira story analyzed, TODO list created
- [ ] **Phase 2**: LLD generated and reviewed (2 reviews passed)
- [ ] **Phase 3**: OpenAPI spec generated and validated
- [ ] **Phase 4**: Spring Boot code generated
- [ ] **Phase 5**: Unit tests generated (80%+ coverage), code reviewed
- [ ] **Phase 6**: Deployment templates inserted (K8s/Docker/CI-CD)
- [ ] **Phase 7**: PR created, Jira updated, team notified

---

## Next Steps

1. **Try It**: Start with a simple story to learn the workflow
2. **Explore**: Experiment with different workflows (design-first, code-first)
3. **Customize**: Adjust templates and settings for your team
4. **Share**: Help teammates adopt the orchestrator
5. **Optimize**: Use dashboard to track and improve productivity

**Happy Engineering! 🚀**
