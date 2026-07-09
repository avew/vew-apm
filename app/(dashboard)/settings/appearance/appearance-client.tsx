"use client";
import { useEffect, useState } from "react";
import { LANGS, MESSAGES, t, type Lang } from "@/lib/i18n";

type Theme = "light" | "dark" | "auto";
type Hb = "normal" | "compact" | "none";

const cls = "field-input !mt-1";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceClient({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>("auto");
  const [hb, setHb] = useState<Hb>("normal");
  const [savedFlash, setSavedFlash] = useState(false);

  // hydrate from localStorage on mount
  useEffect(() => {
    const l = (localStorage.getItem("apm.lang") as Lang) || "en";
    const th = (localStorage.getItem("apm.theme") as Theme) || "auto";
    const h = (localStorage.getItem("apm.heartbeat") as Hb) || "normal";
    if (MESSAGES[l]) setLang(l);
    setTheme(th);
    setHb(h);
  }, []);

  function applyTheme(v: Theme) {
    setTheme(v);
    localStorage.setItem("apm.theme", v);
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    flash();
  }
  function applyHb(v: Hb) {
    setHb(v);
    localStorage.setItem("apm.heartbeat", v);
    document.documentElement.setAttribute("data-hb", v);
    flash();
  }
  function applyLang(v: Lang) {
    setLang(v);
    localStorage.setItem("apm.lang", v);
    document.documentElement.lang = v;
    document.cookie = `apm_lang=${v};path=/;max-age=31536000`;
    flash();
  }
  function flash() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  const tr = (k: keyof (typeof MESSAGES)["en"]) => t(lang, k);

  return (
    <div className="card overflow-hidden">
      <div className="bg-black/5 dark:bg-white/5 px-5 py-3 flex items-center justify-between">
        <h2 className="font-semibold">{tr("appearance")}</h2>
        {savedFlash && (
          <span className="text-xs text-emerald-600">{tr("saved")}</span>
        )}
      </div>
      <div className="p-5 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">{tr("language")}</label>
          <select
            className={cls}
            value={lang}
            onChange={(e) => applyLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted)] mt-1">{tr("languageHint")}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{tr("theme")}</label>
          <Segmented<Theme>
            value={theme}
            onChange={applyTheme}
            options={[
              { value: "light", label: tr("light") },
              { value: "dark", label: tr("dark") },
              { value: "auto", label: tr("auto") },
            ]}
          />
          <p className="text-xs text-[var(--muted)] mt-2">{tr("themeHint")}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            {tr("heartbeatBar")}
          </label>
          <Segmented<Hb>
            value={hb}
            onChange={applyHb}
            options={[
              { value: "normal", label: tr("hbNormal") },
              { value: "compact", label: tr("hbCompact") },
              { value: "none", label: tr("hbNone") },
            ]}
          />
          <p className="text-xs text-[var(--muted)] mt-2">{tr("heartbeatHint")}</p>
        </div>
      </div>
    </div>
  );
}
