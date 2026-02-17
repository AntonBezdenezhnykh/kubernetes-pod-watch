# Kubernetes Pod Monitor Dashboard

A real-time Kubernetes cluster monitoring dashboard built with React, TypeScript, and PostgreSQL. Monitor pod statuses, container health, and live logs from your Kubernetes clusters.

## Features

- **Real-time Pod Monitoring**: View all pods across namespaces with live status updates
- **Container Details**: Inspect container configurations, restart counts, and state information
- **Live Log Streaming**: Stream container logs in real-time with filtering capabilities
- **Namespace Filtering**: Filter pods by namespace for focused monitoring
- **Search**: Quickly find pods by name
- **Status Overview**: Dashboard summary showing Running, Error, and Pending pod counts
- **External Database Support**: Connect to any PostgreSQL database

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Edge functions (Supabase) + external PostgreSQL
- **State Management**: TanStack React Query

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- External PostgreSQL database

### Installation

1. Clone the repository:
   ```bash
   git clone <YOUR_GIT_URL>
   cd <YOUR_PROJECT_NAME>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your database (see [Configuration](#configuration) section)

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser (typically `http://localhost:5173` or `http://localhost:8080`)

## Configuration

All database connection parameters are configured via environment variables. No credentials or connection strings are hardcoded.

### Database Configuration

The application uses **external PostgreSQL only**. All data is read and written through edge functions (or the local API server) that connect to your database.

#### Environment Variables (Edge Function / Local API)

Set these where your edge functions run (e.g. Supabase project settings → Secrets) or in `supabase/functions/.env` for local development:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes* | Full PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=disable` |
| `DB_HOST` | Yes* | Database host | `my-db.example.com` |
| `DB_PORT` | No | Database port (default: 5432) | `5432` |
| `DB_NAME` | Yes* | Database name | `kubernetes_monitor` |
| `DB_USER` | Yes* | Database username | `app_user` |
| `DB_PASSWORD` | No | Database password (empty for trust auth) | `secure_password` |
| `DB_SSL` | No | Enable SSL (default: true) | `true` or `false` |

*Either provide `DATABASE_URL` OR all individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`.

##### Connection String Format

```
postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=[mode]
```

SSL modes:
- `require` - Require SSL connection (recommended for production)
- `prefer` - Prefer SSL, fall back to non-SSL
- `disable` - Disable SSL (not recommended)

##### Example Configurations

**Amazon RDS:**
```env
DATABASE_URL=postgresql://admin:password@mydb.abc123.us-east-1.rds.amazonaws.com:5432/kubernetes?sslmode=require
```

**Google Cloud SQL:**
```env
DATABASE_URL=postgresql://user:password@/kubernetes?host=/cloudsql/project:region:instance
```

**DigitalOcean Managed Database:**
```env
DATABASE_URL=postgresql://doadmin:password@db-postgresql-nyc1-12345-do-user-123456-0.b.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

**Local PostgreSQL (no password):**
```env
DATABASE_URL=postgresql://postgres@localhost:5432/postgres?sslmode=disable
```

Or with individual variables:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=
DB_SSL=false
```

### Local Development (without Docker/Supabase CLI)

Run the local API server that mimics the database edge function:

```bash
# Terminal 1: Start local API (requires DATABASE_URL)
export DATABASE_URL=postgresql://postgres@localhost:5432/postgres?sslmode=disable
npm run dev:api

# Terminal 2: Start frontend
# Set VITE_SUPABASE_URL=http://localhost:54321 in .env.local to point at local API
npm run dev
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `API_PORT` | No | Local API server port (default: 54321) |

#### Frontend (Vite)

For local development, create `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | API URL (e.g. `http://localhost:54321` for local API, or your Supabase project URL) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Anon/public key for API auth |
| `VITE_SUPABASE_PROJECT_ID` | No | Project identifier |

### Polling

The app polls the database for updates:

- **Pods/Containers**: Refreshed every 30 seconds
- **Logs**: Refreshed every 10 seconds

## Database Schema

The application requires three tables. Create them in your external PostgreSQL database using the migration file or the SQL below.

**Apply schema using environment variables:**
```bash
psql "$DATABASE_URL" -f supabase/migrations/ext_local_schema.sql
```

Or with individual variables:
```bash
psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -f supabase/migrations/ext_local_schema.sql
```

### Required Tables

