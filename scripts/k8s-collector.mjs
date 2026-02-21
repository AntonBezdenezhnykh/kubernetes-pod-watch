#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const K8S_HOST = process.env.K8S_HOST || process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
const K8S_PORT = process.env.K8S_PORT || process.env.KUBERNETES_SERVICE_PORT || '443';
const TARGET_NAMESPACE = process.env.TARGET_NAMESPACE || process.env.POD_NAMESPACE || 'default';
const LOG_TAIL_LINES = parseInt(process.env.LOG_TAIL_LINES || '100', 10);

const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

function buildDbConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const password = process.env.DB_PASSWORD || '';
  const ssl = process.env.DB_SSL !== 'false';

  if (!host || !user || !database) {
    throw new Error('Missing database config. Set DATABASE_URL or DB_HOST/DB_USER/DB_NAME.');
  }

  return {
    host,
    user,
    database,
    port,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  };
}

function makeUuidFromString(value) {
  const md5 = crypto.createHash('md5').update(value).digest('hex');
  return `${md5.slice(0, 8)}-${md5.slice(8, 12)}-${md5.slice(12, 16)}-${md5.slice(16, 20)}-${md5.slice(20, 32)}`;
}

function inferLogLevel(message) {
  const m = message.toLowerCase();
  if (m.includes('error') || m.includes('exception') || m.includes('fatal')) return 'error';
  if (m.includes('warn')) return 'warn';
  return 'info';
}

function parseCpuToMillicores(quantity) {
  if (!quantity) return null;
  const value = String(quantity).trim();
  if (!value) return null;
  if (value.endsWith('n')) {
    return Math.round(parseFloat(value.slice(0, -1)) / 1_000_000);
  }
  if (value.endsWith('u')) {
    return Math.round(parseFloat(value.slice(0, -1)) / 1_000);
  }
  if (value.endsWith('m')) {
    return Math.round(parseFloat(value.slice(0, -1)));
  }
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 1000);
}

function parseMemoryToBytes(quantity) {
  if (!quantity) return null;
  const value = String(quantity).trim();
  if (!value) return null;
  const match = value.match(/^([0-9.]+)([a-zA-Z]+)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const unit = (match[2] || '').toUpperCase();

  const binary = {
    KI: 1024,
    MI: 1024 ** 2,
    GI: 1024 ** 3,
    TI: 1024 ** 4,
    PI: 1024 ** 5,
    EI: 1024 ** 6,
  };
  const decimal = {
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  };

  if (binary[unit]) return Math.round(num * binary[unit]);
  if (decimal[unit]) return Math.round(num * decimal[unit]);
  return Math.round(num);
}

function parseK8sLogLine(line) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s(.*)$/);
  if (!match) {
    return { timestamp: new Date().toISOString(), message: line };
  }

  const parsedDate = new Date(match[1]);
  if (Number.isNaN(parsedDate.getTime())) {
    return { timestamp: new Date().toISOString(), message: line };
  }

  return {
    timestamp: parsedDate.toISOString(),
    message: match[2] || '',
  };
}

function mapPodStatus(phase, containerStatuses = []) {
  for (const cs of containerStatuses) {
    if (cs?.state?.waiting?.reason === 'CrashLoopBackOff') return 'CrashLoopBackOff';
    if (cs?.state?.waiting?.reason === 'OOMKilled') return 'OOMKilled';
    if (cs?.state?.terminated?.reason === 'OOMKilled') return 'OOMKilled';
    if (cs?.state?.terminated?.reason === 'Error') return 'Error';
    if (cs?.lastState?.terminated?.reason === 'OOMKilled') return 'OOMKilled';
  }

  switch (phase) {
    case 'Running':
      return 'Running';
    case 'Pending':
      return 'Pending';
    case 'Succeeded':
      return 'Terminated';
    case 'Failed':
      return 'Error';
    default:
      return 'Unknown';
  }
}

function mapContainerStatus(state) {
  if (state?.running) return 'Running';
  if (state?.terminated) return 'Terminated';
  return 'Waiting';
}

function k8sGet(pathname, token, ca) {
  const options = {
    hostname: K8S_HOST,
    port: K8S_PORT,
    path: pathname,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    ca,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Kubernetes API ${res.statusCode}: ${body}`));
        }
        resolve(body);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pod_status') THEN
        CREATE TYPE pod_status AS ENUM ('Running', 'Pending', 'Error', 'OOMKilled', 'CrashLoopBackOff', 'Terminated', 'Unknown');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'container_status') THEN
        CREATE TYPE container_status AS ENUM ('Running', 'Waiting', 'Terminated');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_level') THEN
        CREATE TYPE log_level AS ENUM ('info', 'warn', 'error');
      END IF;
    END
    $$;

    CREATE TABLE IF NOT EXISTS pods (
      id UUID PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS containers (
      id UUID PRIMARY KEY,
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
      cpu_request_millicores INTEGER,
      cpu_limit_millicores INTEGER,
      memory_request_bytes BIGINT,
      memory_limit_bytes BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE containers
      ADD COLUMN IF NOT EXISTS cpu_request_millicores INTEGER,
      ADD COLUMN IF NOT EXISTS cpu_limit_millicores INTEGER,
      ADD COLUMN IF NOT EXISTS memory_request_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS memory_limit_bytes BIGINT;

    CREATE TABLE IF NOT EXISTS logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
      level log_level NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_pods_namespace ON pods(namespace);
    CREATE INDEX IF NOT EXISTS idx_pods_status ON pods(status);
    CREATE INDEX IF NOT EXISTS idx_containers_pod_id ON containers(pod_id);
    CREATE INDEX IF NOT EXISTS idx_logs_container_id ON logs(container_id);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);

    DELETE FROM logs a
    USING logs b
    WHERE a.ctid < b.ctid
      AND a.container_id = b.container_id
      AND a.timestamp = b.timestamp
      AND a.message = b.message;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_container_timestamp_message
      ON logs(container_id, timestamp, message);
  `);
}

