import { NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/notifiers/slack";
import { acknowledgeIncident } from "@/lib/ack";

export const dynamic = "force-dynamic";

type SlackInteraction = {
  actions?: { action_id?: string; value?: string }[];
  user?: { username?: string; name?: string };
};

/**
 * Slack interactivity endpoint (A3). Receives the "Acknowledge" button click,
 * verifies the request signature with SLACK_SIGNING_SECRET, and acks the
 * incident. Public (no session) — the Slack signature is the authentication.
 */
export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const raw = await req.text();
  const sig = req.headers.get("x-slack-signature") ?? "";
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  if (!verifySlackSignature(secret, ts, raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const payloadStr = new URLSearchParams(raw).get("payload");
  if (!payloadStr) return NextResponse.json({ text: "no payload" });
  let payload: SlackInteraction;
  try {
    payload = JSON.parse(payloadStr) as SlackInteraction;
  } catch {
    return NextResponse.json({ text: "bad payload" });
  }

  const action = payload.actions?.[0];
  if (action?.action_id !== "ack_incident" || !action.value) {
    return NextResponse.json({ text: "ignored" });
  }
  const incidentId = Number(action.value);
  const user = payload.user?.username || payload.user?.name || "slack";
  const res = await acknowledgeIncident(incidentId, `slack:${user}`);
  const text = res.ok
    ? `✅ Acknowledged *${res.monitorName}* — ${res.kind}`
    : res.reason === "resolved"
      ? "Already resolved ✅"
      : "Incident not found";
  return NextResponse.json({ replace_original: false, text });
}
