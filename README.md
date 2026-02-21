# Kubernetes Pod Watch

Kubernetes Pod Watch is a dashboard + collector pair for fast namespace triage.

It answers these questions quickly:
- Which pods are healthy vs degraded vs failing?
- Which container has the highest-priority issue?
- Are there warning/error/exception logs that explain root cause?

## How It Works

The system has two runtime components:

1. `pod-watch` web app (Deployment)
- Serves the UI and HTTP API from one container.
- Reads data from external PostgreSQL (`pods`, `containers`, `logs` tables).
- UI sorts pods by attention priority so failures are surfaced first.

2. `pod-watch-collector` (CronJob)
- Calls Kubernetes API using in-cluster service account.
- Pulls pods, container states, and recent logs from the target namespace.
- Writes/upserts into external PostgreSQL.

Data flow:
- Kubernetes API -> Collector CronJob -> PostgreSQL -> Web app API -> Browser UI

## Core Concepts

- `Pod health`: derived from pod phase + container readiness/status + restart behavior.
- `Attention score`: numeric priority used for sorting (errors first, then warnings, then healthy).
- `Initializing` state: `ContainerCreating`/`PodInitializing` are shown as non-error initialization.
- `Root-cause focus`: pod cards and detail panel show top issue reason and log filters.

## Repository Layout

- `/Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/deploy-local.yaml`
  Local development manifest with local-oriented values.
- `/Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.template.yaml`
  Production manifest template (parameterized, no environment hardcoding).
- `/Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/.env.example`
  Example variable file for production rendering.
- `/Users/nb/Desktop/Work/kubernetes-pod-watch/scripts/k8s-collector.mjs`
  Collector job implementation.
- `/Users/nb/Desktop/Work/kubernetes-pod-watch/scripts/local-db-server.mjs`
  API + static server used by deployed app container.
- `/Users/nb/Desktop/Work/kubernetes-pod-watch/supabase/migrations/ext_local_schema.sql`
  SQL schema for external PostgreSQL.

## Prerequisites (Production)

- Kubernetes cluster access (`kubectl`) with permission to create namespace-scoped resources and RBAC.
- External PostgreSQL database reachable from the cluster.
- Container registry accessible by the cluster.
- `docker`, `kubectl`, `envsubst` available locally.

## Required Runtime Variables

These are used by manifests in `/Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.template.yaml`.

| Variable | Required | Purpose |
|---|---|---|
| `APP_NAMESPACE` | Yes | Namespace for app and collector resources |
| `APP_NAME` | Yes | Base name for resources |
| `APP_VERSION` | Yes | Version label value |
| `APP_IMAGE` | Yes | Full image reference to deploy |
| `APP_REPLICAS` | Yes | Number of app replicas |
| `CONTAINER_PORT` | Yes | Container HTTP port |
| `SERVICE_PORT` | Yes | Service port |
| `SERVICE_TYPE` | Yes | `ClusterIP`, `NodePort`, or `LoadBalancer` |
| `COLLECT_SCHEDULE` | Yes | Cron expression for collector |
| `LOG_TAIL_LINES` | Yes | Number of log lines collected per container |
| `TARGET_NAMESPACE` | Yes | Namespace to inspect for pods/logs |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port |
| `DB_NAME` | Yes | PostgreSQL database |
| `DB_USER` | Yes | PostgreSQL username |
| `DB_PASSWORD` | Yes | PostgreSQL password (or empty string if intentionally none) |
| `DB_SSL` | Yes | `true` or `false` |

Notes:
- The app/collector support either `DATABASE_URL` or discrete `DB_*` values in code.
- The production template uses `DB_*` values to avoid coupling to one connection-string format.

## Prepare PostgreSQL (Manual)

You said DB prep will be done manually. Minimum required steps:

1. Create database and user.
2. Grant required privileges to the runtime user.
3. Apply schema migration.
4. Verify required enums/tables/indexes exist.

### 1) Create DB/User (example)

```sql
CREATE DATABASE pod_watch;
CREATE USER pod_watch_user WITH PASSWORD 'change_me';
GRANT CONNECT ON DATABASE pod_watch TO pod_watch_user;
```

