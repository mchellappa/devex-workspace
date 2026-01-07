# Docker Templates

Add your organization's Docker configurations here.

## Suggested Templates

Create the following files:

- `Dockerfile` - Multi-stage build for Spring Boot
- `docker-compose.yml` - Local development setup
- `.dockerignore` - Files to exclude from image

## Example Dockerfile

```dockerfile
# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Create non-root user
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

## Example docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/{{artifactId}}
    depends_on:
      - db
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB={{artifactId}}
      - POSTGRES_USER=dbuser
      - POSTGRES_PASSWORD=dbpass
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

Engineers can insert these templates into their projects using the extension.
