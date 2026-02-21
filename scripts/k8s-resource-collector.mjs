#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const K8S_HOST = process.env.K8S_HOST || process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
const K8S_PORT = process.env.K8S_PORT || process.env.KUBERNETES_SERVICE_PORT || '443';
const TARGET_NAMESPACE = process.env.TARGET_NAMESPACE || process.env.POD_NAMESPACE || 'default';
const SAMPLE_INTERVAL_SECONDS = parseInt(process.env.SAMPLE_INTERVAL_SECONDS || '30', 10);

const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const cpuTotalByContainer = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDbConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return { connectionString: databaseUrl };

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

function parseCpuToMillicores(quantity) {
  if (!quantity) return 0;
  const value = String(quantity).trim();

  if (value.endsWith('n')) {
    return Math.round(parseFloat(value.slice(0, -1)) / 1_000_000);
  }
  if (value.endsWith('u')) {
    return Math.round(parseFloat(value.slice(0, -1)) / 1_000);
  }
  if (value.endsWith('m')) {
    return Math.round(parseFloat(value.slice(0, -1)));
  }

  return Math.round(parseFloat(value) * 1000);
}

function parseMemoryToBytes(quantity) {
  if (!quantity) return 0;
  const value = String(quantity).trim();
  const match = value.match(/^([0-9.]+)([a-zA-Z]+)?$/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
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

    CREATE TABLE IF NOT EXISTS container_resource_samples (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      namespace TEXT NOT NULL,
      pod_uid TEXT NOT NULL,
      pod_name TEXT NOT NULL,
      container_name TEXT NOT NULL,
      container_id UUID NOT NULL,
      cpu_raw TEXT NOT NULL,
      memory_raw TEXT NOT NULL,
      cpu_millicores INTEGER NOT NULL,
      memory_bytes BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_container_resource_samples_pod_uid
      ON container_resource_samples(pod_uid);

    CREATE INDEX IF NOT EXISTS idx_container_resource_samples_container_id
      ON container_resource_samples(container_id);

    CREATE INDEX IF NOT EXISTS idx_container_resource_samples_sampled_at
      ON container_resource_samples(sampled_at DESC);
  `);
}

async function fetchPodsIndex(token, ca) {
  const raw = await k8sGet(`/api/v1/namespaces/${TARGET_NAMESPACE}/pods`, token, ca);
  const podList = JSON.parse(raw);
  const byNamespaceName = new Map();
  const byRuntimeContainerId = new Map();

  for (const pod of podList.items || []) {
    const namespace = pod.metadata?.namespace || TARGET_NAMESPACE;
    const podName = pod.metadata?.name || '';
    const key = `${namespace}/${podName}`;
    byNamespaceName.set(key, {
      uid: pod.metadata?.uid,
      nodeName: pod.spec?.nodeName,
    });

    const statuses = [
      ...(pod.status?.containerStatuses || []),
      ...(pod.status?.initContainerStatuses || []),
      ...(pod.status?.ephemeralContainerStatuses || []),
    ];

    for (const status of statuses) {
      const runtimeId = status.containerID?.split('://')[1];
      if (!runtimeId) continue;
      byRuntimeContainerId.set(runtimeId, {
        namespace,
        podName,
        podUid: pod.metadata?.uid,
        containerName: status.name,
      });
    }
  }

  return { byNamespaceName, byRuntimeContainerId };
}

async function fetchViaMetricsApi(token, ca) {
  const raw = await k8sGet(`/apis/metrics.k8s.io/v1beta1/namespaces/${TARGET_NAMESPACE}/pods`, token, ca);
  const metricsList = JSON.parse(raw);
  const rows = [];

  for (const pod of metricsList.items || []) {
    const podUid = pod.metadata?.uid;
    const podName = pod.metadata?.name;
    if (!podUid || !podName) continue;

    for (const container of pod.containers || []) {
      const cpuRaw = container.usage?.cpu || '0';
      const memoryRaw = container.usage?.memory || '0';
      rows.push({
        podUid,
        podName,
        containerName: container.name,
        cpuRaw,
        memoryRaw,
        cpuMillicores: parseCpuToMillicores(cpuRaw),
        memoryBytes: parseMemoryToBytes(memoryRaw),
      });
    }
  }

  return rows;
}

async function fetchViaNodeSummary(token, ca, podsIndex) {
  const nodesRaw = await k8sGet('/api/v1/nodes', token, ca);
  const nodeList = JSON.parse(nodesRaw);
  const rows = [];

  for (const node of nodeList.items || []) {
    const nodeName = node.metadata?.name;
    if (!nodeName) continue;

    const summaryRaw = await k8sGet(
      `/api/v1/nodes/${encodeURIComponent(nodeName)}/proxy/stats/summary`,
      token,
      ca
    );
    const summary = JSON.parse(summaryRaw);

    for (const pod of summary.pods || []) {
      const namespace = pod.podRef?.namespace || TARGET_NAMESPACE;
      if (namespace !== TARGET_NAMESPACE) continue;

      const podName = pod.podRef?.name;
      if (!podName) continue;

      const key = `${namespace}/${podName}`;
      const mapped = podsIndex.byNamespaceName.get(key);
      const podUid = pod.podRef?.uid || mapped?.uid;
      if (!podUid) continue;

      for (const container of pod.containers || []) {
        const cpuNano = container.cpu?.usageNanoCores ?? 0;
        const memoryBytes = container.memory?.workingSetBytes ?? container.memory?.usageBytes ?? 0;
        const cpuRaw = `${cpuNano}n`;
        const memoryRaw = `${memoryBytes}B`;

        rows.push({
          podUid,
          podName,
          containerName: container.name,
          cpuRaw,
          memoryRaw,
          cpuMillicores: Math.round(cpuNano / 1_000_000),
          memoryBytes: Math.round(memoryBytes),
        });
      }
    }
  }

  return rows;
}

function parsePrometheusLabels(raw) {
  const labels = {};
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)=\"((?:\\.|[^\"])*)\"/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    labels[match[1]] = match[2].replace(/\\\\/g, '\\').replace(/\\\"/g, '"');
  }
  return labels;
}

function parsePrometheusLine(line) {
  const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([0-9eE+.-]+)(?:\s+([0-9]+))?$/);
  if (!m) return null;
  return {
    metric: m[1],
    labels: parsePrometheusLabels(m[2]),
    value: parseFloat(m[3]),
    timestamp: m[4] ? parseInt(m[4], 10) : Date.now(),
  };
}

async function fetchViaCadvisor(token, ca, podsIndex) {
  const nodesRaw = await k8sGet('/api/v1/nodes', token, ca);
  const nodeList = JSON.parse(nodesRaw);

  const cpuTotals = new Map();
  const memoryByContainer = new Map();

  for (const node of nodeList.items || []) {
    const nodeName = node.metadata?.name;
    if (!nodeName) continue;
    const metricsRaw = await k8sGet(
      `/api/v1/nodes/${encodeURIComponent(nodeName)}/proxy/metrics/cadvisor`,
      token,
      ca
    );

    for (const line of metricsRaw.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const parsed = parsePrometheusLine(line.trim());
      if (!parsed) continue;

      let namespace = parsed.labels.namespace;
      let podName = parsed.labels.pod;
      let containerName = parsed.labels.container;

      if (!containerName) {
        const idPath = parsed.labels.id || '';
        const idMatch = idPath.match(/\/([a-f0-9]{24,})$/i);
        const runtimeId = idMatch?.[1];
        if (runtimeId && podsIndex.byRuntimeContainerId.has(runtimeId)) {
          const resolved = podsIndex.byRuntimeContainerId.get(runtimeId);
          namespace = resolved.namespace;
          podName = resolved.podName;
          containerName = resolved.containerName;
        }
      }

      if (!namespace || namespace !== TARGET_NAMESPACE || !podName || !containerName) continue;

      const key = `${namespace}/${podName}/${containerName}`;
      if (parsed.metric === 'container_cpu_usage_seconds_total') {
        cpuTotals.set(key, { totalSeconds: parsed.value, tsMs: parsed.timestamp || Date.now() });
      } else if (parsed.metric === 'container_memory_working_set_bytes') {
        memoryByContainer.set(key, parsed.value);
      }
    }
  }

  const rows = [];
  for (const [key, cpuInfo] of cpuTotals.entries()) {
    const [namespace, podName, containerName] = key.split('/');
    const podMeta = podsIndex.byNamespaceName.get(`${namespace}/${podName}`);
    const podUid = podMeta?.uid;
    if (!podUid) continue;

    const prev = cpuTotalByContainer.get(key);
    let cpuMillicores = 0;
    if (prev && cpuInfo.totalSeconds >= prev.totalSeconds && cpuInfo.tsMs > prev.tsMs) {
      const deltaSeconds = cpuInfo.totalSeconds - prev.totalSeconds;
      const deltaTimeSeconds = (cpuInfo.tsMs - prev.tsMs) / 1000;
      cpuMillicores = Math.max(0, Math.round((deltaSeconds / deltaTimeSeconds) * 1000));
    }
    cpuTotalByContainer.set(key, cpuInfo);

    const memoryBytes = Math.max(0, Math.round(memoryByContainer.get(key) || 0));
    rows.push({
      podUid,
      podName,
      containerName,
      cpuRaw: `${cpuInfo.totalSeconds}s_total`,
      memoryRaw: `${memoryBytes}B`,
      cpuMillicores,
      memoryBytes,
    });
  }

  return rows;
}

async function fetchUsageRows(token, ca) {
  const podsIndex = await fetchPodsIndex(token, ca);
  try {
    return await fetchViaMetricsApi(token, ca);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`metrics.k8s.io unavailable, falling back to cadvisor metrics API: ${msg}`);
    try {
      return await fetchViaCadvisor(token, ca, podsIndex);
    } catch (cadvisorError) {
      const cadvisorMsg = cadvisorError instanceof Error ? cadvisorError.message : String(cadvisorError);
      console.warn(`cadvisor metrics unavailable, falling back to node summary API: ${cadvisorMsg}`);
      return fetchViaNodeSummary(token, ca, podsIndex);
    }
  }
}

async function collectOnce(pool, token, ca) {
  const rows = await fetchUsageRows(token, ca);

  let sampleCount = 0;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    for (const row of rows) {
      const containerId = makeUuidFromString(`${row.podUid}:${row.containerName}`);

      await db.query(
        `INSERT INTO container_resource_samples (
             sampled_at, namespace, pod_uid, pod_name, container_name, container_id,
             cpu_raw, memory_raw, cpu_millicores, memory_bytes
           ) VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          TARGET_NAMESPACE,
          row.podUid,
          row.podName,
          row.containerName,
          containerId,
          row.cpuRaw,
          row.memoryRaw,
          row.cpuMillicores,
          row.memoryBytes,
        ]
      );
      sampleCount += 1;
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }

  return sampleCount;
}

async function main() {
  const token = readFileSync(SA_TOKEN_PATH, 'utf8').trim();
  const ca = readFileSync(SA_CA_PATH, 'utf8');
  const pool = new Pool(buildDbConfig());

  await ensureSchema(pool);
  console.log(
    `Resource collector started namespace=${TARGET_NAMESPACE} interval=${SAMPLE_INTERVAL_SECONDS}s`
  );

  while (true) {
    const startedAt = Date.now();
    try {
      const sampleCount = await collectOnce(pool, token, ca);
      console.log(`Collected ${sampleCount} container samples at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Resource collection failed:', error.message || error);
    }

    const elapsedMs = Date.now() - startedAt;
    const sleepMs = Math.max(0, SAMPLE_INTERVAL_SECONDS * 1000 - elapsedMs);
    await sleep(sleepMs);
  }
}

main().catch((error) => {
  console.error('Collector failed:', error);
  process.exit(1);
});
