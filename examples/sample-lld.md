# Order Management Service - Low Level Design

## 1. Overview

The Order Management Service is a RESTful microservice responsible for handling customer orders in our e-commerce platform. It manages the complete order lifecycle from creation to fulfillment.

## 2. Service Responsibilities

- Create and manage customer orders
- Track order status and history
- Integrate with inventory and payment services
- Generate order reports
- Send order notifications

## 3. Architecture

### 3.1 Technology Stack

- **Framework**: Spring Boot 3.4.1
- **Language**: Java 21
- **Database**: PostgreSQL
- **Caching**: Redis
- **Messaging**: RabbitMQ
- **API Documentation**: OpenAPI 3.0

### 3.2 Service Boundaries

```
┌─────────────────────────────────────────┐
│     Order Management Service            │
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │Controller│──│  Service │           │
│  └──────────┘  └──────────┘           │
│       │             │                  │
│       │        ┌────┴────┐            │
│       │        │Repository│            │
│       │        └────┬────┘            │
└───────┼─────────────┼──────────────────┘
        │             │
        │        ┌────▼────┐
        │        │PostgreSQL│
        │        └─────────┘
        │
   ┌────▼────────────────┐
   │  External Services  │
   ├────────────────────┤
   │ - Inventory Service │
   │ - Payment Service   │
   │ - Notification Svc  │
   └────────────────────┘
```

## 4. API Endpoints

See `order-management-api.yaml` for complete API specification.

### 4.1 Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /orders | Create new order |
| GET | /orders | List all orders (paginated) |
| GET | /orders/{id} | Get order by ID |
| PUT | /orders/{id} | Update order |
| DELETE | /orders/{id} | Cancel order |
| GET | /orders/{id}/status | Get order status |
| PUT | /orders/{id}/status | Update order status |

## 5. Sequence Diagrams

### 5.1 Create Order Flow

```
┌──────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────┐
│Client│  │API Gateway│  │Order Service │  │Inventory │  │Payment  │
└──┬───┘  └─────┬────┘  └──────┬───────┘  └────┬─────┘  └────┬────┘
   │            │               │               │             │
   │ POST /orders                │               │             │
   │─────────────────────────────>              │             │
   │            │               │               │             │
   │            │  Validate request              │             │
   │            │               │               │             │
   │            │  Check inventory               │             │
   │            │               ├──────────────>│             │
   │            │               │               │             │
   │            │               │◄──────────────┤             │
   │            │               │  Available    │             │
   │            │               │               │             │
   │            │  Process payment               │             │
   │            │               ├─────────────────────────────>
   │            │               │               │             │
   │            │               │◄─────────────────────────────┤
   │            │               │               │   Confirmed │
   │            │               │               │             │
   │            │  Create order │               │             │
   │            │               │ (save to DB)  │             │
   │            │               │               │             │
   │            │  Reserve inventory             │             │
   │            │               ├──────────────>│             │
   │            │               │               │             │
   │            │  Send notification (async)     │             │
   │            │               │               │             │
   │◄─────────────────────────────              │             │
   │  201 Created              │               │             │
   │  Order ID: 12345          │               │             │
```

### 5.2 Get Order Status Flow

```
┌──────┐  ┌──────────────┐  ┌──────────┐
│Client│  │Order Service │  │ Database │
└──┬───┘  └──────┬───────┘  └────┬─────┘
   │             │               │
   │ GET /orders/{id}/status     │
   │────────────>│               │
   │             │               │
   │             │ Query order   │
   │             ├──────────────>│
   │             │               │
   │             │◄──────────────┤
   │             │ Order data    │
   │             │               │
   │◄────────────┤               │
   │ 200 OK      │               │
   │ Status: SHIPPED             │
```

## 6. Data Model

### 6.1 Order Entity

```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String customerId;
    
    @Column(nullable = false)
    private OrderStatus status; // PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> items;
    
    @Column(nullable = false)
    private BigDecimal totalAmount;
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    @Column
    private LocalDateTime updatedAt;
    
    @Column
    private String shippingAddress;
    
    @Column
    private String paymentMethod;
}
```

### 6.2 Order Item Entity

```java
@Entity
@Table(name = "order_items")
public class OrderItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;
    
    @Column(nullable = false)
    private String productId;
    
    @Column(nullable = false)
    private Integer quantity;
    
    @Column(nullable = false)
    private BigDecimal unitPrice;
    
    @Column(nullable = false)
    private BigDecimal subtotal;
}
```

