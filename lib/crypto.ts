/**
 * Encryption-at-rest for channel secrets (Telegram token, Resend key, …).
 *
 * Values are AES-256-GCM encrypted before they hit SQLite and decrypted on read,
 * so a leaked `apm.db` (stray backup, volume snapshot) doesn't spill tokens.
 * Format: `enc:v1:<iv>:<tag>:<ciphertext>` (each base64). Legacy plaintext rows
 * are detected by the missing prefix and passed through unchanged, so this is
 * backward compatible.
 *
 * Key: `ENCRYPTION_KEY` env if set (any string, hashed to 32 bytes), else a
 * random key generated once and persisted next to the DB as `.secret_key`
 * (mode 600). It is deliberately NOT `SESSION_SECRET` — rotating that to expire
 * sessions would otherwise make every stored secret undecryptable.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PREFIX = "enc:v1:";
const KEY_CACHE = Symbol.for("vew-apm.crypto.key");

function dataDir(): string {
  const raw = process.env.DATABASE_URL ?? "./data/apm.db";
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.dirname(path.resolve(stripped));
}

function loadKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length > 0) {
    // Accept any-length secret; derive a fixed 32-byte key from it.
    return createHash("sha256").update(envKey, "utf8").digest();
  }
  const file = path.join(dataDir(), ".secret_key");
  if (existsSync(file)) {
    const hex = readFileSync(file, "utf8").trim();
    if (hex) return Buffer.from(hex, "hex");
  }
  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}

function getKey(): Buffer {
  const g = globalThis as unknown as Record<symbol, Buffer | undefined>;
  return (g[KEY_CACHE] ??= loadKey());
}

/**
 * Sign a string with the instance key (HMAC-SHA256, base64url). Used for
 * unguessable action links (e.g. incident acknowledge) that must work without a
 * session — the link carries `signToken("ack:<id>")` and the handler re-signs to
 * verify. Reuses the same key resolution as the secret cipher.
 */
export function signToken(data: string): string {
  return createHmac("sha256", getKey()).update(data).digest("base64url");
}

/** Constant-time verification of a token produced by signToken. */
export function verifyToken(data: string, token: string): boolean {
  const expected = Buffer.from(signToken(data));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** True if a stored value is already ciphertext produced by encryptSecret. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a JSON-serializable value into an `enc:v1:...` string. */
export function encryptSecret(obj: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ct].map((b) => b.toString("base64")).join(":")
  );
}

/**
 * Decrypt a value produced by encryptSecret. Anything without the `enc:` prefix
 * (a legacy plaintext object, or a plain string) is returned unchanged.
 */
export function decryptSecret<T = unknown>(value: unknown): T {
  if (!isEncrypted(value)) return value as T;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("crypto: malformed ciphertext");
  const [ivB, tagB, ctB] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString("utf8")) as T;
}
