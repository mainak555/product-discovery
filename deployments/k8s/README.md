# Kubernetes deployment (Helm)

Production-grade Helm chart for product-discovery, optionally with the
**mcp-gateway** sidecar Deployment that hosts MCP servers behind streamable HTTP.

## Layout

```
helm/product-discovery/
  Chart.yaml
  values.yaml              # defaults
  values.example.yaml      # ready-to-edit example
  templates/
    _helpers.tpl
    configmap.yaml         # env + mcp.json
    secret.yaml            # secret env (only if existingSecret unset)
    deployment-app.yaml
    deployment-mcp-gateway.yaml   # rendered when mcpGateway.enabled
    service.yaml
    ingress.yaml
    NOTES.txt
```

## Install

```powershell
helm install discovery deployments/k8s/helm/product-discovery `
    --namespace discovery --create-namespace `
    --values deployments/k8s/helm/product-discovery/values.example.yaml
```

## Required setup before install

- **Mongo**: this chart never installs Mongo. Provide a connection string via
  `secretEnv.MONGODB_URI` (rendered into a Secret) or via `existingSecret`.
- **Redis**: this chart does not install Redis. Provide `secretEnv.REDIS_URI`
  (managed Redis recommended) because active run coordination is fail-fast
  when Redis is unavailable.
- **Container images**: build and push:
  - app image (`deployments/compose/Dockerfile.app` or
    `deployments/standalone/Dockerfile`) → `image.repository:tag`
  - mcp-gateway image (`deployments/compose/Dockerfile.mcp-gateway`) →
    `mcpGateway.image.repository:tag`

## Disabling the MCP sidecar

Set `mcpGateway.enabled=false`. In that case all MCP usage must be via
`StdioServerParams` running inside the app container (which would then
require a Node-enabled app image — use the standalone Dockerfile for that).

## Reaching the MCP gateway from the app

In Project Config → Shared MCP Tools:

```json
{
  "mcpServers": {
    "fs": {
      "transport": "http",
      "url": "http://discovery-product-discovery-mcp-gateway:9000/filesystem/mcp"
    }
  }
}
```

The exact service name is printed in `NOTES.txt` after install.

## Secret management

Prefer `existingSecret` with values supplied by external secret managers
(SealedSecrets, External Secrets, Vault, etc.) over inline `secretEnv` in
`values.yaml`.
