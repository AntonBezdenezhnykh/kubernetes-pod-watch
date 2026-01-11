import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kubernetes API configuration
const k8sApiServer = Deno.env.get("K8S_API_SERVER");
const k8sToken = Deno.env.get("K8S_TOKEN");
const k8sNamespace = Deno.env.get("K8S_NAMESPACE") || ""; // Empty = all namespaces
const k8sCaCert = Deno.env.get("K8S_CA_CERT"); // Optional: Base64 encoded CA cert
const k8sSkipTlsVerify = Deno.env.get("K8S_SKIP_TLS_VERIFY") === "true";

// Database configuration
const databaseUrl = Deno.env.get("DATABASE_URL");
const dbHost = Deno.env.get("DB_HOST");
const dbPort = Deno.env.get("DB_PORT") || "5432";
const dbName = Deno.env.get("DB_NAME");
const dbUser = Deno.env.get("DB_USER");
const dbPassword = Deno.env.get("DB_PASSWORD");
const dbSsl = Deno.env.get("DB_SSL") !== "false";

// Supabase configuration (alternative to external DB)
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface K8sPod {
  metadata: {
    uid: string;
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    creationTimestamp: string;
  };
  spec: {
    nodeName?: string;
    containers: Array<{
      name: string;
      image: string;
    }>;
  };
  status: {
    phase: string;
    podIP?: string;
    containerStatuses?: Array<{
      name: string;
      image: string;
      ready: boolean;
      restartCount: number;
      state: {
        running?: { startedAt: string };
        waiting?: { reason: string; message?: string };
        terminated?: { reason: string; exitCode: number; message?: string };
      };
      lastState?: {
        terminated?: { reason: string; exitCode: number; message?: string };
      };
    }>;
  };
}

interface K8sPodList {
  items: K8sPod[];
}

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;

  if (databaseUrl) {
    pool = new Pool(databaseUrl, 3, true);
    return pool;
  } else if (dbHost && dbName && dbUser && dbPassword) {
    pool = new Pool({
      hostname: dbHost,
      port: parseInt(dbPort),
      database: dbName,
      user: dbUser,
      password: dbPassword,
      tls: dbSsl ? { enabled: true } : undefined,
    }, 3, true);
    return pool;
  }

  return null;
}

