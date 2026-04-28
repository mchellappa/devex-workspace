---
name: spring-boot-testing
description: "Patterns and conventions for testing Spring Boot applications with JUnit 5, Mockito, and MockMvc. Use this skill when asked to write, review, or improve tests for Spring Boot services, controllers, or repositories."
---

## Spring Boot Testing Conventions

### Test Layer Strategy

| What to test | Annotation | Loads |
|---|---|---|
| Controller (HTTP layer) | `@WebMvcTest(MyController.class)` | Only web slice |
| Service (business logic) | Plain JUnit + Mockito | Nothing |
| Repository (custom queries) | `@DataJpaTest` | JPA slice only |
| Full integration | `@SpringBootTest` + `@AutoConfigureMockMvc` | Whole context |

### Service Unit Test Template

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private OrderServiceImpl orderService;

    @Test
    void createOrder_validRequest_returnsCreatedOrder() {
        // Arrange
        var request = new CreateOrderRequest("customer-1", List.of());
        var savedOrder = Order.builder().id(1L).customerId("customer-1").build();
        when(orderRepository.save(any(Order.class))).thenReturn(savedOrder);

        // Act
        var result = orderService.createOrder(request);

        // Assert
        assertThat(result.id()).isEqualTo(1L);
        verify(orderRepository).save(any(Order.class));
    }

    @Test
    void getOrder_notFound_throwsResourceNotFoundException() {
        when(orderRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderService.getOrder(99L))
            .isInstanceOf(ResourceNotFoundException.class)
            .hasMessageContaining("99");
    }
}
```

### Controller Test Template (MockMvc)

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private OrderService orderService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void createOrder_validBody_returns201() throws Exception {
        var request = new CreateOrderRequest("customer-1", List.of());
        var response = new OrderResponse(1L, "customer-1", "PENDING");
        when(orderService.createOrder(any())).thenReturn(response);

        mockMvc.perform(post("/api/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(1L))
            .andExpect(header().exists("Location"));
    }

    @Test
    void createOrder_missingCustomerId_returns422() throws Exception {
        var request = Map.of("customerId", "");  // blank — should fail @NotBlank

        mockMvc.perform(post("/api/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isUnprocessableEntity());
    }
}
```

### Repository Test Template

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void findByCustomerId_existingCustomer_returnsOrders() {
        // Arrange — use @Sql or save entities directly
        var order = orderRepository.save(Order.builder().customerId("c-1").build());

        // Act
        var results = orderRepository.findByCustomerId("c-1");

        // Assert
        assertThat(results).hasSize(1);
        assertThat(results.get(0).getCustomerId()).isEqualTo("c-1");
    }
}
```

### Naming Convention

```
methodName_stateUnderTest_expectedBehavior
```

Examples:
- `createOrder_validRequest_returnsCreatedOrder`
- `getOrder_notFound_throwsResourceNotFoundException`
- `updateOrder_invalidStatus_throwsIllegalStateException`

### Coverage Targets

For each method, write tests for:
1. Happy path (valid input, returns expected output)
2. Not-found / empty result
3. Validation failure (invalid input)
4. Concurrent modification (where applicable)

Always use `assertThat` from AssertJ (not JUnit's `assertEquals`). Use `@ParameterizedTest` with `@CsvSource` for data-driven tests.
