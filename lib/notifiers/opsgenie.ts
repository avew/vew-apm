import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

export interface OpsgenieConfig {
  /** Opsgenie API key (GenieKey) — treat as sensitive. */
  apiKey: string;
  /** API region: "us" (default) or "eu". */
  region?: "us" | "eu";
}

export interface OpsgenieEvent {
  action: "trigger" | "resolve";
  /** Alert alias — stable per incident so resolve closes the right alert. */
  alias: string;
  message: string;
  priority: "P1" | "P2" | "P3" | "P4" | "P5";
  source: string;
}

function baseUrl(region?: string): string {
  return region === "eu"
    ? "https://api.eu.opsgenie.com"
    : "https://api.opsgenie.com";
}

/**
 * Send an Opsgenie alert action. Trigger creates an alert keyed by `alias`;
 * resolve closes it by alias. The incident id is the alias, so repeated down
 * notifications collapse into one Opsgenie alert.
 */
export async function sendOpsgenie(
  config: OpsgenieConfig,
  ev: OpsgenieEvent,
): Promise<void> {
  const base = baseUrl(config.region);
  const url =
    ev.action === "trigger"
      ? `${base}/v2/alerts`
      : `${base}/v2/alerts/${encodeURIComponent(ev.alias)}/close?identifierType=alias`;
  const body =
    ev.action === "trigger"
      ? {
          message: ev.message.slice(0, 130),
          alias: ev.alias,
          priority: ev.priority,
          source: ev.source,
        }
      : { source: ev.source };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `GenieKey ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new NotifyError(`opsgenie failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new NotifyError(`opsgenie ${res.status}: ${text}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
