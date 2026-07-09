export type HealthStatus = "UP" | "DOWN" | "OUT_OF_SERVICE" | "UNKNOWN" | string;

export interface ParsedComponent {
  path: string;
  status: HealthStatus;
  details: Record<string, unknown> | null;
}

export interface ParsedDisk {
  path: string;
  diskPath: string | null;
  totalBytes: number;
  freeBytes: number;
  usedPct: number;
  thresholdBytes: number | null;
}

export interface ParsedService {
  source: string;
  serviceName: string;
  instanceCount: number;
}

export interface ParsedHealth {
  overall: HealthStatus;
  components: ParsedComponent[];
  disks: ParsedDisk[];
  services: ParsedService[];
  propertySources: string[];
}

type HealthNode = {
  status?: HealthStatus;
  description?: string;
  details?: Record<string, unknown>;
  components?: Record<string, HealthNode>;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function walk(
  node: HealthNode,
  path: string,
  topKey: string,
  out: {
    components: ParsedComponent[];
    disks: ParsedDisk[];
    services: ParsedService[];
    propertySources: string[];
  },
) {
  const details = isObject(node.details) ? node.details : null;
  out.components.push({
    path,
    status: node.status ?? "UNKNOWN",
    details,
  });

  if (details) {
    const total = typeof details.total === "number" ? details.total : null;
    const free = typeof details.free === "number" ? details.free : null;
    if (total !== null && free !== null && total > 0) {
      const used = total - free;
      out.disks.push({
        path,
        diskPath: typeof details.path === "string" ? details.path : null,
        totalBytes: total,
        freeBytes: free,
        usedPct: (used / total) * 100,
        thresholdBytes:
          typeof details.threshold === "number" ? details.threshold : null,
      });
    }

    const services = details.services;
    if (Array.isArray(services)) {
      for (const s of services) {
        if (typeof s === "string") {
          out.services.push({
            source: topKey,
            serviceName: s,
            instanceCount: 1,
          });
        }
      }
    }

    const apps = details.applications;
    if (isObject(apps)) {
      for (const [name, count] of Object.entries(apps)) {
        out.services.push({
          source: "eureka",
          serviceName: name,
          instanceCount: typeof count === "number" ? count : 1,
        });
      }
    }

    const propertySources = details.propertySources;
    if (Array.isArray(propertySources)) {
      for (const p of propertySources) {
        if (typeof p === "string") out.propertySources.push(p);
      }
    }
  }

  if (isObject(node.components)) {
    for (const [childKey, childNode] of Object.entries(node.components)) {
      if (!isObject(childNode)) continue;
      const nextPath = `${path}.${childKey}`;
      walk(childNode as HealthNode, nextPath, topKey, out);
    }
  }
}

export function parseHealth(json: unknown): ParsedHealth {
  const out: ParsedHealth = {
    overall: "UNKNOWN",
    components: [],
    disks: [],
    services: [],
    propertySources: [],
  };

  if (!isObject(json)) return out;

  out.overall = (json.status as HealthStatus) ?? "UNKNOWN";

  const components = (json as HealthNode).components;
  if (!isObject(components)) return out;

  for (const [key, node] of Object.entries(components)) {
    if (!isObject(node)) continue;
    walk(node as HealthNode, key, key, out);
  }

  return out;
}
