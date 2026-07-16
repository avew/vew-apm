import { getDb, schema } from "@/lib/db/client";
import { eq, inArray } from "drizzle-orm";
import { sendWebhook, type WebhookConfig } from "./notifiers/webhook";
import { sendEmail, type EmailConfig } from "./notifiers/email";
import { sendTelegram, type TelegramConfig } from "./notifiers/telegram";
import { sendSlack, type SlackConfig } from "./notifiers/slack";
import { sendDiscord, type DiscordConfig } from "./notifiers/discord";
import { sendTeams, type TeamsConfig } from "./notifiers/teams";
import { sendPagerDuty, type PagerDutyConfig } from "./notifiers/pagerduty";
import { sendOpsgenie, type OpsgenieConfig } from "./notifiers/opsgenie";
import { withRetry } from "./retry";
import { decryptSecret } from "./crypto";
import type { Monitor, NotificationChannel } from "@/lib/db/schema";
import type { Severity, AlertKind } from "./rules";
import { channelShouldFire, type RouteRule } from "./routing";
import { ackUrl } from "./ack";

export type Event =
  | {
      kind: "down";
      monitor: Monitor;
      // incident id, used to build the acknowledge link (P3)
      incidentId?: number;
      componentPath: string | null;
      startedAt: Date;
      severity: Severity;
      alertKind: AlertKind;
      reason: string | null;
      metricValue: number | null;
      threshold: number | null;
      // set on re-notifications of a still-open incident
      repeat?: boolean;
      // set when severity rose (warning → critical) since the last alert
      escalated?: boolean;
    }
  | {
      kind: "resolved";
      monitor: Monitor;
      incidentId?: number;
      componentPath: string | null;
      startedAt: Date;
      endedAt: Date;
      severity: Severity;
      alertKind: AlertKind;
      reason: string | null;
      metricValue: number | null;
      threshold: number | null;
    };

function renderText(ev: Event): { subject: string; body: string } {
  const scope = ev.componentPath ? `\`${ev.componentPath}\`` : "overall";
  const sev = ev.severity.toUpperCase();
  if (ev.kind === "down") {
    const tag = ev.escalated ? "ESCALATED" : ev.repeat ? `STILL ${sev}` : sev;
    const icon = ev.escalated ? "⏫" : ev.repeat ? "🔁" : "🔴";
    const openedFor = ev.repeat
      ? `\nOpen for: ${Math.round((Date.now() - ev.startedAt.getTime()) / 60000)}m`
      : "";
    const ack = ev.incidentId != null ? ackUrl(ev.incidentId) : null;
    const ackLine = ack ? `\nAcknowledge: ${ack}` : "";
    return {
      subject: `[Vew APM][${tag}] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
      body: `${icon} *${ev.monitor.name}* alert: *${ev.alertKind}* (${ev.severity})\nURL: ${ev.monitor.url}\nScope: ${scope}\n${ev.reason ? `Detail: ${ev.reason}\n` : ""}Started: ${ev.startedAt.toISOString()}${openedFor}${ackLine}`,
    };
  }
  return {
    subject: `[Vew APM][RESOLVED] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
    body: `✅ *${ev.monitor.name}* recovered: *${ev.alertKind}*\nURL: ${ev.monitor.url}\nScope: ${scope}\nStarted: ${ev.startedAt.toISOString()}\nEnded:   ${ev.endedAt.toISOString()}\nDuration: ${Math.round((ev.endedAt.getTime() - ev.startedAt.getTime()) / 1000)}s`,
  };
}

/**
 * Stable key for incident-tracking channels (PagerDuty/Opsgenie) so a resolve
 * closes the alert its trigger opened, and repeated down notifications dedup
 * into one alert. Falls back to a monitor+kind composite if no incident id.
 */
function incidentDedupKey(ev: Event): string {
  const id =
    ev.incidentId != null
      ? String(ev.incidentId)
      : `${ev.monitor.id}-${ev.alertKind}-${ev.componentPath ?? "overall"}`;
  return `apm-incident-${id}`;
}

/** Chat-card accent color by event state: green resolved, red critical, amber warning. */
function severityColor(ev: Event): string {
  if (ev.kind === "resolved") return "#22c55e";
  return ev.severity === "critical" ? "#ef4444" : "#f59e0b";
}

async function loadEnabledChannels() {
  const db = getDb();
  return db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.enabled, true));
}

