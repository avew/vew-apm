import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialAdmin, isSetupComplete, issueSession, SESSION_COOKIE } from "@/lib/auth";

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: "already initialised" }, { status: 409 });
  }
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  await createInitialAdmin(parse.data.username, parse.data.password);
  const token = await issueSession(parse.data.username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
