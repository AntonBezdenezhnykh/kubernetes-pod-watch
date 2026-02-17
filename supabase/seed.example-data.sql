-- Example data for Kubernetes Pod Monitor dashboard
-- Run after ext_local_schema.sql: psql $DATABASE_URL -f supabase/seed.example-data.sql

-- Clear existing data (optional - comment out to append)
TRUNCATE TABLE public.logs, public.containers, public.pods RESTART IDENTITY CASCADE;

-- Pods
INSERT INTO public.pods (id, name, namespace, status, node_name, pod_ip, labels, restarts)
VALUES
  ('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 'api-gateway-7d8f9b-x2k4m', 'production', 'Running', 'node-1', '10.0.0.15', '{"app": "api-gateway", "version": "v2.1.0"}', 0),
  ('b2c3d4e5-f6a7-5b2c-9d3e-4f5a6b7c8d9e', 'user-service-5c6d7e-9k2l3', 'production', 'Running', 'node-2', '10.0.0.22', '{"app": "user-service", "version": "v1.5.2"}', 1),
  ('c3d4e5f6-a7b8-6c3d-0e4f-5a6b7c8d9e0f', 'scheduler-cron-abc123', 'default', 'Pending', NULL, NULL, '{"app": "scheduler", "type": "cronjob"}', 0);

-- Containers
INSERT INTO public.containers (id, pod_id, name, image, status, ready, restart_count, started_at)
VALUES
  ('d4e5f6a7-b8c9-7d4e-1f5a-6b7c8d9e0f1a', 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 'api-gateway', 'nginx:1.25', 'Running', true, 0, now() - interval '2 hours'),
  ('e5f6a7b8-c9d0-8e5f-2a6b-7c8d9e0f1a2b', 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 'sidecar', 'envoy:1.28', 'Running', true, 0, now() - interval '2 hours'),
  ('f6a7b8c9-d0e1-9f6a-3b7c-8d9e0f1a2b3c', 'b2c3d4e5-f6a7-5b2c-9d3e-4f5a6b7c8d9e', 'user-service', 'myapp/user-service:v1.5.2', 'Running', true, 1, now() - interval '30 minutes'),
  ('a7b8c9d0-e1f2-0a7b-4c8d-9e0f1a2b3c4d', 'c3d4e5f6-a7b8-6c3d-0e4f-5a6b7c8d9e0f', 'scheduler', 'myapp/scheduler:latest', 'Waiting', false, 0, NULL);

-- Logs
INSERT INTO public.logs (container_id, level, message)
VALUES
  ('d4e5f6a7-b8c9-7d4e-1f5a-6b7c8d9e0f1a', 'info', 'Starting API gateway on port 8080'),
  ('d4e5f6a7-b8c9-7d4e-1f5a-6b7c8d9e0f1a', 'info', 'Health check endpoint ready at /health'),
  ('d4e5f6a7-b8c9-7d4e-1f5a-6b7c8d9e0f1a', 'info', 'Received 1523 requests in last minute'),
  ('e5f6a7b8-c9d0-8e5f-2a6b-7c8d9e0f1a2b', 'info', 'Envoy proxy initialized'),
  ('e5f6a7b8-c9d0-8e5f-2a6b-7c8d9e0f1a2b', 'warn', 'Upstream connection pool 80% capacity'),
  ('f6a7b8c9-d0e1-9f6a-3b7c-8d9e0f1a2b3c', 'info', 'User service started'),
  ('f6a7b8c9-d0e1-9f6a-3b7c-8d9e0f1a2b3c', 'info', 'Database connection established'),
  ('f6a7b8c9-d0e1-9f6a-3b7c-8d9e0f1a2b3c', 'error', 'Connection timeout to cache service (recovered)'),
  ('f6a7b8c9-d0e1-9f6a-3b7c-8d9e0f1a2b3c', 'info', 'Restarted after crash - uptime 30m');
