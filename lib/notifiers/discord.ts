import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

export interface DiscordConfig {
  /** Webhook URL — carries the secret token, treat as sensitive. */
  webhookUrl: string;
  /** Optional override of the display name. */
  username?: string;
}

export interface DiscordMessage {
  text: string;
  title?: string;
  /** Embed color as a hex string (e.g. "#ef4444"); converted to Discord's int. */
  color?: string;
}

/** Discord embed colors are 0xRRGGBB integers, not hex strings. */
function hexToInt(hex?: string): number | undefined {
  if (!hex) return undefined;
  const n = Number.parseInt(hex.replace(/^#/, ""), 16);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Post to a Discord channel webhook as an embed. Severity rides on the embed
 * color bar; the message body goes in the embed description.
 */
export async function sendDiscord(
  config: DiscordConfig,
  message: DiscordMessage,
): Promise<void> {
  const color = hexToInt(message.color);
  const payload = {
    ...(config.username ? { username: config.username } : {}),
    embeds: [
      {
        ...(message.title ? { title: message.title } : {}),
        description: message.text,
        ...(color !== undefined ? { color } : {}),
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
    throw new NotifyError(`discord failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NotifyError(`discord ${res.status}: ${body}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
