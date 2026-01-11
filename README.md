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
- **Backend**: Lovable Cloud with PostgreSQL (or external PostgreSQL)
- **State Management**: TanStack React Query

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Lovable Cloud or external)

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

5. Open your browser to `http://localhost:5173`

## Configuration

### Database Configuration

The application supports two database modes:

#### 1. Lovable Cloud Database (Default)

When using Lovable Cloud, the database is automatically configured. No additional setup is required.

#### 2. External PostgreSQL Database

To connect to an external PostgreSQL database, set up the following configuration:

##### Frontend Environment Variables

Add to your `.env` file:

```env
VITE_USE_EXTERNAL_DB=true
```

##### Backend Secrets (Edge Function)

Configure these secrets in your Lovable project settings → Secrets:

| Secret | Required | Description | Example |
|--------|----------|-------------|---------|
| `DATABASE_URL` | Yes* | Full PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `DB_HOST` | Yes* | Database host | `my-db.example.com` |
| `DB_PORT` | No | Database port (default: 5432) | `5432` |
| `DB_NAME` | Yes* | Database name | `kubernetes_monitor` |
| `DB_USER` | Yes* | Database username | `app_user` |
| `DB_PASSWORD` | Yes* | Database password | `secure_password` |
| `DB_SSL` | No | Enable SSL (default: true) | `true` or `false` |

*Either provide `DATABASE_URL` OR all individual `DB_*` variables.

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

**Local PostgreSQL:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kubernetes_monitor
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
```

### Polling Configuration

When using an external database, the app polls for updates since PostgreSQL doesn't support native pub/sub:

- **Pods/Containers**: Refreshed every 30 seconds
- **Logs**: Refreshed every 10 seconds

With Lovable Cloud database, real-time updates are instant via Supabase Realtime.

## Database Schema

The application requires three tables. Create them in your external PostgreSQL database:

### Required Tables

```sql
-- Create enums
CREATE TYPE pod_status AS ENUM ('Running', 'Pending', 'Failed', 'Succeeded', 'Unknown');
CREATE TYPE container_status AS ENUM ('Running', 'Waiting', 'Terminated');
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');

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
| `status` | ENUM | Pod status (Running, Pending, Failed, Succeeded, Unknown) |
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
| `level` | ENUM | Log level (debug, info, warn, error) |
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

### Automated Sync

For production use, create a Kubernetes controller or CronJob that:
1. Connects to your Kubernetes cluster API
2. Watches for pod/container events
3. Syncs data to the PostgreSQL database

## Real-time Updates

### Lovable Cloud Database
Instant updates via Supabase Realtime subscriptions:
- Pod changes trigger immediate dashboard refresh
- Container details update in real-time
- New log entries appear instantly

### External PostgreSQL Database
Polling-based updates:
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
- Ensure database connection is configured correctly
- For external DB: verify secrets are set in Lovable project settings

### Real-time/Polling Not Working
- For Lovable Cloud: Verify Supabase Realtime is enabled for tables
- For external DB: Check that polling is active (network tab shows periodic requests)
- Check network connectivity
- Review browser console for errors

### Database Connection Failed
- Verify connection string or individual credentials
- Check that the database is accessible from Lovable Cloud (firewall/security groups)
- Ensure SSL settings match your database requirements
- Test connection locally first

### Slow Performance
- Add database indexes for frequently queried columns
- Implement pagination for large datasets
- Consider database instance size upgrade
- For external DB: check network latency between Lovable Cloud and your database

## Security Considerations

- Never commit database credentials to version control
- Use SSL for production database connections
- Configure appropriate firewall rules for your database
- Use read-only database credentials if write access isn't needed
- Regularly rotate database passwords

## License

This project is private and proprietary.

## Support

For issues and feature requests, please use the Lovable chat interface or create an issue in the repository.
