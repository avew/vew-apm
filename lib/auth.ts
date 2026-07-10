import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "apm_session";
const ISSUER = "apm";
const AUDIENCE = "apm-admin";

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  }
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string;
  epoch: number;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(
  pw: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function loadAuthSettings() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.authSettings)
    .where(eq(schema.authSettings.id, 1));
  return row ?? null;
}

export async function isSetupComplete(): Promise<boolean> {
  return (await loadAuthSettings()) !== null;
}

export async function createInitialAdmin(
  username: string,
  password: string,
): Promise<void> {
  const db = getDb();
  const existing = await loadAuthSettings();
  if (existing) throw new Error("setup already complete");
  const passwordHash = await hashPassword(password);
  await db.insert(schema.authSettings).values({
    id: 1,
    username,
    passwordHash,
    sessionEpoch: 0,
  });
}

export async function changeCredentials(
  currentPassword: string,
  newUsername: string,
  newPassword: string | null,
): Promise<void> {
  const db = getDb();
  const row = await loadAuthSettings();
  if (!row) throw new Error("not initialised");
  const ok = await verifyPassword(currentPassword, row.passwordHash);
  if (!ok) throw new Error("current password incorrect");
  const passwordHash = newPassword
    ? await hashPassword(newPassword)
    : row.passwordHash;
  await db
    .update(schema.authSettings)
    .set({
      username: newUsername,
      passwordHash,
      sessionEpoch: row.sessionEpoch + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.authSettings.id, 1));
}

export async function issueSession(username: string): Promise<string> {
  const row = await loadAuthSettings();
  if (!row) throw new Error("not initialised");
  return await new SignJWT({ epoch: row.sessionEpoch })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const row = await loadAuthSettings();
    if (!row) return null;
    if ((payload.epoch as number) !== row.sessionEpoch) return null;
    if (payload.sub !== row.username) return null;
    return { sub: payload.sub as string, epoch: payload.epoch as number };
  } catch {
    return null;
  }
}

export async function verifySessionEdge(
  token: string | undefined,
): Promise<{ sub: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return { sub: payload.sub as string };
  } catch {
    return null;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<string | null> {
  const row = await loadAuthSettings();
  if (!row) return null;
  if (row.username !== username) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  return issueSession(username);
}

export const SESSION_COOKIE = COOKIE_NAME;

/**
 * Session cookie options. `Secure` is set only when the request is actually
 * served over HTTPS — directly, or via a reverse proxy that sets
 * `X-Forwarded-Proto: https`. Keying off the real protocol (not NODE_ENV) lets
 * a plain-HTTP self-hosted deploy (e.g. http://vps-ip:3000) still log in; a
 * Secure cookie would be dropped by the browser over HTTP.
 */
export function sessionCookieOptions(req: Request) {
  const xfp = req.headers.get("x-forwarded-proto");
  let https = false;
  if (xfp) {
    https = xfp.split(",")[0].trim() === "https";
  } else {
    try {
      https = new URL(req.url).protocol === "https:";
    } catch {
      https = false;
    }
  }
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
