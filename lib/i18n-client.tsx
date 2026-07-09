"use client";
import { createContext, useContext } from "react";
import { t, type Lang, type MsgKey } from "./i18n";

const LangContext = createContext<Lang>("en");

export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Client-side translator; lang comes from the nearest LangProvider. */
export function useT(): (key: MsgKey) => string {
  const lang = useContext(LangContext);
  return (key: MsgKey) => t(lang, key);
}
