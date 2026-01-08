# Kubernetes Pod Monitor Dashboard

A real-time Kubernetes cluster monitoring dashboard built with React, TypeScript, and Supabase. Monitor pod statuses, container health, and live logs from your Kubernetes clusters.

## Features

- **Real-time Pod Monitoring**: View all pods across namespaces with live status updates
- **Container Details**: Inspect container configurations, restart counts, and state information
- **Live Log Streaming**: Stream container logs in real-time with filtering capabilities
- **Namespace Filtering**: Filter pods by namespace for focused monitoring
- **Search**: Quickly find pods by name
- **Status Overview**: Dashboard summary showing Running, Error, and Pending pod counts

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Supabase (PostgreSQL database with real-time subscriptions)
- **State Management**: TanStack React Query

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase project (provided via Lovable Cloud)

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

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

## Configuration

### Environment Variables

The application uses the following environment variables (automatically configured in Lovable):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anonymous/public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project identifier |

These are pre-configured when using Lovable Cloud and should not be modified manually.

## Database Schema

The application uses three main tables:

### pods
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

### containers
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

### logs
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

You can insert data directly into the database using SQL:

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

### Automated Sync (Future Enhancement)

For production use, create an edge function or external service that:
1. Connects to your Kubernetes cluster API
2. Periodically fetches pod/container status
3. Syncs data to the Supabase database

## Real-time Updates

The dashboard automatically receives updates when data changes in the database:

- **Pod changes**: Dashboard refreshes when pods are added, updated, or deleted
- **Container changes**: Container details update in real-time
- **Log streaming**: New log entries appear instantly in the log viewer

This is powered by Supabase Realtime subscriptions.

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
- Real-time log stream for selected container
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

1. **New pod fields**: Update the `pods` table schema and modify `src/types/kubernetes.ts`
2. **New filters**: Extend `src/components/PodList.tsx`
3. **New visualizations**: Add components to `src/components/Dashboard.tsx`

## Troubleshooting

### No Data Showing
- Verify database tables have data
- Check browser console for errors
- Ensure Supabase connection is configured

### Real-time Not Working
- Verify Supabase Realtime is enabled for tables
- Check network connectivity
- Review browser console for subscription errors

### Slow Performance
- Add database indexes for frequently queried columns
- Implement pagination for large datasets
- Consider Supabase instance size upgrade

## License

This project is private and proprietary.

## Support

For issues and feature requests, please use the Lovable chat interface or create an issue in the repository.
