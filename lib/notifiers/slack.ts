import { createHmac, timingSafeEqual } from "node:crypto";
import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

/**
 * Verify a Slack interactivity request signature (A3). Slack signs each request
 * with the app signing secret: `v0=HMAC_SHA256(signingSecret, "v0:ts:body")`.
 * Rejects requests older than 5 minutes (replay protection). `nowSec` is
 * injectable for tests.
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const expected =
    "v0=" +
    createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface SlackConfig {
  /** Incoming-webhook URL — carries the secret token, treat as sensitive. */
  webhookUrl: string;
  /** Optional override of the display name (legacy/custom webhooks only). */
  username?: string;
  /** Optional emoji shortcode, e.g. ":rotating_light:". */
  iconEmoji?: string;
}

export interface SlackMessage {
  text: string;
  title?: string;
  /** Attachment bar color (hex or Slack keyword: good/warning/danger). */
  color?: string;
  /** When set, render an "Acknowledge" button carrying this incident id (A3). */
  ackIncidentId?: number;
}

/**
 * Post a message to a Slack incoming webhook. The severity color rides on an
 * attachment bar; `text` is rendered as Slack mrkdwn (the same `*bold*` /
 * backtick markup the other channels already use).
 */
export async function sendSlack(
  config: SlackConfig,
  message: SlackMessage,
): Promise<void> {
  const payload = {
    ...(config.username ? { username: config.username } : {}),
    ...(config.iconEmoji ? { icon_emoji: config.iconEmoji } : {}),
    ...(message.ackIncidentId != null
      ? {
          blocks: [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Acknowledge" },
                  value: String(message.ackIncidentId),
                  action_id: "ack_incident",
                },
              ],
            },
          ],
        }
      : {}),
    attachments: [
      {
        color: message.color ?? "#2b6cb0",
        fallback: message.title ?? message.text,
        ...(message.title ? { title: message.title } : {}),
        text: message.text,
        mrkdwn_in: ["text"],
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // network error / timeout / abort — transient, retry
    throw new NotifyError(`slack failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NotifyError(`slack ${res.status}: ${body}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
