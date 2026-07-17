import { NotifyError, httpRetryable } from "../retry";

const TIMEOUT_MS = 10_000;

export interface TelegramConfig {
  botToken: string;
  chatId: string | number;
  messageThreadId?: string | number;
  serverUrl?: string;
  silent?: boolean;
  protect?: boolean;
}

export async function sendTelegram(
  config: TelegramConfig,
  text: string,
  opts: { ackIncidentId?: number } = {},
): Promise<void> {
  const base = (config.serverUrl?.trim() || "https://api.telegram.org").replace(
    /\/+$/,
    "",
  );
  let res: Response;
  try {
    res = await fetch(`${base}/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        disable_notification: config.silent ?? false,
        protect_content: config.protect ?? false,
        ...(config.messageThreadId
          ? { message_thread_id: Number(config.messageThreadId) }
          : {}),
        ...(opts.ackIncidentId != null
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Acknowledge",
                      callback_data: `ack:${opts.ackIncidentId}`,
                    },
                  ],
                ],
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new NotifyError(`telegram failed: ${(err as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new NotifyError(`telegram ${res.status}: ${body}`, {
      retryable: httpRetryable(res.status),
      status: res.status,
    });
  }
}
