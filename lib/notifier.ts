import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { sendWebhook, type WebhookConfig } from "./notifiers/webhook";
import { sendEmail, type EmailConfig } from "./notifiers/email";
import { sendTelegram, type TelegramConfig } from "./notifiers/telegram";
import { sendSlack, type SlackConfig } from "./notifiers/slack";
import { sendDiscord, type DiscordConfig } from "./notifiers/discord";
import { sendTeams, type TeamsConfig } from "./notifiers/teams";
import { withRetry } from "./retry";
import { decryptSecret } from "./crypto";
import type { Monitor } from "@/lib/db/schema";
import type { Severity, AlertKind } from "./rules";

export type Event =
  | {
      kind: "down";
      monitor: Monitor;
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
    return {
      subject: `[Vew APM][${tag}] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
      body: `${icon} *${ev.monitor.name}* alert: *${ev.alertKind}* (${ev.severity})\nURL: ${ev.monitor.url}\nScope: ${scope}\n${ev.reason ? `Detail: ${ev.reason}\n` : ""}Started: ${ev.startedAt.toISOString()}${openedFor}`,
    };
  }
  return {
    subject: `[Vew APM][RESOLVED] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
    body: `✅ *${ev.monitor.name}* recovered: *${ev.alertKind}*\nURL: ${ev.monitor.url}\nScope: ${scope}\nStarted: ${ev.startedAt.toISOString()}\nEnded:   ${ev.endedAt.toISOString()}\nDuration: ${Math.round((ev.endedAt.getTime() - ev.startedAt.getTime()) / 1000)}s`,
  };
}

/** Chat-card accent color by event state: green resolved, red critical, amber warning. */
function severityColor(ev: Event): string {
  if (ev.kind === "resolved") return "#22c55e";
  return ev.severity === "critical" ? "#ef4444" : "#f59e0b";
}

/** Notifications are global: every enabled channel fires for every monitor. */
async function loadEnabledChannels() {
  const db = getDb();
  return db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.enabled, true));
}

export async function dispatch(ev: Event): Promise<void> {
  const channels = await loadEnabledChannels();
  if (channels.length === 0) return;
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
    startedAt: ev.startedAt.toISOString(),
    endedAt: ev.kind === "resolved" ? ev.endedAt.toISOString() : null,
  };

  await Promise.allSettled(
    channels.map(async (c) => {
      const cfg = decryptSecret<Record<string, unknown>>(c.config);
      const label = `${c.kind}#${c.id}`;
      const send = async () => {
        if (c.kind === "webhook") {
          await sendWebhook(cfg as unknown as WebhookConfig, payload);
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
        }
      };
      try {
        // Retry transient failures (network/timeout/429/5xx); permanent 4xx
        // stops immediately. Channels run in parallel, so one channel's backoff
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
    }),
  );
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
