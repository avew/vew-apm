import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/cron",
  "/api/fixture",
  "/api/health",
  "/api/metrics",
  "/status",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("apm_session")?.value;
  if (!token) return false;
  const s = process.env.SESSION_SECRET;
  if (!s) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(s), {
      issuer: "apm",
      audience: "apm-admin",
    });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }
  const ok = await isAuthenticated(req);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
