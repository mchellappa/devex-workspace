---
name: java-code-review
description: "Java-specific code review checklist covering null safety, exception handling, streams, immutability, concurrency, and Spring Boot patterns. Use this skill when asked to review Java code, check for common Java bugs, or audit a PR for Java best practices."
---

## Java Code Review Checklist

### Null Safety

- [ ] `Optional.get()` is never called without `isPresent()` — use `orElseThrow()` or `orElse()`
- [ ] Methods that can legitimately return nothing return `Optional<T>`, not `null`
- [ ] `@NonNull` / `@NotNull` annotations on method parameters where null is invalid
- [ ] Collections returned from methods are never `null` — return `Collections.emptyList()` or `List.of()`

```java
// ❌ Bad
String name = user.getName();
if (name != null) { ... }

// ✅ Good
user.findName().ifPresent(name -> { ... });
// or
String name = user.findName().orElseThrow(() -> new NotFoundException("name missing"));
```

### Exception Handling

- [ ] Checked exceptions are only used for recoverable errors — unrecoverable = `RuntimeException`
- [ ] `catch (Exception e)` is avoided — catch the specific type
- [ ] Exceptions are never swallowed silently (`catch (e) {}`)
- [ ] Logged exceptions include context: `log.error("Failed to process order {}", orderId, e)`
- [ ] `finally` blocks that close resources use `try-with-resources` instead

```java
// ❌ Bad
try {
    process();
} catch (Exception e) {
    log.error("Error"); // no context, no exception
}

// ✅ Good
try (var resource = openResource()) {
    process(resource);
} catch (ProcessingException e) {
    log.error("Failed to process order {}", orderId, e);
    throw new ServiceException("Order processing failed", e);
}
```

### Streams & Collections

- [ ] Streams are not reused after terminal operation
- [ ] `collect(Collectors.toList())` replaced with `toList()` (Java 16+) or `stream().toList()`
- [ ] `parallelStream()` is only used for CPU-bound work on large datasets (> 10k elements)
- [ ] `forEach` with side effects avoided — use explicit loops for mutation
- [ ] Large stream pipelines are broken up and given named intermediate variables for readability

### Immutability

- [ ] DTOs and value objects use Java `record` (Java 16+) or have only final fields
- [ ] `List.of()` / `Map.of()` used for static data (not `new ArrayList<>()`)
- [ ] Builder pattern used for objects with > 3 constructor parameters

### Concurrency

- [ ] Shared mutable state is synchronized or uses `java.util.concurrent` types
- [ ] `HashMap` replaced with `ConcurrentHashMap` in concurrent contexts
- [ ] Spring `@Async` methods return `CompletableFuture<T>`, not `void` (enables error propagation)
- [ ] `@Transactional` boundaries do not span async method calls

### String Handling

- [ ] String concatenation in loops uses `StringBuilder` or `String.format` / `formatted()`
- [ ] `String.equals()` called on the known-non-null string: `"constant".equals(variable)`
- [ ] Sensitive strings (passwords, tokens) are `char[]`, not `String` (GC reachability)

### Spring-Specific

- [ ] `@Autowired` on fields avoided — use constructor injection (enables immutability + testability)
- [ ] `@Value` used for simple config values; `@ConfigurationProperties` for grouped config
- [ ] `@Transactional` is on the service layer, not the controller
- [ ] `RestTemplate` replaced with `WebClient` or `RestClient` (Spring 6.1+) for HTTP calls
- [ ] `@Scheduled` methods have `fixedDelay` (not `fixedRate`) unless parallel execution is intentional

### Performance Red Flags

- [ ] `N+1` query — fetching a collection and then loading related entities in a loop
- [ ] Instantiating heavy objects (parsers, clients) inside loops — should be class-level fields
- [ ] Logging at `DEBUG` level inside hot paths (check `log.isDebugEnabled()` guard)
- [ ] `LocalDate.now()` / `Instant.now()` called multiple times in one transaction — call once

### Code Readability

- [ ] Method length < 30 lines (extract helper methods for longer logic)
- [ ] Magic numbers/strings extracted to named constants or enums
- [ ] Boolean method names start with `is`, `has`, `can`, `should`
- [ ] Complex conditions extracted to well-named boolean variables or methods
