import { NextResponse } from "next/server";
import { acknowledgeIncident } from "@/lib/ack";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  callback_query?: {
    data?: string;
    from?: { username?: string; first_name?: string };
  };
};

/**
 * Telegram webhook endpoint (A3). Receives the "Acknowledge" inline-button
 * callback and acks the incident. Public — authenticated by the secret token
 * Telegram echoes in X-Telegram-Bot-Api-Secret-Token (set at setWebhook time).
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const data = update?.callback_query?.data;
  if (data && data.startsWith("ack:")) {
    const incidentId = Number(data.slice(4));
    if (Number.isInteger(incidentId)) {
      const user =
        update?.callback_query?.from?.username ||
        update?.callback_query?.from?.first_name ||
        "telegram";
      await acknowledgeIncident(incidentId, `telegram:${user}`);
    }
  }
  // Telegram only needs a 200 to consider the update handled.
  return NextResponse.json({ ok: true });
}