## 7. Business Rules

### 7.1 Order Creation
- Customer ID must be valid
- All products must be in stock
- Payment must be confirmed before order confirmation
- Minimum order amount: $10
- Maximum order items: 50 per order

### 7.2 Order Cancellation
- Orders can only be cancelled in PENDING or CONFIRMED status
- Refund is processed automatically
- Inventory is released back

### 7.3 Status Transitions

```
PENDING → CONFIRMED → SHIPPED → DELIVERED
    ↓
CANCELLED (only from PENDING or CONFIRMED)
```

## 8. Error Handling

### 8.1 Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| ORD001 | Invalid customer ID | 400 |
| ORD002 | Product out of stock | 409 |
| ORD003 | Payment failed | 402 |
| ORD004 | Order not found | 404 |
| ORD005 | Invalid status transition | 400 |
| ORD006 | Order cannot be cancelled | 409 |

### 8.2 Error Response Format

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "status": 400,
  "error": "Bad Request",
  "code": "ORD001",
  "message": "Invalid customer ID provided",
  "path": "/api/orders"
}
```

## 9. Performance Requirements

- **Latency**: 
  - GET requests: < 200ms (p95)
  - POST requests: < 500ms (p95)
- **Throughput**: 1000 requests/second
- **Availability**: 99.9%
- **Data Retention**: 7 years (compliance)

## 10. Security Considerations

- All endpoints require JWT authentication
- Customer can only access their own orders
- Admin role required for order updates
- PCI compliance for payment data (no storage)
- Rate limiting: 100 requests/minute per user

## 11. Monitoring & Observability

### 11.1 Metrics
- Order creation rate
- Order status distribution
- Average order processing time
- Error rate by endpoint
- Database connection pool usage

### 11.2 Logs
- All API requests/responses
- Order status changes
- External service calls
- Error stack traces

### 11.3 Alerts
- Error rate > 5%
- Response time > 1s
- Database connection failures
- External service timeouts

## 12. Integration Points

### 12.1 Inventory Service
- **Endpoint**: `GET /api/inventory/check`
- **Purpose**: Verify product availability
- **Fallback**: Return 409 if service unavailable

### 12.2 Payment Service
- **Endpoint**: `POST /api/payments/process`
- **Purpose**: Process order payment
- **Fallback**: Queue for later processing

### 12.3 Notification Service
- **Endpoint**: `POST /api/notifications/send`
- **Purpose**: Send order confirmations, updates
- **Async**: RabbitMQ message queue

## 13. Deployment

### 13.1 Infrastructure
- Kubernetes cluster
- 3 replicas for HA
- Horizontal Pod Autoscaler (min: 3, max: 10)
- PostgreSQL RDS
- Redis ElastiCache

### 13.2 Environment Variables
- `DATABASE_URL`
- `REDIS_URL`
- `RABBITMQ_URL`
- `INVENTORY_SERVICE_URL`
- `PAYMENT_SERVICE_URL`
- `JWT_SECRET`

## 14. Testing Strategy

- **Unit Tests**: 80% coverage minimum
- **Integration Tests**: All API endpoints
- **Contract Tests**: External service integrations
- **Load Tests**: 1500 req/s sustained
- **Chaos Tests**: Service resilience

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Authors**: Backend Team  
**Reviewers**: Principal Engineer, Architect

---

## Appendix A: Sample Request/Response

### Create Order Request

```json
{
  "customerId": "CUST123456",
  "items": [
    {
      "productId": "PROD001",
      "quantity": 2,
      "unitPrice": 29.99
    },
    {
      "productId": "PROD002",
      "quantity": 1,
      "unitPrice": 49.99
    }
  ],
  "shippingAddress": "123 Main St, City, State 12345",
  "paymentMethod": "CREDIT_CARD"
}
```

### Create Order Response

```json
{
  "id": 12345,
  "customerId": "CUST123456",
  "status": "PENDING",
  "items": [
    {
      "id": 1,
      "productId": "PROD001",
      "quantity": 2,
      "unitPrice": 29.99,
      "subtotal": 59.98
    },
    {
      "id": 2,
      "productId": "PROD002",
      "quantity": 1,
      "unitPrice": 49.99,
      "subtotal": 49.99
    }
  ],
  "totalAmount": 109.97,
  "createdAt": "2025-01-15T10:30:00Z",
  "shippingAddress": "123 Main St, City, State 12345",
  "paymentMethod": "CREDIT_CARD"
}
```
