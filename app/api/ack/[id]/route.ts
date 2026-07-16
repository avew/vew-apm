import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { verifyAckToken } from "@/lib/ack";

export const dynamic = "force-dynamic";

const SNOOZE_MINUTES: Record<string, number> = {
  snooze60: 60,
  snooze240: 240,
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, bodyHtml: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title)} · Vew APM</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f6f8fa; color: #16202e; }
  @media (prefers-color-scheme: dark) { body { background: #0c121b; color: #e5ebf2; } }
  .card { width: min(440px, 92vw); padding: 28px; border-radius: 14px;
    background: Canvas; box-shadow: 0 10px 30px -14px rgba(0,0,0,.4);
    border: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { margin: 6px 0; opacity: .85; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  button { font: inherit; padding: 9px 16px; border-radius: 9px; cursor: pointer;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: transparent; color: inherit; }
  button.primary { background: #0c7a89; border-color: #0c7a89; color: #fff; }
  form { margin: 0; }
  .muted { font-size: 13px; opacity: .6; margin-top: 16px; }
</style></head><body><div class="card">${bodyHtml}</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function loadIncident(id: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.id, id));
  if (!row) return null;
  const [mon] = await db
    .select({ name: schema.monitors.name })
    .from(schema.monitors)
    .where(eq(schema.monitors.id, row.monitorId));
  return { row, monitorName: mon?.name ?? `monitor #${row.monitorId}` };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const incidentId = Number(id);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!Number.isInteger(incidentId) || !verifyAckToken(incidentId, token)) {
    return page("Invalid link", "<h1>Invalid link</h1><p>This acknowledge link is not valid.</p>", 403);
  }
  const found = await loadIncident(incidentId);
  if (!found) {
    return page("Not found", "<h1>Incident not found</h1><p>It may have been deleted.</p>", 404);
  }
  const { row, monitorName } = found;
  if (row.resolved) {
    return page(
      "Already resolved",
      `<h1>Already resolved ✅</h1><p><strong>${esc(monitorName)}</strong> — ${esc(row.kind)} has recovered. Nothing to acknowledge.</p>`,
    );
  }
  const t = esc(token);
  const already = row.ackedAt
    ? `<p class="muted">Already acknowledged${row.ackedBy ? ` by ${esc(row.ackedBy)}` : ""}.</p>`
    : "";
  return page(
    "Acknowledge incident",
    `<h1>Acknowledge this alert?</h1>
     <p><strong>${esc(monitorName)}</strong> — ${esc(row.kind)} (${esc(row.severity)})</p>
     <p>Acknowledging stops reminder notifications until it recovers.</p>
     ${already}
     <div class="row">
       <form method="post"><input type="hidden" name="token" value="${t}" /><input type="hidden" name="action" value="ack" /><button class="primary" type="submit">Acknowledge</button></form>
       <form method="post"><input type="hidden" name="token" value="${t}" /><input type="hidden" name="action" value="snooze60" /><button type="submit">Snooze 1h</button></form>
       <form method="post"><input type="hidden" name="token" value="${t}" /><input type="hidden" name="action" value="snooze240" /><button type="submit">Snooze 4h</button></form>
     </div>`,
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const incidentId = Number(id);
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const action = String(form?.get("action") ?? "ack");
  if (!Number.isInteger(incidentId) || !verifyAckToken(incidentId, token)) {
    return page("Invalid link", "<h1>Invalid link</h1><p>This acknowledge link is not valid.</p>", 403);
  }
  const found = await loadIncident(incidentId);
  if (!found) {
    return page("Not found", "<h1>Incident not found</h1><p>It may have been deleted.</p>", 404);
  }
  const { row, monitorName } = found;
  if (row.resolved) {
    return page(
      "Already resolved",
      `<h1>Already resolved ✅</h1><p><strong>${esc(monitorName)}</strong> has recovered.</p>`,
    );
  }

  const now = new Date();
  const snoozeMin = SNOOZE_MINUTES[action];
  const db = getDb();
  await db
    .update(schema.incidents)
    .set({
      ackedAt: now,
      ackedBy: "link",
      snoozedUntil: snoozeMin ? new Date(now.getTime() + snoozeMin * 60_000) : null,
    })
    .where(eq(schema.incidents.id, incidentId));

  const what = snoozeMin
    ? `Snoozed for ${snoozeMin >= 60 ? `${snoozeMin / 60}h` : `${snoozeMin}m`}`
    : "Acknowledged";
  return page(
    what,
    `<h1>${esc(what)} ✅</h1><p><strong>${esc(monitorName)}</strong> — ${esc(row.kind)}.</p><p>Reminders are paused${snoozeMin ? " until the snooze ends" : " until it recovers"}. You can close this tab.</p>`,
  );
}