async function fetchK8sPods(): Promise<K8sPod[]> {
  if (!k8sApiServer || !k8sToken) {
    throw new Error("Kubernetes API configuration missing. Set K8S_API_SERVER and K8S_TOKEN.");
  }

  const endpoint = k8sNamespace
    ? `${k8sApiServer}/api/v1/namespaces/${k8sNamespace}/pods`
    : `${k8sApiServer}/api/v1/pods`;

  const response = await fetch(endpoint, {
    headers: {
      "Authorization": `Bearer ${k8sToken}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kubernetes API error: ${response.status} - ${errorText}`);
  }

  const data: K8sPodList = await response.json();
  return data.items;
}

function mapPodStatus(phase: string, containerStatuses?: K8sPod["status"]["containerStatuses"]): string {
  // Check for specific container issues
  if (containerStatuses) {
    for (const cs of containerStatuses) {
      if (cs.state.waiting?.reason === "CrashLoopBackOff") return "CrashLoopBackOff";
      if (cs.state.waiting?.reason === "OOMKilled") return "OOMKilled";
      if (cs.state.terminated?.reason === "OOMKilled") return "OOMKilled";
      if (cs.state.terminated?.reason === "Error") return "Error";
      if (cs.lastState?.terminated?.reason === "OOMKilled") return "OOMKilled";
    }
  }

  switch (phase) {
    case "Running": return "Running";
    case "Pending": return "Pending";
    case "Succeeded": return "Terminated";
    case "Failed": return "Error";
    default: return "Unknown";
  }
}

type ContainerState = {
  running?: { startedAt: string };
  waiting?: { reason: string; message?: string };
  terminated?: { reason: string; exitCode: number; message?: string };
};

function mapContainerStatus(state: ContainerState): string {
  if (state.running) return "Running";
  if (state.waiting) return "Waiting";
  if (state.terminated) return "Terminated";
  return "Waiting";
}

async function syncToSupabase(pods: K8sPod[]): Promise<{ podsUpserted: number; containersUpserted: number }> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0");
  
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
  
  let podsUpserted = 0;
  let containersUpserted = 0;

  for (const pod of pods) {
    const totalRestarts = pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0;

    // Upsert pod
    const { error: podError } = await supabase
      .from("pods")
      .upsert({
        id: pod.metadata.uid,
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: mapPodStatus(pod.status.phase, pod.status.containerStatuses),
        node_name: pod.spec.nodeName || "unassigned",
        pod_ip: pod.status.podIP || null,
        labels: pod.metadata.labels || {},
        restarts: totalRestarts,
        created_at: pod.metadata.creationTimestamp,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (podError) {
      console.error(`Error upserting pod ${pod.metadata.name}:`, podError);
      continue;
    }
    podsUpserted++;

    // Upsert containers
    if (pod.status.containerStatuses) {
      for (const cs of pod.status.containerStatuses) {
        const containerId = `${pod.metadata.uid}-${cs.name}`;
        
        const { error: containerError } = await supabase
          .from("containers")
          .upsert({
            id: containerId,
            pod_id: pod.metadata.uid,
            name: cs.name,
            image: cs.image,
            status: mapContainerStatus(cs.state),
            ready: cs.ready,
            restart_count: cs.restartCount,
            started_at: cs.state.running?.startedAt || null,
            last_state_reason: cs.lastState?.terminated?.reason || cs.state.waiting?.reason || null,
            last_state_exit_code: cs.lastState?.terminated?.exitCode || cs.state.terminated?.exitCode || null,
            last_state_message: cs.lastState?.terminated?.message || cs.state.waiting?.message || cs.state.terminated?.message || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

        if (containerError) {
          console.error(`Error upserting container ${cs.name}:`, containerError);
          continue;
        }
        containersUpserted++;
      }
    }
  }

  return { podsUpserted, containersUpserted };
}

async function syncToExternalDb(pods: K8sPod[]): Promise<{ podsUpserted: number; containersUpserted: number }> {
  const dbPool = getPool();
  if (!dbPool) {
    throw new Error("Database configuration missing.");
  }

  const connection = await dbPool.connect();
  let podsUpserted = 0;
  let containersUpserted = 0;

  try {
    for (const pod of pods) {
      const totalRestarts = pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0;

      // Upsert pod
      await connection.queryObject(`
        INSERT INTO pods (id, name, namespace, status, node_name, pod_ip, labels, restarts, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          namespace = EXCLUDED.namespace,
          status = EXCLUDED.status,
          node_name = EXCLUDED.node_name,
          pod_ip = EXCLUDED.pod_ip,
          labels = EXCLUDED.labels,
          restarts = EXCLUDED.restarts,
          updated_at = EXCLUDED.updated_at
      `, [
        pod.metadata.uid,
        pod.metadata.name,
        pod.metadata.namespace,
        mapPodStatus(pod.status.phase, pod.status.containerStatuses),
        pod.spec.nodeName || "unassigned",
        pod.status.podIP || null,
        JSON.stringify(pod.metadata.labels || {}),
        totalRestarts,
        pod.metadata.creationTimestamp,
        new Date().toISOString(),
      ]);
      podsUpserted++;

      // Upsert containers
      if (pod.status.containerStatuses) {
        for (const cs of pod.status.containerStatuses) {
          const containerId = `${pod.metadata.uid}-${cs.name}`;

          await connection.queryObject(`
            INSERT INTO containers (id, pod_id, name, image, status, ready, restart_count, started_at, last_state_reason, last_state_exit_code, last_state_message, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
              updated_at = EXCLUDED.updated_at
          `, [
            containerId,
            pod.metadata.uid,
            cs.name,
            cs.image,
            mapContainerStatus(cs.state),
            cs.ready,
            cs.restartCount,
            cs.state.running?.startedAt || null,
            cs.lastState?.terminated?.reason || cs.state.waiting?.reason || null,
            cs.lastState?.terminated?.exitCode || cs.state.terminated?.exitCode || null,
            cs.lastState?.terminated?.message || cs.state.waiting?.message || cs.state.terminated?.message || null,
            new Date().toISOString(),
          ]);
          containersUpserted++;
        }
      }
    }
  } finally {
    connection.release();
  }

  return { podsUpserted, containersUpserted };
}

async function cleanupStalePods(currentPodIds: string[]): Promise<number> {
  if (supabaseUrl && supabaseServiceKey) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete containers for stale pods first
    const { error: containerError } = await supabase
      .from("containers")
      .delete()
      .not("pod_id", "in", `(${currentPodIds.join(",")})`);

    if (containerError) {
      console.error("Error cleaning up stale containers:", containerError);
    }

    // Delete stale pods
    const { data, error: podError } = await supabase
      .from("pods")
      .delete()
      .not("id", "in", `(${currentPodIds.join(",")})`)
      .select();

    if (podError) {
      console.error("Error cleaning up stale pods:", podError);
      return 0;
    }

    return data?.length || 0;
  } else {
    const dbPool = getPool();
    if (!dbPool) return 0;

    const connection = await dbPool.connect();
    try {
      // Delete containers for stale pods
      await connection.queryObject(`
        DELETE FROM containers WHERE pod_id NOT IN (${currentPodIds.map((_, i) => `$${i + 1}`).join(",")})
      `, currentPodIds);

      // Delete stale pods
      const result = await connection.queryObject(`
        DELETE FROM pods WHERE id NOT IN (${currentPodIds.map((_, i) => `$${i + 1}`).join(",")})
        RETURNING id
      `, currentPodIds);

      return result.rows.length;
    } finally {
      connection.release();
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "sync";
    const cleanup = url.searchParams.get("cleanup") === "true";

    switch (action) {
      case "sync": {
        console.log("Starting Kubernetes sync...");
        
        // Fetch pods from Kubernetes
        const pods = await fetchK8sPods();
        console.log(`Fetched ${pods.length} pods from Kubernetes`);

        // Sync to database
        let result: { podsUpserted: number; containersUpserted: number };
        
        if (supabaseUrl && supabaseServiceKey) {
          result = await syncToSupabase(pods);
        } else {
          result = await syncToExternalDb(pods);
        }

        // Optionally cleanup stale pods
        let podsDeleted = 0;
        if (cleanup && pods.length > 0) {
          const currentPodIds = pods.map(p => p.metadata.uid);
          podsDeleted = await cleanupStalePods(currentPodIds);
        }

        const response = {
          success: true,
          timestamp: new Date().toISOString(),
          stats: {
            podsFetched: pods.length,
            podsUpserted: result.podsUpserted,
            containersUpserted: result.containersUpserted,
            podsDeleted,
          },
        };

        console.log("Sync completed:", response.stats);
        
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        const hasK8sConfig = !!(k8sApiServer && k8sToken);
        const hasDbConfig = !!(supabaseUrl && supabaseServiceKey) || !!(databaseUrl || (dbHost && dbName && dbUser && dbPassword));

        return new Response(JSON.stringify({
          kubernetes: {
            configured: hasK8sConfig,
            apiServer: k8sApiServer ? k8sApiServer.replace(/\/\/.*@/, "//***@") : null,
            namespace: k8sNamespace || "all",
          },
          database: {
            configured: hasDbConfig,
            type: (supabaseUrl && supabaseServiceKey) ? "supabase" : "external",
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Kubernetes sync error:", error);
    
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
