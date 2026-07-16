import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

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
