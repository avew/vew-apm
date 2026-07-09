export async function sendWebhook(
  config: { url: string; headers?: Record<string, string> },
  payload: unknown,
): Promise<void> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.headers ?? {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`webhook ${config.url} → ${res.status}`);
  }
}
