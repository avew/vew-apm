import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import { desc } from "drizzle-orm";

const WebhookConfig = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  authType: z.enum(["none", "basic", "header", "bearer"]).optional(),
  authUsername: z.string().max(200).optional(),
  authHeaderName: z.string().max(120).optional(),
  authHeaderValue: z.string().max(2000).optional(),
});
const EmailConfig = z.object({
  apiKey: z.string().min(1),
  from: z.string().min(1),
  to: z.array(z.string().email()).min(1),
});
const TelegramConfig = z.object({
  botToken: z.string().min(1),
  chatId: z.union([z.string().min(1), z.number()]),
  messageThreadId: z.union([z.string(), z.number()]).optional(),
  serverUrl: z.string().optional(),
  silent: z.boolean().optional(),
  protect: z.boolean().optional(),
  template: z.string().optional(),
});

const common = {
  name: z.string().min(1),
  enabled: z.boolean().default(true),
};

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("webhook"), ...common, config: WebhookConfig }),
  z.object({ kind: z.literal("email"), ...common, config: EmailConfig }),
  z.object({ kind: z.literal("telegram"), ...common, config: TelegramConfig }),
]);

export async function GET() {
  await requireUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.notificationChannels)
    .orderBy(desc(schema.notificationChannels.createdAt));
  return NextResponse.json({ channels: rows });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const db = getDb();
  const [row] = await db
    .insert(schema.notificationChannels)
    .values({
      name: parse.data.name,
      kind: parse.data.kind,
      enabled: parse.data.enabled,
      config: encryptSecret(parse.data.config) as unknown as object,
    })
    .returning();

  return NextResponse.json({ channel: row }, { status: 201 });
}
