import { NextResponse } from "next/server";
import { z } from "zod";
import { login, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { retryAfterMs, recordFailure, reset } from "@/lib/rate-limit";

const Body = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function locked(res: number) {
  const secs = Math.ceil(res / 1000);
  const mins = Math.ceil(secs / 60);
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(secs) } },
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipKey = `ip:${ip}`;

  // IP lockout check (before parsing)
  const ipWait = retryAfterMs(ipKey);
  if (ipWait > 0) return locked(ipWait);

  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const userKey = `user:${parse.data.username.toLowerCase()}`;

  const userWait = retryAfterMs(userKey);
  if (userWait > 0) return locked(userWait);

  const token = await login(parse.data.username, parse.data.password);
  if (!token) {
    recordFailure(ipKey);
    recordFailure(userKey);
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  reset(ipKey);
  reset(userKey);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
}
