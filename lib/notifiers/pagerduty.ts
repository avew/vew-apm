import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;
const ENQUEUE_URL = "https://events.pagerduty.com/v2/enqueue";

export interface PagerDutyConfig {
  /** Events API v2 integration/routing key — treat as sensitive. */
  routingKey: string;
}

export interface PagerDutyEvent {
  action: "trigger" | "resolve";
  /** Stable key so a resolve matches its trigger (PagerDuty dedups on it). */
  dedupKey: string;
  summary: string;
  severity: "critical" | "warning" | "error" | "info";
  source: string;
}

/**
 * Send a PagerDuty Events API v2 event. Trigger opens/updates an alert keyed by
 * dedupKey; resolve closes it. The incident id is the dedup key, so repeated
 * down notifications collapse into one PagerDuty alert.
 */
export async function sendPagerDuty(
  config: PagerDutyConfig,
  ev: PagerDutyEvent,
): Promise<void> {
  const body = {
    routing_key: config.routingKey,
    event_action: ev.action,
    dedup_key: ev.dedupKey,
    ...(ev.action === "trigger"
      ? {
          payload: {
            summary: ev.summary.slice(0, 1024),
            severity: ev.severity,
            source: ev.source,
          },
        }
      : {}),
  };

  let res: Response;
  try {
    res = await fetch(ENQUEUE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new NotifyError(`pagerduty failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new NotifyError(`pagerduty ${res.status}: ${text}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
