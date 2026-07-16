import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

export interface TeamsConfig {
  /** Incoming-webhook / connector URL — treat as sensitive. */
  webhookUrl: string;
}

export interface TeamsMessage {
  text: string;
  title?: string;
  /** Theme color as a hex string (e.g. "#ef4444"); the leading # is stripped. */
  color?: string;
}

/**
 * Post to a Microsoft Teams incoming webhook using the MessageCard format
 * (the shape the connector accepts). Severity rides on `themeColor`.
 */
export async function sendTeams(
  config: TeamsConfig,
  message: TeamsMessage,
): Promise<void> {
  const title = message.title ?? "Vew APM";
  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    ...(message.color ? { themeColor: message.color.replace(/^#/, "") } : {}),
    summary: title,
    sections: [
      {
        activityTitle: title,
        text: message.text,
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
    throw new NotifyError(`teams failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NotifyError(`teams ${res.status}: ${body}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
