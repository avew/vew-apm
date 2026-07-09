import { NextResponse } from "next/server";
import { z } from "zod";
import { changeCredentials, issueSession, SESSION_COOKIE } from "@/lib/auth";
import { requireUser } from "@/lib/session";

const Body = z.object({
  currentPassword: z.string().min(1),
  newUsername: z.string().min(1).max(64),
  newPassword: z.string().min(8).max(200).nullable(),
});

export async function PATCH(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  try {
    await changeCredentials(
      parse.data.currentPassword,
      parse.data.newUsername,
      parse.data.newPassword,
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const token = await issueSession(parse.data.newUsername);
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