/**
 * Load routing rules for the given channels, grouped by channel id. A channel
 * with no rows fires for everything (see `channelShouldFire`).
 */
async function loadRoutesByChannel(
  channelIds: number[],
): Promise<Map<number, RouteRule[]>> {
  const byChannel = new Map<number, RouteRule[]>();
  if (channelIds.length === 0) return byChannel;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.channelRoutes)
    .where(inArray(schema.channelRoutes.channelId, channelIds));
  for (const r of rows) {
    const rule: RouteRule = {
      scope: r.scope as RouteRule["scope"],
      targetId: r.targetId,
      minSeverity: r.minSeverity as Severity,
      alertKinds: r.alertKinds ?? null,
    };
    const list = byChannel.get(r.channelId);
    if (list) list.push(rule);
    else byChannel.set(r.channelId, [rule]);
  }
  return byChannel;
}

interface RenderedMessage {
  subject: string;
  body: string;
  payload: Record<string, unknown>;
}

function buildMessage(ev: Event): RenderedMessage {
  const { subject, body } = renderText(ev);
  const payload = {
    kind: ev.kind,
    alertKind: ev.alertKind,
    severity: ev.severity,
    reason: ev.reason,
    metricValue: ev.metricValue,
    threshold: ev.threshold,
    monitor: {
      id: ev.monitor.id,
      name: ev.monitor.name,
      url: ev.monitor.url,
    },
    componentPath: ev.componentPath,
    repeat: ev.kind === "down" ? ev.repeat ?? false : false,
    escalated: ev.kind === "down" ? ev.escalated ?? false : false,
    ackUrl:
      ev.kind === "down" && ev.incidentId != null ? ackUrl(ev.incidentId) : null,
    startedAt: ev.startedAt.toISOString(),
    endedAt: ev.kind === "resolved" ? ev.endedAt.toISOString() : null,
  };
  return { subject, body, payload };
}

/** Deliver one rendered message to one channel, with retry. Never throws. */
async function deliver(
  c: NotificationChannel,
  ev: Event,
  msg: RenderedMessage,
): Promise<void> {
  const cfg = decryptSecret<Record<string, unknown>>(c.config);
  const label = `${c.kind}#${c.id}`;
  const { subject, body } = msg;
  const send = async () => {
    if (c.kind === "webhook") {
      await sendWebhook(cfg as unknown as WebhookConfig, msg.payload);
    } else if (c.kind === "email") {
      await sendEmail(cfg as unknown as EmailConfig, subject, body);
    } else if (c.kind === "telegram") {
      const tg = cfg as unknown as TelegramConfig & { template?: string };
      const text = tg.template
        ? tg.template
            .replaceAll("{{name}}", ev.monitor.name)
            .replaceAll("{{status}}", ev.kind === "down" ? "DOWN" : "UP")
            .replaceAll("{{severity}}", ev.severity)
            .replaceAll("{{reason}}", ev.reason ?? "")
            .replaceAll("{{url}}", ev.monitor.url)
            .replaceAll("{{component}}", ev.componentPath ?? "overall")
        : `*${subject}*\n\n${body}`;
      await sendTelegram(tg, text);
    } else if (c.kind === "slack") {
      await sendSlack(cfg as unknown as SlackConfig, {
        title: subject,
        text: body,
        color: severityColor(ev),
      });
    } else if (c.kind === "discord") {
      await sendDiscord(cfg as unknown as DiscordConfig, {
        title: subject,
        text: body,
        color: severityColor(ev),
      });
    } else if (c.kind === "teams") {
      await sendTeams(cfg as unknown as TeamsConfig, {
        title: subject,
        text: body,
        color: severityColor(ev),
      });
    } else if (c.kind === "pagerduty") {
      await sendPagerDuty(cfg as unknown as PagerDutyConfig, {
        action: ev.kind === "resolved" ? "resolve" : "trigger",
        dedupKey: incidentDedupKey(ev),
        summary: subject,
        severity: ev.severity === "critical" ? "critical" : "warning",
        source: ev.monitor.name,
      });
    } else if (c.kind === "opsgenie") {
      await sendOpsgenie(cfg as unknown as OpsgenieConfig, {
        action: ev.kind === "resolved" ? "resolve" : "trigger",
        alias: incidentDedupKey(ev),
        message: subject,
        priority: ev.severity === "critical" ? "P1" : "P3",
        source: ev.monitor.name,
      });
    }
  };
  try {
    // Retry transient failures (network/timeout/429/5xx); permanent 4xx stops
    // immediately. Callers run channels in parallel, so one channel's backoff
    // never delays the others.
    await withRetry(send, {
      onRetry: (err, attempt, delayMs) =>
        console.warn(
          `notifier ${label} attempt ${attempt} failed, retry in ${delayMs}ms: ${(err as Error).message}`,
        ),
    });
  } catch (err) {
    console.error(`notifier ${label} gave up after retries:`, err);
  }
}

