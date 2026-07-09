import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./auth";

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("unauthorized");
  return u;
}
