# Deployment Templates

This folder contains enterprise deployment templates for your Spring Boot projects.

## Folder Structure

- **kubernetes/** - Kubernetes manifests (deployment.yml, service.yml, etc.)
- **docker/** - Docker configurations (Dockerfile, docker-compose.yml)
- **ci-cd/** - CI/CD pipeline configurations (GitHub Actions, Jenkins, etc.)

## How to Use

1. Add your organization's standard deployment templates to the appropriate folders
2. Engineers can insert these templates into their generated projects using the command palette
3. Templates support Handlebars syntax for dynamic values like `{{projectName}}`, `{{version}}`, etc.

## Example Templates to Add

### Kubernetes
- `deployment.yml` - Kubernetes deployment manifest
- `service.yml` - Kubernetes service
- `configmap.yml` - Configuration management
- `ingress.yml` - Ingress rules
- `hpa.yml` - Horizontal Pod Autoscaler

### Docker
- `Dockerfile` - Container image definition
- `docker-compose.yml` - Local multi-container setup
- `.dockerignore` - Files to exclude from image

### CI/CD
- `github-actions.yml` - GitHub Actions workflow
- `jenkins-pipeline.groovy` - Jenkins pipeline
- `azure-pipelines.yml` - Azure DevOps pipeline

## Best Practices

- Use descriptive file names
- Include comments explaining configurations
- Use environment variables for sensitive data
- Follow your organization's security standards
- Test templates before adding them

---

**Note:** The extension will automatically discover templates in these folders and make them available through the "Insert Deployment Template" command.
