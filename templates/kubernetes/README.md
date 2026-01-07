# Kubernetes Templates

Add your organization's Kubernetes manifests here.

## Suggested Templates

Create the following files:

- `deployment.yml` - Basic deployment configuration
- `service.yml` - Service definition
- `configmap.yml` - Configuration management
- `secret.yml` - Secrets management (be careful with actual secrets!)
- `ingress.yml` - Ingress rules
- `hpa.yml` - Horizontal Pod Autoscaler
- `namespace.yml` - Namespace definition

## Example deployment.yml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{artifactId}}
  labels:
    app: {{artifactId}}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: {{artifactId}}
  template:
    metadata:
      labels:
        app: {{artifactId}}
    spec:
      containers:
      - name: {{artifactId}}
        image: your-registry/{{artifactId}}:{{version}}
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health
            port: 8080
          initialDelaySeconds: 20
          periodSeconds: 5
```

Engineers can insert these templates into their projects using the extension.