### 2) Grant schema/table permissions (example)

```sql
\c pod_watch
GRANT USAGE ON SCHEMA public TO pod_watch_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pod_watch_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pod_watch_user;
```

### 3) Apply migration

Using connection string:

```bash
psql "postgresql://<user>:<pass>@<host>:5432/<db>?sslmode=require" \
  -f /Users/nb/Desktop/Work/kubernetes-pod-watch/supabase/migrations/ext_local_schema.sql
```

Or discrete params:

```bash
psql -h <host> -p 5432 -U <user> -d <db> \
  -f /Users/nb/Desktop/Work/kubernetes-pod-watch/supabase/migrations/ext_local_schema.sql
```

### 4) Verify objects

```sql
\c pod_watch
\d pods
\d containers
\d logs
```

## Build and Push Image

```bash
cd /Users/nb/Desktop/Work/kubernetes-pod-watch

docker build -t <registry>/<org>/kubernetes-pod-watch:<version> .
docker push <registry>/<org>/kubernetes-pod-watch:<version>
```

## Render and Apply Production Manifests

1. Create your variable file from template:

```bash
cp /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/.env.example \
   /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/.env.production
```

2. Edit `.env.production` values for your environment.

3. Render manifest:

```bash
set -a
source /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/.env.production
set +a

envsubst < /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.template.yaml \
  > /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.rendered.yaml
```

4. Optional validate before apply:

```bash
kubectl apply --dry-run=client -f /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.rendered.yaml
```

5. Apply:

```bash
kubectl apply -f /Users/nb/Desktop/Work/kubernetes-pod-watch/k8s/production/deploy.rendered.yaml
```

### Make Workflow (Recommended)

Use built-in make targets to reduce manual mistakes:

```bash
cd /Users/nb/Desktop/Work/kubernetes-pod-watch

# one-time: create your env file
cp k8s/production/.env.example k8s/production/.env.production

# render only
make prod-render

# render + validate + apply
make prod-apply
```

Optional overrides:

```bash
make prod-render ENV_FILE=k8s/production/.env.staging
make prod-apply ENV_FILE=k8s/production/.env.prod-eu RENDERED_FILE=/tmp/pod-watch.prod-eu.yaml
```

## Post-Deploy Verification

```bash
kubectl get all -n <APP_NAMESPACE>
kubectl rollout status deployment/<APP_NAME> -n <APP_NAMESPACE>
kubectl get cronjob -n <APP_NAMESPACE>
```

Trigger one collector run immediately:

```bash
kubectl create job --from=cronjob/<APP_NAME>-collector <APP_NAME>-collector-manual -n <APP_NAMESPACE>
kubectl logs job/<APP_NAME>-collector-manual -n <APP_NAMESPACE>
```

Expected collector success output contains:
- `Sync complete namespace=<TARGET_NAMESPACE> pods=<n> containers=<n> logs=<n>`

## Accessing the UI

If service is `ClusterIP`:

```bash
kubectl port-forward -n <APP_NAMESPACE> service/<APP_NAME> 8080:<SERVICE_PORT>
```

Open: `http://localhost:8080`

If service is `LoadBalancer`/`NodePort`, use the cluster-provided endpoint.

## Operations Notes

- App polling intervals:
  - Pods/containers: 30s
  - Logs: 10s
- Collector schedule is independent from UI polling.
- If you change image tag or labels, update `.env.production` and re-render/apply.
- Keep secrets out of Git (`.env.production` and rendered files should stay local/private).

## Troubleshooting

1. UI blank page / empty response
- Ensure no stale process hijacks `localhost:8080`.
- Check service and port-forward status.

2. No pod data in UI
- Check collector job logs.
- Validate DB connectivity from collector pod.
- Confirm `TARGET_NAMESPACE` is correct.

3. Permission errors reading pods/logs
- Verify `ClusterRole` and `ClusterRoleBinding` were applied.
- Confirm service account bound to collector/app pods.

4. Postgres auth/SSL failures
- Verify `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`.
- Ensure network/firewall allows cluster egress to DB.
