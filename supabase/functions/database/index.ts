import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const CORS_ALLOW_ORIGIN = Deno.env.get("CORS_ALLOW_ORIGIN") ?? "";
const LOG_QUERY_LIMIT_DEFAULT = parseInt(Deno.env.get("LOG_QUERY_LIMIT_DEFAULT") ?? "2000", 10);
const LOG_QUERY_LIMIT_MAX = parseInt(Deno.env.get("LOG_QUERY_LIMIT_MAX") ?? "5000", 10);

function resolveAllowedOrigin(origin: string | null): string {
  if (!CORS_ALLOW_ORIGIN) return "*";
  if (!origin) return CORS_ALLOW_ORIGIN;
  return origin === CORS_ALLOW_ORIGIN ? origin : CORS_ALLOW_ORIGIN;
}

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(origin),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function parseLogLimit(raw: string | null): number {
  const parsed = raw ? parseInt(raw, 10) : LOG_QUERY_LIMIT_DEFAULT;
  if (!Number.isFinite(parsed) || parsed <= 0) return LOG_QUERY_LIMIT_DEFAULT;
  return Math.min(parsed, LOG_QUERY_LIMIT_MAX);
}

// Database connection configuration from environment variables
const databaseUrl = Deno.env.get("DATABASE_URL");
const dbHost = Deno.env.get("DB_HOST");
const dbPort = Deno.env.get("DB_PORT") ?? "5432";
const dbName = Deno.env.get("DB_NAME");
const dbUser = Deno.env.get("DB_USER");
const dbPassword = Deno.env.get("DB_PASSWORD") ?? "";
const dbSsl = Deno.env.get("DB_SSL") !== "false";

// Create connection pool
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  if (databaseUrl) {
    // Use connection string if provided
    pool = new Pool(databaseUrl, 3, true);
  } else if (dbHost && dbName && dbUser) {
    // Use individual connection parameters
    pool = new Pool({
      hostname: dbHost,
      port: parseInt(dbPort),
      database: dbName,
      user: dbUser,
      password: dbPassword,
      tls: dbSsl ? { enabled: true } : undefined,
    }, 3, true);
  } else {
    throw new Error("Database configuration missing. Set DATABASE_URL or individual DB_* variables.");
  }

  return pool;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const pool = getPool();

    let result: any;

    switch (action) {
      case "getPods": {
        const connection = await pool.connect();
        try {
          const podsResult = await connection.queryObject(`
            SELECT id, name, namespace, status, node_name, pod_ip, labels, restarts, created_at, updated_at
            FROM pods
            ORDER BY created_at DESC
          `);

          const containersResult = await connection.queryObject(`
            SELECT id, pod_id, name, image, status, ready, restart_count, started_at, 
                   last_state_reason, last_state_exit_code, last_state_message,
                   cpu_request_millicores, cpu_limit_millicores, memory_request_bytes, memory_limit_bytes,
                   created_at, updated_at
            FROM containers
          `);

          const podLogSummariesResult = await connection.queryObject(`
            SELECT
              c.pod_id,
              COUNT(*) FILTER (WHERE l.level = 'error')::int AS error_count,
              COUNT(*) FILTER (WHERE l.level = 'warn')::int AS warning_count,
              COUNT(*) FILTER (
                WHERE l.message ~* '(exception|stacktrace|traceback|(^|\\s)at\\s+\\S+)'
              )::int AS exception_count
            FROM logs l
            JOIN containers c ON c.id = l.container_id
            GROUP BY c.pod_id
          `);

          result = {
            pods: podsResult.rows,
            containers: containersResult.rows,
            podLogSummaries: podLogSummariesResult.rows,
          };
        } finally {
          connection.release();
        }
        break;
      }

      case "getLogs": {
        const containerId = url.searchParams.get("containerId");
        if (!containerId) {
          throw new Error("containerId is required");
        }
        const limit = parseLogLimit(url.searchParams.get("limit"));

        const connection = await pool.connect();
        try {
          const logsResult = await connection.queryObject(`
            SELECT id, container_id, timestamp, level, message, created_at
            FROM logs
            WHERE container_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
          `, [containerId, limit]);

          result = { logs: [...logsResult.rows].reverse() };
        } finally {
          connection.release();
        }
        break;
      }

      case "getResourceSamples": {
        const containerId = url.searchParams.get("containerId");
        if (!containerId) {
          throw new Error("containerId is required");
        }

        const connection = await pool.connect();
        try {
          let samplesResult;
          try {
            samplesResult = await connection.queryObject(`
              SELECT sampled_at, cpu_millicores, memory_bytes
              FROM container_resource_samples
              WHERE container_id = $1
              ORDER BY sampled_at DESC
              LIMIT 120
            `, [containerId]);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("container_resource_samples")) {
              samplesResult = { rows: [] };
            } else {
              throw error;
            }
          }

          result = { samples: [...samplesResult.rows].reverse() };
        } finally {
          connection.release();
        }
        break;
      }

      case "health": {
        const connection = await pool.connect();
        try {
          await connection.queryObject("SELECT 1");
          result = { status: "healthy", timestamp: new Date().toISOString() };
        } finally {
          connection.release();
        }
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Database error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
