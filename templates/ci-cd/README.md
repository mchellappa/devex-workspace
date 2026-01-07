# CI/CD Templates

Add your organization's CI/CD pipeline configurations here.

## Suggested Templates

Create files for your CI/CD platform:

- `github-actions.yml` - GitHub Actions workflow
- `azure-pipelines.yml` - Azure DevOps
- `jenkins-pipeline.groovy` - Jenkins
- `gitlab-ci.yml` - GitLab CI

## Example GitHub Actions Workflow

Create `.github/workflows/build-deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up JDK 21
      uses: actions/setup-java@v4
      with:
        java-version: '21'
        distribution: 'temurin'
        cache: maven
    
    - name: Build with Maven
      run: mvn clean package -DskipTests
    
    - name: Run Tests
      run: mvn test
    
    - name: Build Docker Image
      run: docker build -t {{artifactId}}:${{ github.sha }} .
    
    - name: Push to Registry
      if: github.ref == 'refs/heads/main'
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker push {{artifactId}}:${{ github.sha }}
    
    - name: Deploy to Kubernetes
      if: github.ref == 'refs/heads/main'
      run: |
        kubectl apply -f kubernetes/
        kubectl set image deployment/{{artifactId}} {{artifactId}}={{artifactId}}:${{ github.sha }}
```

## Example Azure Pipelines

Create `azure-pipelines.yml`:

```yaml
trigger:
  - main
  - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  imageName: '{{artifactId}}'
  imageTag: '$(Build.BuildId)'

stages:
- stage: Build
  jobs:
  - job: BuildJob
    steps:
    - task: Maven@4
      inputs:
        mavenPomFile: 'pom.xml'
        goals: 'clean package'
        options: '-DskipTests'
        javaHomeOption: 'JDKVersion'
        jdkVersionOption: '1.21'
    
    - task: Docker@2
      inputs:
        command: 'buildAndPush'
        repository: $(imageName)
        dockerfile: 'Dockerfile'
        tags: |
          $(imageTag)
          latest

- stage: Deploy
  condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
  jobs:
  - deployment: DeployJob
    environment: 'production'
    strategy:
      runOnce:
        deploy:
          steps:
          - task: KubernetesManifest@1
            inputs:
              action: 'deploy'
              manifests: 'kubernetes/*.yml'
```

Engineers can insert these templates into their projects using the extension.
