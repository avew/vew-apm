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
): Promise<void> {
  const base = (config.serverUrl?.trim() || "https://api.telegram.org").replace(
    /\/+$/,
    "",
  );
  const res = await fetch(`${base}/bot${config.botToken}/sendMessage`, {
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
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`telegram ${res.status}: ${body}`);
  }
}
