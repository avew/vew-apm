import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";
import { encryptSecret, isEncrypted } from "./crypto";

/**
 * One-shot, idempotent: encrypt any notification_channels.config still stored
 * in plaintext (rows created before encryption-at-rest). Runs at boot; once all
 * rows are encrypted subsequent boots find nothing to do. Safe to call anytime.
 */
export async function encryptPlaintextChannels(): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(schema.notificationChannels);
  let migrated = 0;
  for (const row of rows) {
    if (isEncrypted(row.config)) continue;
    await db
      .update(schema.notificationChannels)
      .set({ config: encryptSecret(row.config) as unknown as object })
      .where(eq(schema.notificationChannels.id, row.id));
    migrated++;
  }
  if (migrated > 0) {
    console.log(`[secrets] encrypted ${migrated} plaintext channel secret(s)`);
  }
  return migrated;
}
