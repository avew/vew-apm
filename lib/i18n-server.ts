import { cookies } from "next/headers";
import { MESSAGES, t, type Lang, type MsgKey } from "./i18n";

export async function getLang(): Promise<Lang> {
  const jar = await cookies();
  const v = jar.get("apm_lang")?.value;
  return v && v in MESSAGES ? (v as Lang) : "en";
}

/** Server-side translator bound to the request's locale cookie. */
export async function getT(): Promise<(key: MsgKey) => string> {
  const lang = await getLang();
  return (key: MsgKey) => t(lang, key);
}
