/**
 * Retry with exponential backoff for notification delivery.
 *
 * Notifier failures split in two: transient (network blip, timeout, 429, 5xx)
 * which are worth retrying, and permanent (4xx — bad token/URL/recipient) which
 * are not. Channel senders throw `NotifyError` carrying that verdict; anything
 * else (a raw network error) is treated as retryable.
 */

export class NotifyError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    opts: { retryable: boolean; status?: number } = { retryable: true },
  ) {
    super(message);
    this.name = "NotifyError";
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

/** HTTP status classification: 429 + 5xx are transient, other 4xx are permanent. */
export function httpRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface RetryOptions {
  /** Extra attempts after the first (default 2 → 3 total). */
  retries?: number;
  /** First backoff delay in ms (default 500). */
  baseMs?: number;
  /** Growth factor per attempt (default 3 → 500, 1500, ...). */
  factor?: number;
  /** Upper bound for a single delay (default 10000). */
  maxMs?: number;
  /** Randomize each delay to 50–100% of its value (default true). */
  jitter?: boolean;
  /** Called before each retry sleep. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on retryable failures with exponential backoff.
 * Stops early on a non-retryable `NotifyError`; rethrows the last error when
 * attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 500;
  const factor = opts.factor ?? 3;
  const maxMs = opts.maxMs ?? 10_000;
  const jitter = opts.jitter ?? true;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof NotifyError ? err.retryable : true;
      if (!retryable || attempt === retries) break;
      let delay = Math.min(maxMs, baseMs * factor ** attempt);
      if (jitter) delay = Math.round(delay * (0.5 + Math.random() * 0.5));
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