export async function dispatch(ev: Event): Promise<void> {
  const channels = await loadEnabledChannels();
  if (channels.length === 0) return;
  const routesByChannel = await loadRoutesByChannel(channels.map((c) => c.id));
  const routeEvent = {
    monitorId: ev.monitor.id,
    group: ev.monitor.group,
    severity: ev.severity,
    alertKind: ev.alertKind,
  };
  const msg = buildMessage(ev);
  await Promise.allSettled(
    channels
      // routing (P2): a channel with no rules fires for everything
      .filter((c) => channelShouldFire(routesByChannel.get(c.id) ?? [], routeEvent))
      .map((c) => deliver(c, ev, msg)),
  );
}

/**
 * Deliver an event to a single channel by id, bypassing routing rules. Used by
 * escalation (P4), where a step explicitly names the channel to page. Disabled
 * or missing channels are skipped.
 */
export async function dispatchToChannel(
  channelId: number,
  ev: Event,
): Promise<void> {
  const db = getDb();
  const [c] = await db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, channelId));
  if (!c || !c.enabled) return;
  await deliver(c, ev, buildMessage(ev));
}

/** Send a test message for a given kind + config (used before saving). */
export async function sendTestConfig(
  kind: string,
  cfg: Record<string, unknown>,
): Promise<void> {
  const subject = "[Vew APM] Test notification";
  const body = "This is a test message from your Vew APM instance.";
  if (kind === "webhook") {
    await sendWebhook(cfg as unknown as WebhookConfig, { kind: "test", message: body });
  } else if (kind === "email") {
    await sendEmail(cfg as unknown as EmailConfig, subject, body);
  } else if (kind === "telegram") {
    await sendTelegram(cfg as unknown as TelegramConfig, `*${subject}*\n\n${body}`);
  } else if (kind === "slack") {
    await sendSlack(cfg as unknown as SlackConfig, { title: subject, text: body });
  } else if (kind === "discord") {
    await sendDiscord(cfg as unknown as DiscordConfig, { title: subject, text: body });
  } else if (kind === "teams") {
    await sendTeams(cfg as unknown as TeamsConfig, { title: subject, text: body });
  } else if (kind === "pagerduty") {
    const pd = cfg as unknown as PagerDutyConfig;
    // trigger then resolve the same key so the test leaves no open alert
    await sendPagerDuty(pd, { action: "trigger", dedupKey: "apm-test", summary: body, severity: "info", source: "Vew APM" });
    await sendPagerDuty(pd, { action: "resolve", dedupKey: "apm-test", summary: body, severity: "info", source: "Vew APM" });
  } else if (kind === "opsgenie") {
    const og = cfg as unknown as OpsgenieConfig;
    await sendOpsgenie(og, { action: "trigger", alias: "apm-test", message: body, priority: "P5", source: "Vew APM" });
    await sendOpsgenie(og, { action: "resolve", alias: "apm-test", message: body, priority: "P5", source: "Vew APM" });
  } else {
    throw new Error(`unknown channel kind: ${kind}`);
  }
}

export async function sendTest(channelId: number): Promise<void> {
  const db = getDb();
  const [c] = await db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, channelId));
  if (!c) throw new Error("channel not found");
  await sendTestConfig(c.kind, decryptSecret<Record<string, unknown>>(c.config));
}
