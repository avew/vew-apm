import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { sendWebhook } from "./notifiers/webhook";
import { sendEmail, type EmailConfig } from "./notifiers/email";
import { sendTelegram, type TelegramConfig } from "./notifiers/telegram";
import { withRetry } from "./retry";
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
    return {
      subject: `[Vew APM][${sev}] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
      body: `🔴 *${ev.monitor.name}* alert: *${ev.alertKind}* (${ev.severity})\nURL: ${ev.monitor.url}\nScope: ${scope}\n${ev.reason ? `Detail: ${ev.reason}\n` : ""}Started: ${ev.startedAt.toISOString()}`,
    };
  }
  return {
    subject: `[Vew APM][RESOLVED] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
    body: `✅ *${ev.monitor.name}* recovered: *${ev.alertKind}*\nURL: ${ev.monitor.url}\nScope: ${scope}\nStarted: ${ev.startedAt.toISOString()}\nEnded:   ${ev.endedAt.toISOString()}\nDuration: ${Math.round((ev.endedAt.getTime() - ev.startedAt.getTime()) / 1000)}s`,
  };
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
    startedAt: ev.startedAt.toISOString(),
    endedAt: ev.kind === "resolved" ? ev.endedAt.toISOString() : null,
  };

  await Promise.allSettled(
    channels.map(async (c) => {
      const cfg = c.config as Record<string, unknown>;
      const label = `${c.kind}#${c.id}`;
      const send = async () => {
        if (c.kind === "webhook") {
          await sendWebhook(cfg as { url: string; headers?: Record<string, string> }, payload);
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
    await sendWebhook(
      cfg as { url: string; headers?: Record<string, string> },
      { kind: "test", message: body },
    );
  } else if (kind === "email") {
    await sendEmail(cfg as unknown as EmailConfig, subject, body);
  } else if (kind === "telegram") {
    await sendTelegram(cfg as unknown as TelegramConfig, `*${subject}*\n\n${body}`);
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
  await sendTestConfig(c.kind, c.config as Record<string, unknown>);
}