async function main() {
  const token = readFileSync(SA_TOKEN_PATH, 'utf8').trim();
  const ca = readFileSync(SA_CA_PATH, 'utf8');
  const pool = new Pool(buildDbConfig());

  try {
    await ensureSchema(pool);

    const podsRaw = await k8sGet(`/api/v1/namespaces/${TARGET_NAMESPACE}/pods`, token, ca);
    const podList = JSON.parse(podsRaw);
    const pods = podList.items || [];

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      let podCount = 0;
      let containerCount = 0;
      let logCount = 0;

      for (const pod of pods) {
        const podId = pod.metadata?.uid;
        if (!podId) continue;
        const containerStatuses = pod.status?.containerStatuses || [];
        const restarts = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount || 0), 0);

        await db.query(
          `INSERT INTO pods (id, name, namespace, status, node_name, pod_ip, labels, restarts, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             namespace = EXCLUDED.namespace,
             status = EXCLUDED.status,
             node_name = EXCLUDED.node_name,
             pod_ip = EXCLUDED.pod_ip,
             labels = EXCLUDED.labels,
             restarts = EXCLUDED.restarts,
             updated_at = now()`,
          [
            podId,
            pod.metadata?.name || 'unknown',
            pod.metadata?.namespace || TARGET_NAMESPACE,
            mapPodStatus(pod.status?.phase || 'Unknown', containerStatuses),
            pod.spec?.nodeName || 'unassigned',
            pod.status?.podIP || null,
            JSON.stringify(pod.metadata?.labels || {}),
            restarts,
            pod.metadata?.creationTimestamp || new Date().toISOString(),
          ]
        );
        podCount += 1;

        for (const cs of containerStatuses) {
          const podSpecContainer = (pod.spec?.containers || []).find((container) => container.name === cs.name);
          const containerResources = podSpecContainer?.resources || {};
          const requests = containerResources.requests || {};
          const limits = containerResources.limits || {};
          const containerId = makeUuidFromString(`${podId}:${cs.name}`);
          const state = cs.state || {};

          await db.query(
            `INSERT INTO containers (
               id, pod_id, name, image, status, ready, restart_count, started_at,
               last_state_reason, last_state_exit_code, last_state_message,
               cpu_request_millicores, cpu_limit_millicores, memory_request_bytes, memory_limit_bytes, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               image = EXCLUDED.image,
               status = EXCLUDED.status,
               ready = EXCLUDED.ready,
               restart_count = EXCLUDED.restart_count,
               started_at = EXCLUDED.started_at,
               last_state_reason = EXCLUDED.last_state_reason,
               last_state_exit_code = EXCLUDED.last_state_exit_code,
               last_state_message = EXCLUDED.last_state_message,
               cpu_request_millicores = EXCLUDED.cpu_request_millicores,
               cpu_limit_millicores = EXCLUDED.cpu_limit_millicores,
               memory_request_bytes = EXCLUDED.memory_request_bytes,
               memory_limit_bytes = EXCLUDED.memory_limit_bytes,
               updated_at = now()`,
            [
              containerId,
              podId,
              cs.name,
              cs.image || 'unknown',
              mapContainerStatus(state),
              Boolean(cs.ready),
              cs.restartCount || 0,
              state.running?.startedAt || null,
              cs.lastState?.terminated?.reason || state.waiting?.reason || state.terminated?.reason || null,
              cs.lastState?.terminated?.exitCode ?? state.terminated?.exitCode ?? null,
              cs.lastState?.terminated?.message || state.waiting?.message || state.terminated?.message || null,
              parseCpuToMillicores(requests.cpu),
              parseCpuToMillicores(limits.cpu),
              parseMemoryToBytes(requests.memory),
              parseMemoryToBytes(limits.memory),
            ]
          );
          containerCount += 1;

          try {
            const logRaw = await k8sGet(
              `/api/v1/namespaces/${TARGET_NAMESPACE}/pods/${encodeURIComponent(pod.metadata?.name || '')}/log?container=${encodeURIComponent(cs.name)}&tailLines=${LOG_TAIL_LINES}&timestamps=true`,
              token,
              ca
            );

            const lines = logRaw
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(-LOG_TAIL_LINES);

            for (const rawLine of lines) {
              const parsed = parseK8sLogLine(rawLine);
              if (!parsed.message) continue;
              await db.query(
                `INSERT INTO logs (container_id, timestamp, level, message)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (container_id, timestamp, message) DO NOTHING`,
                [
                  containerId,
                  parsed.timestamp,
                  inferLogLevel(parsed.message),
                  parsed.message,
                ]
              );
              logCount += 1;
            }
          } catch (error) {
            console.warn(`Skipping logs for ${pod.metadata?.name}/${cs.name}:`, error.message);
          }
        }
      }

      await db.query('COMMIT');
      console.log(`Sync complete namespace=${TARGET_NAMESPACE} pods=${podCount} containers=${containerCount} logs=${logCount}`);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Collector failed:', error);
  process.exit(1);
});
