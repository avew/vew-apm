import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { readBodyCapped } from "@/lib/checker";
import { buildAuthHeaders } from "@/lib/auth-header";

const Body = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  authType: z.string().optional(),
  authUsername: z.string().optional(),
  authHeaderName: z.string().optional(),
  authHeaderValue: z.string().optional(),
});

// Fetch a monitor URL server-side once, so the create/edit form can preview the
// response (status + body) and the operator can see JSON paths. Admin-only.
export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { url, method } = parse.data;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...buildAuthHeaders({
      authType: parse.data.authType ?? "none",
      authUsername: parse.data.authUsername ?? null,
      authHeaderName: parse.data.authHeaderName ?? null,
      authHeaderValue: parse.data.authHeaderValue ?? null,
    }),
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const { text, tooLarge } = await readBodyCapped(res);
    let preview = text ?? "";
    if (text && !tooLarge) {
      try {
        preview = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON — show raw */
      }
    }
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      body: tooLarge ? "(response too large)" : preview.slice(0, 20000),
    });
  } catch (e) {
    return NextResponse.json({ fetchError: (e as Error).message });
  }
}
