/**
 * Standalone mock actuator service for testing the APM without a real backend.
 *
 *   npm run mock            # serves on http://localhost:4100
 *   PORT=4200 npm run mock
 *
 * Point an APM monitor at one of these URLs — the scenario is encoded in the
 * query string, so each monitor deterministically reproduces one condition:
 *
 *   /health                              healthy (the raw example JSON)
 *   /health?status=DOWN                  overall DOWN
 *   /health?disk=92                      disk usage forced to 92%
 *   /health?drop=admin-console-svc,ppn-svc   those services deregistered (down)
 *   /health?down=redis,livenessState     mark components DOWN
 *   /health?delay=3000                   respond after 3s (latency)
 *   /health?http=503                     reply with HTTP 503 (hard down)
 *
 * Params combine freely, e.g. /health?disk=97&drop=billing-svc&delay=1500
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "..", "example", "health-check.json");
const PORT = Number(process.env.PORT ?? 4100);

interface Health {
  status: string;
  components: {
    discoveryComposite: {
      components: {
        discoveryClient: { details: { services: string[] } };
        eureka: { details: { applications: Record<string, number> } };
      };
    };
    reactiveDiscoveryClients: {
      components: Record<string, { details: { services: string[] } }>;
    };
    diskSpace: { details: { total: number; free: number } };
    [key: string]: { status?: string; [k: string]: unknown };
  };
  [key: string]: unknown;
}

// Re-read the file on every request so edits to health-check.json take effect
// immediately — no restart. Keep the last valid parse so a half-written save
// (invalid JSON) doesn't break the endpoint.
let lastGood: string | null = null;

function loadBase(): Health {
  try {
    const raw = readFileSync(JSON_PATH, "utf8");
    JSON.parse(raw); // validate
    lastGood = raw;
  } catch (err) {
    if (!lastGood) throw err;
    console.warn(`[mock] ${JSON_PATH} unreadable/invalid, serving last good copy:`, (err as Error).message);
  }
  return JSON.parse(lastGood!) as Health;
}

function clone(): Health {
  return loadBase();
}

function applyScenario(url: URL): { body: Health; httpStatus: number; delayMs: number } {
  const body = clone();
  const q = url.searchParams;

  // overall status
  const status = q.get("status");
  if (status) body.status = status.toUpperCase();

  // disk usage %
  const disk = q.get("disk");
  if (disk) {
    const pct = Math.min(100, Math.max(0, Number(disk)));
    const total = body.components.diskSpace.details.total;
    body.components.diskSpace.details.free = Math.round(total * (1 - pct / 100));
  }

  // drop services (deregister → down)
  const drop = (q.get("drop") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (drop.length) {
    const dc = body.components.discoveryComposite.components;
    dc.discoveryClient.details.services = dc.discoveryClient.details.services.filter(
      (s) => !drop.includes(s.toLowerCase()),
    );
    for (const name of Object.keys(dc.eureka.details.applications)) {
      if (drop.includes(name.toLowerCase())) delete dc.eureka.details.applications[name];
    }
    for (const c of Object.values(body.components.reactiveDiscoveryClients.components)) {
      c.details.services = c.details.services.filter((s) => !drop.includes(s.toLowerCase()));
    }
  }

  // mark top-level components DOWN
  const down = (q.get("down") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of down) {
    if (body.components[name]) body.components[name].status = "DOWN";
  }

  const httpStatus = Number(q.get("http") ?? 200) || 200;
  const delayMs = Number(q.get("delay") ?? 0) || 0;
  return { body, httpStatus, delayMs };
}

const HELP = `mock actuator service — see scripts/mock-service.ts header for scenarios
GET /health[?status=DOWN&disk=92&drop=svc-a,svc-b&down=redis&delay=3000&http=503]
`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/" ) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(HELP);
    return;
  }
  if (url.pathname !== "/health" && url.pathname !== "/actuator/health") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  const { body, httpStatus, delayMs } = applyScenario(url);
  const send = () => {
    res.writeHead(httpStatus, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (delayMs > 0) setTimeout(send, delayMs);
  else send();
});

server.listen(PORT, () => {
  console.log(`mock actuator on http://localhost:${PORT}/health`);
  console.log(`source: ${JSON_PATH} (re-read each request — just edit & save, no restart)`);
  console.log(`scenarios: ?status=DOWN | ?disk=92 | ?drop=svc | ?down=redis | ?delay=3000 | ?http=503`);
});
