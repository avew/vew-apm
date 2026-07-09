export async function sendTelegram(
  config: { botToken: string; chatId: string | number },
  text: string,
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`telegram ${res.status}: ${body}`);
  }
}
