#!/usr/bin/env node
/**
 * Local database API server - mimics Supabase database edge function.
 * Use when developing locally without Docker/Supabase CLI.
 *
 * Environment variables (from process.env or .env):
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   API_PORT - Server port (default: 54321)
 *   STATIC_DIR - Optional directory to serve static dashboard files from
 */
import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import pg from 'pg';

// Load .env if DATABASE_URL not set
if (!process.env.DATABASE_URL && existsSync('.env')) {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^DATABASE_URL=(.+)$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '').trim();
  }
}

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_SSL = process.env.DB_SSL === 'true';
const PORT = parseInt(process.env.API_PORT || process.env.PORT || '54321', 10);
const STATIC_DIR = process.env.STATIC_DIR;

if (!DB_URL && !(DB_HOST && DB_NAME && DB_USER)) {
  console.error('Error: set DATABASE_URL or DB_HOST/DB_NAME/DB_USER');
  process.exit(1);
}

const pool = new Pool(
  DB_URL
    ? { connectionString: DB_URL }
    : {
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        password: DB_PASSWORD,
        ssl: DB_SSL ? { rejectUnauthorized: false } : false,
      }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const staticRoot = STATIC_DIR && existsSync(STATIC_DIR) ? path.resolve(STATIC_DIR) : null;

function isPathInsideRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function serveStatic(req, res, urlPath) {
  if (!staticRoot) return false;

  const requestPath = urlPath === '/' ? '/index.html' : urlPath;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.resolve(path.join(staticRoot, safePath));

  if (!(filePath === path.join(staticRoot, 'index.html') || isPathInsideRoot(staticRoot, filePath))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  const candidatePaths = [filePath, path.join(staticRoot, 'index.html')];
  const selected = candidatePaths.find((p) => existsSync(p) && statSync(p).isFile());
  if (!selected) return false;

  const ext = path.extname(selected).toLowerCase();
  const contentType = mimeTypes.get(ext) || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(selected).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/functions/v1/database') {
    if (serveStatic(req, res, url.pathname)) return;
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const action = url.searchParams.get('action');

  try {
    let result;

    switch (action) {
      case 'getPods': {
        const podsRes = await pool.query(`
          SELECT id, name, namespace, status, node_name, pod_ip, labels, restarts, created_at, updated_at
          FROM pods ORDER BY created_at DESC
        `);
        const containersRes = await pool.query(`
          SELECT id, pod_id, name, image, status, ready, restart_count, started_at,
                 last_state_reason, last_state_exit_code, last_state_message, created_at, updated_at
          FROM containers
        `);
        result = { pods: podsRes.rows, containers: containersRes.rows };
        break;
      }
      case 'getLogs': {
        const containerId = url.searchParams.get('containerId');
        if (!containerId) throw new Error('containerId is required');
        const logsRes = await pool.query(
          `SELECT id, container_id, timestamp, level, message, created_at
           FROM logs WHERE container_id = $1 ORDER BY timestamp ASC`,
          [containerId]
        );
        result = { logs: logsRes.rows };
        break;
      }
      case 'health': {
        await pool.query('SELECT 1');
        result = { status: 'healthy', timestamp: new Date().toISOString() };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('Database error:', err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: err.message || 'Unknown error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local DB API: http://localhost:${PORT}/functions/v1/database`);
  if (staticRoot) {
    console.log(`Serving static files from: ${staticRoot}`);
  }
});
