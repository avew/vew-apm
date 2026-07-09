import { getDb, schema } from "@/lib/db/client";
import { eq, and, inArray } from "drizzle-orm";
import { sendWebhook } from "./notifiers/webhook";
import { sendEmail } from "./notifiers/email";
import { sendTelegram } from "./notifiers/telegram";
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
      subject: `[APM][${sev}] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
      body: `🔴 *${ev.monitor.name}* alert: *${ev.alertKind}* (${ev.severity})\nURL: ${ev.monitor.url}\nScope: ${scope}\n${ev.reason ? `Detail: ${ev.reason}\n` : ""}Started: ${ev.startedAt.toISOString()}`,
    };
  }
  return {
    subject: `[APM][RESOLVED] ${ev.alertKind} — ${ev.monitor.name} (${scope})`,
    body: `✅ *${ev.monitor.name}* recovered: *${ev.alertKind}*\nURL: ${ev.monitor.url}\nScope: ${scope}\nStarted: ${ev.startedAt.toISOString()}\nEnded:   ${ev.endedAt.toISOString()}\nDuration: ${Math.round((ev.endedAt.getTime() - ev.startedAt.getTime()) / 1000)}s`,
  };
}

async function loadChannelsForMonitor(monitorId: number) {
  const db = getDb();
  const links = await db
    .select({ channelId: schema.monitorChannels.channelId })
    .from(schema.monitorChannels)
    .where(eq(schema.monitorChannels.monitorId, monitorId));
  if (links.length > 0) {
    return db
      .select()
      .from(schema.notificationChannels)
      .where(
        and(
          eq(schema.notificationChannels.enabled, true),
          inArray(
            schema.notificationChannels.id,
            links.map((l) => l.channelId),
          ),
        ),
      );
  }
  return db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.enabled, true));
}

export async function dispatch(ev: Event): Promise<void> {
  const channels = await loadChannelsForMonitor(ev.monitor.id);
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
      try {
        if (c.kind === "webhook") {
          await sendWebhook(cfg as { url: string; headers?: Record<string, string> }, payload);
        } else if (c.kind === "email") {
          await sendEmail(cfg as { from: string; to: string[] }, subject, body);
        } else if (c.kind === "telegram") {
          await sendTelegram(
            cfg as { botToken: string; chatId: string | number },
            `*${subject}*\n\n${body}`,
          );
        }
      } catch (err) {
        console.error(`notifier ${c.kind}#${c.id} failed:`, err);
      }
    }),
  );
}

export async function sendTest(channelId: number): Promise<void> {
  const db = getDb();
  const [c] = await db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, channelId));
  if (!c) throw new Error("channel not found");
  const cfg = c.config as Record<string, unknown>;
  const subject = "[APM] Test notification";
  const body = "This is a test message from your APM instance.";
  if (c.kind === "webhook") {
    await sendWebhook(cfg as { url: string; headers?: Record<string, string> }, {
      kind: "test",
      message: body,
    });
  } else if (c.kind === "email") {
    await sendEmail(cfg as { from: string; to: string[] }, subject, body);
  } else if (c.kind === "telegram") {
    await sendTelegram(
      cfg as { botToken: string; chatId: string | number },
      `*${subject}*\n\n${body}`,
    );
  } else {
    throw new Error(`unknown channel kind: ${c.kind}`);
  }
}
