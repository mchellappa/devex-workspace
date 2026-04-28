---
name: openapi-validation
description: "Guidelines for validating OpenAPI 3.0 specifications for REST completeness, naming consistency, schema quality, and code-generation readiness. Use this skill when asked to validate, review, or improve an OpenAPI spec file."
---

## OpenAPI Validation Checklist

When validating an OpenAPI specification, work through these checks in order:

### 1. Structural Validity

- File is valid YAML/JSON (no parse errors)
- `openapi` field is `3.0.x` (not Swagger 2.0)
- `info` has `title`, `version`, and `description`
- At least one `servers` entry with a URL
- `security` defined globally or on every protected endpoint

### 2. Path & Operation Completeness

For every path and operation, verify:
- `operationId` is present (required for code generation — must be unique and camelCase)
- `summary` is present (short description for SDK docs)
- `description` is present for complex operations
- `tags` groups the operation under a resource name
- All path parameters are defined in `parameters`
- Request body has `content: application/json` with a `$ref` schema
- **All relevant response codes are documented** (at minimum: success + 400 + 401 + 404 where applicable)

```yaml
# Example of a complete operation
/orders/{orderId}:
  get:
    operationId: getOrderById
    summary: Get order by ID
    tags: [Orders]
    parameters:
      - name: orderId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    responses:
      '200':
        description: Order found
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OrderResponse'
      '401':
        $ref: '#/components/responses/Unauthorized'
      '404':
        $ref: '#/components/responses/NotFound'
```

### 3. Schema Quality

For every schema in `components/schemas`:
- Has `description`
- Has `type` defined
- Required fields listed in `required` array
- String fields have `minLength`/`maxLength` where meaningful
- No inline object schemas — always use `$ref`
- Enums have all values documented

### 4. Shared Components

Check that these reusable components exist:
```yaml
components:
  responses:
    BadRequest:        # 400
    Unauthorized:      # 401
    Forbidden:         # 403
    NotFound:          # 404
    UnprocessableEntity: # 422
    InternalServerError: # 500
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    ProblemDetail:     # RFC 7807 error response
    PagedResponse:     # Standard pagination wrapper
```

### 5. Pagination

All `GET` collection endpoints must have:
- `page` query parameter (integer, default 0)
- `size` query parameter (integer, default 20, max 100)
- Response wrapped in `PagedResponse` schema with `content`, `totalElements`, `totalPages`

### 6. Common Issues to Flag

| Issue | Why it matters |
|---|---|
| Missing `operationId` | Breaks code generation (SDK method names) |
| Inline schemas | Cannot be reused; inflates spec |
| `200` on POST creates | Should be `201` with `Location` header |
| No error responses documented | SDK consumers have no error handling guidance |
| `type: object` without `properties` | Generates `Object` in code — useless |
| Required field not in `required` array | SDK treats it as optional |

### 7. Code Generation Readiness

The spec is ready for Spring Boot code generation when:
- All `operationId` values are present and unique
- All request/response bodies reference named schemas in `components`
- All enum values are documented
- No `anyOf`/`oneOf` without discriminators (hard to generate)
- Authentication scheme is defined
