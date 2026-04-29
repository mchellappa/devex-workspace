---
name: kubernetes-deployment
description: "Best practices for Kubernetes manifests, Helm charts, AKS deployments, and resource configuration. Use this skill when asked to create, review, or troubleshoot Kubernetes deployments, services, config maps, secrets, ingress rules, or Helm charts."
---

## Kubernetes Deployment Best Practices

### Minimum Required Manifests

Every microservice deployment needs:
1. `Deployment` (or `StatefulSet` for stateful workloads)
2. `Service` (ClusterIP for internal, LoadBalancer/Ingress for external)
3. `ConfigMap` for non-sensitive configuration
4. `Secret` (via sealed-secrets or Key Vault CSI — never plaintext in git)
5. `HorizontalPodAutoscaler`
6. `PodDisruptionBudget`

### Deployment Template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  labels:
    app: order-service
    version: "1.0.0"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
        version: "1.0.0"
    spec:
      serviceAccountName: order-service-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: order-service
          image: myacr.azurecr.io/order-service:$(IMAGE_TAG)
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
          envFrom:
            - configMapRef:
                name: order-service-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: order-service-secrets
                  key: db-password
          volumeMounts:
            - name: tmp
              mountPath: /tmp  # needed if readOnlyRootFilesystem: true
      volumes:
        - name: tmp
          emptyDir: {}
```

### Resource Sizing Guidelines

| Service type | CPU request | CPU limit | Mem request | Mem limit |
|---|---|---|---|---|
| Lightweight API | 50m | 200m | 128Mi | 256Mi |
| Spring Boot API | 100m | 500m | 256Mi | 512Mi |
| Data-intensive | 200m | 1000m | 512Mi | 1Gi |
| Batch job | 500m | 2000m | 512Mi | 2Gi |

### HPA Configuration

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Common Troubleshooting Steps

1. **Pod not starting**: `kubectl describe pod <name>` — check Events section
2. **CrashLoopBackOff**: `kubectl logs <pod> --previous` — check last run logs
3. **Pending pod**: Check node resources with `kubectl describe node`; check PVC binding
4. **Service not reachable**: Verify `selector` labels match pod labels exactly
5. **OOMKilled**: Increase memory limit; add `-XX:MaxRAMPercentage=75.0` JVM flag
6. **Slow startup**: Increase `initialDelaySeconds` on probes; add `startupProbe`

### AKS-Specific Patterns

- Use **Workload Identity** (not pod-managed identity) for Azure service authentication
- Use **Azure Key Vault CSI Driver** for secrets — never `kubectl create secret` from pipeline
- Enable **Azure Policy** add-on for automated compliance checks
- Use **node taints** to separate system/user workloads
- Set **pod anti-affinity** to spread replicas across nodes:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          topologyKey: kubernetes.io/hostname
          labelSelector:
            matchLabels:
              app: order-service
```