```sql
-- Create enums (match ext_local_schema.sql)
CREATE TYPE pod_status AS ENUM ('Running', 'Pending', 'Error', 'OOMKilled', 'CrashLoopBackOff', 'Terminated', 'Unknown');
CREATE TYPE container_status AS ENUM ('Running', 'Waiting', 'Terminated');
CREATE TYPE log_level AS ENUM ('info', 'warn', 'error');

-- Create pods table
CREATE TABLE pods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'default',
  status pod_status NOT NULL DEFAULT 'Unknown',
  node_name TEXT,
  pod_ip TEXT,
  labels JSONB DEFAULT '{}',
  restarts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create containers table
CREATE TABLE containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  status container_status NOT NULL DEFAULT 'Waiting',
  ready BOOLEAN DEFAULT false,
  restart_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  last_state_reason TEXT,
  last_state_exit_code INTEGER,
  last_state_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create logs table
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  level log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_pods_namespace ON pods(namespace);
CREATE INDEX idx_pods_status ON pods(status);
CREATE INDEX idx_containers_pod_id ON containers(pod_id);
CREATE INDEX idx_logs_container_id ON logs(container_id);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
```

### Table Descriptions

#### pods
Stores Kubernetes pod information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Pod name |
| `namespace` | TEXT | Kubernetes namespace (default: 'default') |
| `status` | ENUM | Pod status (Running, Pending, Error, OOMKilled, CrashLoopBackOff, Terminated, Unknown) |
| `node_name` | TEXT | Node where pod is scheduled |
| `pod_ip` | TEXT | Pod IP address |
| `labels` | JSONB | Pod labels as key-value pairs |
| `restarts` | INTEGER | Total restart count |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

#### containers
Stores container information for each pod.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `pod_id` | UUID | Reference to parent pod |
| `name` | TEXT | Container name |
| `image` | TEXT | Container image |
| `status` | ENUM | Container status (Running, Waiting, Terminated) |
| `ready` | BOOLEAN | Container readiness state |
| `restart_count` | INTEGER | Container restart count |
| `started_at` | TIMESTAMP | Container start time |
| `last_state_reason` | TEXT | Reason for last state change |
| `last_state_exit_code` | INTEGER | Exit code from last termination |
| `last_state_message` | TEXT | Message from last state change |

#### logs
Stores container log entries.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `container_id` | UUID | Reference to parent container |
| `timestamp` | TIMESTAMP | Log entry timestamp |
| `level` | ENUM | Log level (info, warn, error) |
| `message` | TEXT | Log message content |

## Populating Data

### Manual Data Entry

Insert data directly into the database using SQL:

```sql
-- Insert a pod
INSERT INTO pods (name, namespace, status, node_name, pod_ip, labels)
VALUES (
  'my-app-pod-abc123',
  'production',
  'Running',
  'node-1',
  '10.0.0.15',
  '{"app": "my-app", "version": "1.0"}'
);

-- Insert a container for the pod
INSERT INTO containers (pod_id, name, image, status, ready, restart_count)
VALUES (
  '<pod-uuid>',
  'main-container',
  'my-app:latest',
  'Running',
  true,
  0
);

-- Insert log entries
INSERT INTO logs (container_id, level, message)
VALUES (
  '<container-uuid>',
  'info',
  'Application started successfully'
);
```

### Automated Kubernetes Sync

The application includes a built-in edge function to sync data from a real Kubernetes cluster.

#### Kubernetes Sync Configuration

Configure these secrets where your edge functions run (e.g. Supabase project settings → Secrets):

| Secret | Required | Description | Example |
|--------|----------|-------------|---------|
| `K8S_API_SERVER` | Yes | Kubernetes API server URL | `https://kubernetes.default.svc` or `https://my-cluster.example.com:6443` |
| `K8S_TOKEN` | Yes | Service account token with pod read access | `eyJhbGciOiJSUzI1NiIs...` |
| `K8S_NAMESPACE` | No | Specific namespace to monitor (empty = all namespaces) | `production` |
| `K8S_CA_CERT` | No | Base64 encoded CA certificate | `LS0tLS1CRUdJTi...` |
| `K8S_SKIP_TLS_VERIFY` | No | Skip TLS verification (not recommended) | `true` or `false` |

#### Creating a Kubernetes Service Account

Create a service account with pod read permissions:

```yaml
# service-account.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-monitor
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: pod-monitor-binding
subjects:
- kind: ServiceAccount
  name: pod-monitor
  namespace: kube-system
roleRef:
  kind: ClusterRole
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

Apply the configuration:
```bash
kubectl apply -f service-account.yaml
```

Get the service account token:
```bash
# For Kubernetes 1.24+
kubectl create token pod-monitor -n kube-system --duration=8760h

# For older versions, get the secret token
kubectl get secret $(kubectl get sa pod-monitor -n kube-system -o jsonpath='{.secrets[0].name}') -n kube-system -o jsonpath='{.data.token}' | base64 -d
```

#### Triggering a Sync

Call the sync endpoint manually or set up a cron job. Set `SUPABASE_URL` to your project URL (e.g. `https://<project-ref>.supabase.co`):

```bash
# Manual sync
curl -X POST "$SUPABASE_URL/functions/v1/kubernetes-sync?action=sync"

# Sync with cleanup (removes pods no longer in cluster)
curl -X POST "$SUPABASE_URL/functions/v1/kubernetes-sync?action=sync&cleanup=true"

# Check configuration status
curl "$SUPABASE_URL/functions/v1/kubernetes-sync?action=status"
```

