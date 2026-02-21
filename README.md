# Kubernetes Monitor

Kubernetes Monitor is a namespace triage tool for Kubernetes.

It is designed to answer, quickly:
- what is healthy vs broken now,
- which deployment/pod/container needs attention first,
- whether the latest version degraded or improved CPU/RAM behavior.

## Main Features

- Deployment -> Pods -> Containers -> Logs hierarchy.
- Pod and container status triage with clear health/attention indicators.
- Log viewer with:
  - error/exception/warning quick filters,
  - search,
  - fullscreen mode (`Esc` to exit),
  - jump to log start/end buttons,
  - nearest CPU/RAM % near log lines (based on container limits).
- Continuous resource sampling (CPU/RAM every 30s).
- Version impact scoring:
  - per container (vs previous version),
  - per pod (aggregate),
  - deployment card (latest pod impact).
- Dedicated Version Impact page (`/version-impact`) with:
  - Sketch 1 comparison table,
  - Sketch 2 trend charts,
  - recent 10 versions impact summary.

## Architecture

Runtime components:

1. `pod-watch` Deployment
- serves static UI and local DB API (`scripts/local-db-server.mjs`).
- reads from external PostgreSQL.

2. `pod-watch-collector` CronJob
- collects pods, container states, and logs from Kubernetes API.
- stores original Kubernetes log timestamps (`timestamps=true`).
- writes pod/container/log snapshots to PostgreSQL.

3. `pod-watch-resource-collector` Deployment
- samples container CPU/RAM continuously (`SAMPLE_INTERVAL_SECONDS`, default `30`).
- uses this order:
  - `metrics.k8s.io`,
  - cadvisor metrics endpoint,
  - node summary API.
- writes samples to `container_resource_samples`.

Data flow:

Kubernetes API -> collectors -> PostgreSQL -> app API -> browser UI

## Database Model (high-level)

- `pods`
- `containers`
  - includes parsed resource requests/limits columns:
    - `cpu_request_millicores`, `cpu_limit_millicores`
    - `memory_request_bytes`, `memory_limit_bytes`
- `logs`
  - `timestamp` = log creation timestamp from Kubernetes log stream
  - `created_at` = DB insert time
- `container_resource_samples`

## Repository Paths

- `k8s/deploy-local.yaml` - local cluster manifest
- `k8s/production/deploy.template.yaml` - production template
- `k8s/production/.env.example` - production variables example
- `scripts/k8s-collector.mjs` - pod/status/log collector
- `scripts/k8s-resource-collector.mjs` - CPU/RAM sampler
- `scripts/local-db-server.mjs` - app API + static file server
- `supabase/migrations/ext_local_schema.sql` - external PostgreSQL schema
- `Makefile` - `prod-render` / `prod-apply` workflow

## Prerequisites

- Kubernetes cluster + `kubectl` access
- External PostgreSQL reachable from cluster
- `docker`, `kubectl`, `envsubst`, `make`

## Local Deployment (quick)

1. Build image:

```bash
docker build -t kubernetes-pod-watch:v1.1.x .
```

2. Apply local manifest:

```bash
kubectl apply -f k8s/deploy-local.yaml
kubectl -n pod-watch rollout status deploy/pod-watch
kubectl -n pod-watch rollout status deploy/pod-watch-resource-collector
```

3. Open app:

```bash
kubectl -n pod-watch port-forward service/pod-watch 8080:8080
```

Then open `http://localhost:8080`.

## Production Deployment

### 1) Prepare environment file

```bash
cp k8s/production/.env.example k8s/production/.env.production
```

Edit `k8s/production/.env.production`.

Required variables:

- `APP_NAMESPACE`
- `APP_NAME`
- `APP_VERSION`
- `APP_IMAGE`
- `APP_REPLICAS`
- `CONTAINER_PORT`
- `SERVICE_PORT`
- `SERVICE_TYPE`
- `COLLECT_SCHEDULE`
- `LOG_TAIL_LINES`
- `SAMPLE_INTERVAL_SECONDS`
- `TARGET_NAMESPACE`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SSL`

### 2) Render and apply (recommended)

```bash
make prod-render
make prod-apply
```

Optional:

```bash
make prod-render ENV_FILE=k8s/production/.env.staging
make prod-apply ENV_FILE=k8s/production/.env.prod RENDERED_FILE=/tmp/pod-watch.prod.yaml
```

### 3) Verify

```bash
kubectl get all -n <APP_NAMESPACE>
kubectl rollout status deployment/<APP_NAME> -n <APP_NAMESPACE>
kubectl rollout status deployment/<APP_NAME>-resource-collector -n <APP_NAMESPACE>
kubectl get cronjob -n <APP_NAMESPACE>
```

Trigger one collector run:

```bash
kubectl create job --from=cronjob/<APP_NAME>-collector <APP_NAME>-collector-manual -n <APP_NAMESPACE>
kubectl logs job/<APP_NAME>-collector-manual -n <APP_NAMESPACE>
```

## PostgreSQL Preparation (manual)

Apply schema:

```bash
psql -h <host> -p <port> -U <user> -d <db> \
  -f supabase/migrations/ext_local_schema.sql
```

Minimal permissions needed by runtime DB user:
- read/write on `pods`, `containers`, `logs`, `container_resource_samples`
- create index/table capability if you rely on collector self-healing schema changes

Notes:
- Resource sampler also ensures `container_resource_samples` exists if missing.
- Production template uses `DB_*` parameters (no hardcoded in-cluster values).

## UI Navigation

- Dashboard: `/`
  - deployment cards, pod cards, container panel + logs/resources tabs
  - impact badges on deployment/pod/container levels
- Version Impact: `/version-impact`
  - detailed tables/charts for version-to-version resource comparison

## Troubleshooting

1. No data in UI
- check collector job logs
- verify `TARGET_NAMESPACE`
- verify DB connectivity from pods

2. No resource graphs / no CPU-RAM %
- check resource collector logs
- ensure container limits are set for percentage display
- verify samples exist in `container_resource_samples`

3. Kubernetes API permission errors
- verify `ClusterRole` and `ClusterRoleBinding`
- verify service account on app and collectors

4. DB auth/SSL failures
- verify `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`
- verify network policy/firewall from cluster to PostgreSQL
