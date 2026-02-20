const http = require('http');
const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const PORT = parseInt(process.env.API_PORT || '54321', 10);

const pool = new Pool({ connectionString: DB_URL });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // Add a simple test endpoint
  if (url.pathname === '/test') {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ message: 'API is working!', timestamp: new Date().toISOString() }));
    return;
  }
  
  if (url.pathname !== '/functions/v1/database') {
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
  console.log(`Backend API: http://localhost:${PORT}/functions/v1/database`);
});