#### Setting Up Automated Sync

For continuous monitoring, set up a cron job to call the sync endpoint periodically:

**Using external cron service (e.g., cron-job.org, Uptime Robot):**
- URL: `$SUPABASE_URL/functions/v1/kubernetes-sync?action=sync&cleanup=true`
- Method: POST
- Interval: Every 1-5 minutes

**Using Kubernetes CronJob:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pod-monitor-sync
spec:
  schedule: "*/2 * * * *"  # Every 2 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: sync
            image: curlimages/curl:latest
            command:
            - curl
            - -X
            - POST
            - "https://<your-project>.supabase.co/functions/v1/kubernetes-sync?action=sync&cleanup=true"  # Replace with your Supabase URL
          restartPolicy: OnFailure
```

#### Sync Response

The sync endpoint returns statistics about the operation:

```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "stats": {
    "podsFetched": 25,
    "podsUpserted": 25,
    "containersUpserted": 42,
    "podsDeleted": 3
  }
}
```

#### Data Mapping

The sync function maps Kubernetes data to the database schema:

| Kubernetes Field | Database Field |
|------------------|----------------|
| `pod.metadata.uid` | `pods.id` |
| `pod.metadata.name` | `pods.name` |
| `pod.metadata.namespace` | `pods.namespace` |
| `pod.status.phase` + container states | `pods.status` |
| `pod.spec.nodeName` | `pods.node_name` |
| `pod.status.podIP` | `pods.pod_ip` |
| `pod.metadata.labels` | `pods.labels` |
| Sum of container restarts | `pods.restarts` |

Container statuses are intelligently mapped:
- `CrashLoopBackOff` and `OOMKilled` are detected from container states
- Last state information is preserved for debugging

## Updates

Data is refreshed by polling the external PostgreSQL database:

- Pods/containers refresh every 30 seconds
- Logs refresh every 10 seconds

## UI Components

### Dashboard Header
Shows total pod count and status breakdown (Running, Error, Pending).

### Pod List (Left Panel)
- Search bar for filtering pods by name
- Namespace filter buttons
- Clickable pod cards showing name, namespace, container count, and status

### Pod Details (Right Panel - Top)
- Pod metadata (name, namespace, node, IP, age)
- Pod labels
- Container list with status indicators

### Log Viewer (Right Panel - Bottom)
- Real-time/polling log stream for selected container
- Log level filter (All, Debug, Info, Warn, Error)
- Search within logs
- Download logs as text file
- Auto-scroll to latest entries

## Status Indicators

### Pod Statuses
| Status | Color | Description |
|--------|-------|-------------|
| Running | Green | Pod is running normally |
| Succeeded | Blue | Pod completed successfully |
| Pending | Yellow | Pod is starting up |
| Failed | Red | Pod has failed |
| Unknown | Gray | Status cannot be determined |

### Container Statuses
| Status | Color | Description |
|--------|-------|-------------|
| Running | Green | Container is running |
| Waiting | Yellow | Container is waiting to start |
| Terminated | Red | Container has terminated |

### Log Levels
| Level | Color | Description |
|-------|-------|-------------|
| debug | Gray | Debug information |
| info | Blue | Informational messages |
| warn | Yellow | Warning messages |
| error | Red | Error messages |

## Customization

### Theming

The app uses CSS custom properties for theming. Modify `src/index.css` to customize colors:

```css
:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  /* ... other variables */
}
```

### Adding New Features

1. **New pod fields**: Update the database schema and modify `src/types/kubernetes.ts`
2. **New filters**: Extend `src/components/PodList.tsx`
3. **New visualizations**: Add components to `src/components/Dashboard.tsx`

## Troubleshooting

### No Data Showing
- Verify database tables have data
- Check browser console for errors
- Ensure edge function secrets (DATABASE_URL or DB_*) are set correctly

### Polling Not Working
- Check that polling is active (network tab shows periodic requests to the database edge function)
- Check network connectivity and CORS
- Review browser console for errors

### Database Connection Failed
- Verify connection string or individual DB_* credentials in edge function secrets
- Ensure the database is reachable from where edge functions run (firewall/security groups)
- Ensure SSL settings match your database requirements
- Test connection from the same environment as the edge functions

### Slow Performance
- Add database indexes for frequently queried columns
- Implement pagination for large datasets
- Consider database instance size upgrade
- Check network latency between the edge function runtime and your database

## Security Considerations

- Never commit database credentials to version control
- Use SSL for production database connections
- Configure appropriate firewall rules for your database
- Use read-only database credentials if write access isn't needed
- Regularly rotate database passwords

## License

This project is private and proprietary.

## Support

For issues and feature requests, please create an issue in the repository.
