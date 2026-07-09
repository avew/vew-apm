import { NextResponse } from "next/server";
import { sampleHealth } from "@/lib/fixtures/sample-health";

export const dynamic = "force-dynamic";

let overrideOverall: "UP" | "DOWN" | null = null;
let dropped: Set<string> = new Set();

// deep-clone helper (structuredClone available in Node 18+)
function clone<T>(v: T): T {
  return structuredClone(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status === "UP" || status === "DOWN") overrideOverall = status;
  if (status === "reset") {
    overrideOverall = null;
    dropped = new Set();
  }

  // ?drop=svc-a,svc-b removes services from the registry (simulate down).
  // ?restore=... or restore=all puts them back.
  const drop = url.searchParams.get("drop");
  if (drop) drop.split(",").forEach((s) => dropped.add(s.trim().toLowerCase()));
  const restore = url.searchParams.get("restore");
  if (restore === "all") dropped = new Set();
  else if (restore)
    restore.split(",").forEach((s) => dropped.delete(s.trim().toLowerCase()));

  const body = clone(sampleHealth) as unknown as {
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
    };
  };

  if (dropped.size > 0) {
    const dc = body.components.discoveryComposite.components;
    dc.discoveryClient.details.services =
      dc.discoveryClient.details.services.filter(
        (s) => !dropped.has(s.toLowerCase()),
      );
    for (const name of Object.keys(dc.eureka.details.applications)) {
      if (dropped.has(name.toLowerCase()))
        delete dc.eureka.details.applications[name];
    }
    for (const client of Object.values(
      body.components.reactiveDiscoveryClients.components,
    )) {
      client.details.services = client.details.services.filter(
        (s) => !dropped.has(s.toLowerCase()),
      );
    }
  }

  if (overrideOverall === "DOWN") body.status = "DOWN";
  return NextResponse.json(body);
}
