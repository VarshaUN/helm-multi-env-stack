# helm-multi-env-stack

A Helm-based deployment framework for running a microservice stack (frontend + API + Postgres) consistently across dev, staging, and production without copy-pasting Kubernetes manifests per environment.

## The problem

Most teams end up with one of two anti-patterns as they grow: either a single set of Kubernetes manifests hand-edited per environment (drift, forgotten changes, works in dev surprises), or a full separate chart per environment (duplicated templates that rot independently). This project uses one chart, parameterized values files, and real subchart dependencies to avoid both.

## Architecture

                ┌─────────────┐
                │   Ingress   │ (not yet wired — see Roadmap)
                └──────┬──────┘
                       │
          ┌────────────┴────────────┐
          │                         │
    ┌─────▼─────┐            ┌──────▼──────┐
    │  frontend │            │   backend   │
    │  (Nginx)  │───calls───▶│  (Express)  │
    └───────────┘            └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │ PostgreSQL  │
                              │  (Bitnami   │
                              │  subchart)  │
                              └─────────────┘

                              
`charts/app-stack` is the umbrella chart. `frontend` and `backend` are local subcharts; `postgresql` is a pinned Bitnami dependency. Environment differences (replica counts, resource limits, autoscaling, persistence) live entirely in `values-dev.yaml` / `values-staging.yaml` / `values-prod.yaml`  the templates themselves never change per environment.

## What's actually in each environment

| | dev | staging | prod |
|---|---|---|---|
| Frontend/backend replicas | 1 | 2 | 3 |
| Postgres persistence | disabled | 1Gi | 5Gi |
| Resource limits | minimal | moderate | production-sized |

## Secrets

Two approaches are demonstrated here, deliberately:

- **`secrets-<env>.yaml`** (gitignored, `secrets-dev.yaml.example` committed as a template) .The baseline pattern: real values never touch git, layered in at deploy time with `-f`.
- **External Secrets Operator**: a more realistic setup for teams already running a secrets backend. `charts/app-stack/eso/` sets up a `SecretStore` (kubernetes provider), RBAC scoped to a single namespace, and an `ExternalSecret` that syncs a password into the cluster and feeds it to the Postgres chart via `auth.existingSecret`. The `vault-mock` namespace stands in for an external secrets manager (AWS Secrets Manager, Vault, etc.) swapping the provider block in `secretstore.yaml` is the only change needed to point this at a real one.

## Running it locally

Requires `helm`, `kubectl`, `kind` (or `k3d`), `docker`.

```bash
kind create cluster --name helm-demo
kind load docker-image <your-dockerhub-username>/helm-demo-frontend:v1 --name helm-demo
kind load docker-image <your-dockerhub-username>/helm-demo-backend:v1 --name helm-demo

helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update charts/app-stack

helm install app-stack charts/app-stack -f charts/app-stack/values-dev.yaml
kubectl get pods -w
```

Switch environments with `helm upgrade`:
```bash
helm upgrade app-stack charts/app-stack -f charts/app-stack/values-prod.yaml
```

## CI

GitHub Actions runs `helm lint` and `helm template` against all three environments on every push/PR a broken `values-prod.yaml` fails CI even if dev renders fine. See `.github/workflows/helm-ci.yml`.

## Gotchas I hit building this (kept here so you don't have to relearn them)

- **Bitnami discontinued free unauthenticated images** at `docker.io/bitnami/*` in August 2025. This chart pins `postgresql.image.repository` and `volumePermissions.image.repository` to `bitnamilegacy/*` instead. Those images are frozen and unpatched  fine for local/demo use, not for anything you'd actually run in production long-term.
- **`file://` chart dependencies get packaged, not linked.** Editing a subchart's `templates/` or `values.yaml` does nothing until you rerun `helm dependency update` it repackages the `.tgz` snapshot Helm actually reads from.
- **Liveness/readiness probes need `initialDelaySeconds`.** Without it, Kubernetes starts health-checking before the app finishes booting, kills it, and you get a restart loop that looks like an application bug but isn't.


## Roadmap

- [ ] Ingress + TLS
- [ ] HPA re-enabled per environment
- [ ] ArgoCD-based GitOps deployment instead of manual `helm upgrade`

## License

MIT