---
name: github-actions-debugging
description: "Step-by-step process for diagnosing and fixing failing GitHub Actions workflows. Use this skill when asked to debug CI/CD failures, fix workflow errors, investigate build or test failures, or resolve deployment pipeline issues."
---

## GitHub Actions Debugging Process

Follow this process when a workflow is failing:

### Step 1 — Identify the Failing Step

1. Open the workflow run in GitHub Actions UI (or use MCP tools)
2. Find the first red step in the job — failures cascade, so fix the first one first
3. Expand the step logs to see the exact error message
4. Note the **exit code** and **error message** before investigating further

### Step 2 — Classify the Failure Type

| Symptom | Likely cause |
|---|---|
| `Error: Process completed with exit code 1` on build step | Compilation error or test failure |
| `npm ERR!` / `mvn error` | Dependency resolution failure |
| `Error: Unrecognized action` | Wrong action name or version |
| `Error: Context access might be invalid` | Wrong expression syntax (`${{ }}`) |
| `Permission denied` on shell command | Missing `chmod` or wrong file ownership |
| `Error: Resource not accessible by integration` | Insufficient `permissions` in workflow |
| Docker push `unauthorized` | Registry auth not configured / expired |
| `kubectl` `server: 404` | Wrong cluster context or namespace |

### Step 3 — Check Environment Variables & Secrets

```yaml
# Debug: print available env vars (safe — does NOT print secret values)
- name: Debug environment
  run: env | sort | grep -v 'SECRET\|TOKEN\|KEY\|PASS'
```

- Verify secrets exist in the correct scope (repo vs. environment vs. org)
- Check that `secrets.CONTEXT` matches the calling level
- Verify environment-level secrets require the correct environment approval

### Step 4 — Dependency & Cache Issues

If failing on `npm install` or `mvn install`:

```yaml
# Clear cache and retry — add this before install step
- name: Clear npm cache
  run: npm cache clean --force

# Or for Maven
- name: Clear Maven cache
  run: rm -rf ~/.m2/repository
```

Check for:
- Version pinning mismatches (`package-lock.json` out of sync — run `npm install` locally)
- Private registry auth (`~/.npmrc` or `settings.xml` not configured in CI)
- Network timeout — add retry logic or `--retry` flags

### Step 5 — Test Failures

If tests are passing locally but failing in CI:
1. Check for **time-sensitive tests** (avoid `Thread.sleep` — use Awaitility)
2. Check for **missing environment variables** the tests require
3. Check for **port conflicts** (Spring Boot starts on 8080 — use `@SpringBootTest(webEnvironment = RANDOM_PORT)`)
4. Check for **database not running** — use TestContainers or H2 in-memory
5. Look for **parallel test execution** causing shared state issues

### Step 6 — Docker/Registry Issues

```yaml
# Standard ACR login pattern
- name: Log in to ACR
  uses: azure/docker-login@v1
  with:
    login-server: ${{ vars.ACR_LOGIN_SERVER }}
    username: ${{ secrets.ACR_USERNAME }}
    password: ${{ secrets.ACR_PASSWORD }}
```

- Verify image tag does not contain illegal characters (no `+`, spaces)
- Check that `docker buildx` is set up for multi-platform builds
- Confirm the ACR service principal has `AcrPush` role

### Step 7 — Kubernetes Deployment Failures

```yaml
# Add --wait and check rollout status
- name: Deploy to AKS
  run: |
    kubectl apply -f k8s/
    kubectl rollout status deployment/my-service --timeout=5m
```

If rollout fails:
1. `kubectl describe deployment my-service` — check events
2. `kubectl get pods -l app=my-service` — check pod status
3. `kubectl logs <failing-pod>` — get application error

### Step 8 — Reproduce Locally

```bash
# Run workflow steps locally with act (https://github.com/nektos/act)
act push -j build --secret-file .env.secrets

# Or manually replicate the environment
docker run --rm -it ubuntu:22.04 bash
# Then run the exact commands from the failing step
```

### Common Fixes Reference

| Problem | Fix |
|---|---|
| `GITHUB_TOKEN` insufficient permissions | Add `permissions:` block to job |
| Checkout depth missing git history | `fetch-depth: 0` in `actions/checkout` |
| Concurrent deploy race condition | Add `concurrency:` group to workflow |
| Flaky test in CI only | Add `--rerun-failures` or isolate test |
| OOM in build | Add `-Xmx2g` to `MAVEN_OPTS` or `NODE_OPTIONS=--max-old-space-size=4096` |
