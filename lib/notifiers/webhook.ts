import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

export async function sendWebhook(
  config: { url: string; headers?: Record<string, string> },
  payload: unknown,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
