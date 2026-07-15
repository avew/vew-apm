import { NotifyError, httpRetryable } from "../retry";
import { buildAuthHeaders } from "../auth-header";

const TIMEOUT_MS = 10_000;

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  // optional request auth (same shape as monitor auth)
  authType?: string | null;
  authUsername?: string | null;
  authHeaderName?: string | null;
  authHeaderValue?: string | null;
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: unknown,
): Promise<void> {
  const authHeaders = buildAuthHeaders({
    authType: config.authType ?? "none",
    authUsername: config.authUsername ?? null,
    authHeaderName: config.authHeaderName ?? null,
    authHeaderValue: config.authHeaderValue ?? null,
  });
  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders,
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // network error / timeout / abort — transient, retry
    throw new NotifyError(`webhook ${config.url} failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    throw new NotifyError(`webhook ${config.url} → ${res.status}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
