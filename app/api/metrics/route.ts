import { renderMetrics } from "@/lib/metrics";

// Prometheus scrape endpoint. Public (see middleware) so a scraper without a
// session can reach it; gate with a bearer token by setting METRICS_TOKEN.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return new Response("unauthorized\n", { status: 401 });
    }
  }
  const body = await renderMetrics();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
