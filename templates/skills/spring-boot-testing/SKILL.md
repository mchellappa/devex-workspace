---
name: spring-boot-testing
description: "Patterns and conventions for testing Spring Boot applications with JUnit 5, Mockito, and MockMvc. Use this skill when asked to write, review, or improve tests for Spring Boot services, controllers, or repositories."
---

## Spring Boot Testing Conventions

### Test Layer Strategy

| What to test | Annotation | Loads |
|---|---|---|
| Controller (HTTP layer) | `@WebMvcTest` + `@AutoConfigureMockMvc(addFilters = false)` | Only web slice |
| Service (business logic) | Plain JUnit + Mockito | Nothing |
| Repository (custom queries) | `@DataJpaTest` | JPA slice only |
| Full integration | `@SpringBootTest` + `@AutoConfigureMockMvc` | Whole context |

> **`addFilters = false`** is used in controller unit tests because authentication is handled by an external gateway (e.g. APIM). Include security filters only in full integration tests.

### Naming Convention

```
methodName_stateUnderTest_expectedBehavior
```

Examples:
- `create_validRequest_returns201`
- `getById_unknownId_returns404`
- `update_unknownId_throwsResourceNotFoundException`
- `delete_existingId_deletesEntity`
- `findById_unknownId_returnsEmpty`

---

### Service Unit Test Template

```java
@ExtendWith(MockitoExtension.class)
@DisplayName("OrderService Unit Tests")
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderMapper mapper;  // always mock the mapper too

    @InjectMocks
    private OrderService orderService;

    private Order testEntity;
    private CreateOrderRequest testRequest;
    private OrderResponse testResponse;

    @BeforeEach
    void setUp() {
        testEntity = new Order();
        testEntity.setId(1L);

        testRequest = CreateOrderRequest.builder()
                .customerId("customer-1")
                .build();

        testResponse = OrderResponse.builder()
                .id(1L)
                .customerId("customer-1")
                .status("PENDING")
                .build();
    }

    @Test
    @DisplayName("create: valid request → persists and returns created entity")
    void create_validRequest_returnsCreatedOrder() {
        when(mapper.toEntity(testRequest)).thenReturn(testEntity);
        when(orderRepository.save(testEntity)).thenReturn(testEntity);
        when(mapper.toResponse(testEntity)).thenReturn(testResponse);

        OrderResponse result = orderService.create(testRequest);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        verify(mapper).toEntity(testRequest);
        verify(orderRepository).save(testEntity);
        verify(mapper).toResponse(testEntity);
    }

    @Test
    @DisplayName("create: null request → throws IllegalArgumentException")
    void create_nullRequest_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> orderService.create(null))
                .isInstanceOf(IllegalArgumentException.class);

        verify(orderRepository, never()).save(any());
    }

    @Test
    @DisplayName("getById: unknown id → returns empty Optional")
    void getById_unknownId_returnsEmpty() {
        when(orderRepository.findById(999L)).thenReturn(Optional.empty());

        Optional<OrderResponse> result = orderService.getById(999L);

        assertThat(result).isEmpty();
        verify(mapper, never()).toResponse(any());
    }

    @Test
    @DisplayName("update: unknown id → throws ResourceNotFoundException")
    void update_unknownId_throwsResourceNotFoundException() {
        when(orderRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderService.update(999L, testRequest))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Order")
                .hasMessageContaining("999");

        verify(orderRepository, never()).save(any());
    }

    @Test
    @DisplayName("delete: unknown id → throws ResourceNotFoundException")
    void delete_unknownId_throwsResourceNotFoundException() {
        when(orderRepository.existsById(999L)).thenReturn(false);

        assertThatThrownBy(() -> orderService.delete(999L))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(orderRepository, never()).deleteById(any());
    }
}
```

### Controller Test Template (MockMvc)

```java
@WebMvcTest(OrderController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("OrderController Unit Tests")
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private OrderService orderService;

    @Autowired
    private ObjectMapper objectMapper;

    private CreateOrderRequest testRequest;
    private OrderResponse testResponse;

    @BeforeEach
    void setUp() {
        testRequest = CreateOrderRequest.builder()
                .customerId("customer-1")
                .build();

        testResponse = OrderResponse.builder()
                .id(1L)
                .customerId("customer-1")
                .status("PENDING")
                .build();
    }

    @Test
    @DisplayName("create: valid body → 201 Created")
    void create_validRequest_returns201() throws Exception {
        when(orderService.create(any())).thenReturn(testResponse);

        mockMvc.perform(post("/api/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRequest)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(1L));

        verify(orderService).create(any());
    }

    @Test
    @DisplayName("getById: unknown id → 404 Not Found")
    void getById_unknownId_returns404() throws Exception {
        when(orderService.getById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/orders/999"))
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("delete: existing id → 204 No Content")
    void delete_existingId_returns204() throws Exception {
        doNothing().when(orderService).delete(1L);

        mockMvc.perform(delete("/api/v1/orders/1"))
            .andExpect(status().isNoContent());

        verify(orderService).delete(1L);
    }
}
```

### Repository Test Template (@DataJpaTest)

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@DisplayName("OrderRepository Integration Tests")
class OrderRepositoryTest {

    @Autowired
    private OrderRepository orderRepository;

    private Order testEntity;

    @BeforeEach
    void setUp() {
        testEntity = new Order();
        testEntity.setCustomerId("customer-1");
        testEntity.setStatus("PENDING");
    }

    @Test
    @DisplayName("save: valid entity → persists and returns entity with generated id")
    void save_validEntity_persistsAndReturnsEntityWithId() {
        Order saved = orderRepository.save(testEntity);

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getId()).isGreaterThan(0L);
    }

    @Test
    @DisplayName("findById: existing id → returns entity")
    void findById_existingId_returnsEntity() {
        Order saved = orderRepository.save(testEntity);

        Optional<Order> result = orderRepository.findById(saved.getId());

        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    @DisplayName("findById: unknown id → returns empty Optional")
    void findById_unknownId_returnsEmpty() {
        assertThat(orderRepository.findById(999L)).isEmpty();
    }

    @Test
    @DisplayName("deleteById: existing id → removes entity from database")
    void deleteById_existingId_removesEntity() {
        Order saved = orderRepository.save(testEntity);

        orderRepository.deleteById(saved.getId());

        assertThat(orderRepository.findById(saved.getId())).isEmpty();
    }
}
```

### Coverage Targets

For each method, write tests for:
1. **Happy path** — valid input, expected output
2. **Not-found / empty** — missing entity
3. **Null / invalid input** — `IllegalArgumentException` from `Assert.notNull()`
4. **Concurrent / conflict** — where applicable (e.g. duplicate key, optimistic lock)

Always use `assertThat` from AssertJ (not JUnit's `assertEquals`).  
Use `@ParameterizedTest` with `@CsvSource` for data-driven scenarios.
