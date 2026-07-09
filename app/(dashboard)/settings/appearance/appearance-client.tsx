"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGS, t, type Lang } from "@/lib/i18n";

type Theme = "light" | "dark" | "auto";
type Hb = "normal" | "compact" | "none";

interface Prefs {
  lang: Lang;
  theme: Theme;
  hb: Hb;
}

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
  const router = useRouter();
  const [saved, setSaved] = useState<Prefs>({
    lang: initialLang,
    theme: "auto",
    hb: "normal",
  });
  const [draft, setDraft] = useState<Prefs>(saved);
  const [flash, setFlash] = useState(false);

  // hydrate committed prefs from storage on mount
  useEffect(() => {
    const p: Prefs = {
      lang: ((localStorage.getItem("apm.lang") as Lang) || initialLang) as Lang,
      theme: (localStorage.getItem("apm.theme") as Theme) || "auto",
      hb: (localStorage.getItem("apm.heartbeat") as Hb) || "normal",
    };
    setSaved(p);
    setDraft(p);
  }, [initialLang]);

  const dirty =
    draft.lang !== saved.lang ||
    draft.theme !== saved.theme ||
    draft.hb !== saved.hb;

  // labels follow the COMMITTED language (change only after Save)
  const tr = (k: Parameters<typeof t>[1]) => t(saved.lang, k);

  function applyDom(p: Prefs) {
    if (p.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", p.theme);
    document.documentElement.setAttribute("data-hb", p.hb);
    document.documentElement.lang = p.lang;
  }

  function onSave() {
    localStorage.setItem("apm.theme", draft.theme);
    localStorage.setItem("apm.heartbeat", draft.hb);
    localStorage.setItem("apm.lang", draft.lang);
    document.cookie = `apm_lang=${draft.lang};path=/;max-age=31536000`;
    applyDom(draft);
    setSaved(draft);
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    router.refresh();
  }

  function onCancel() {
    setDraft(saved);
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-black/5 dark:bg-white/5 px-5 py-3 flex items-center justify-between">
        <h2 className="font-semibold">{tr("appearance")}</h2>
        {flash && <span className="text-xs text-emerald-600">{tr("saved")}</span>}
      </div>
      <div className="p-5 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">{tr("language")}</label>
          <select
            className={cls}
            value={draft.lang}
            onChange={(e) => setDraft({ ...draft, lang: e.target.value as Lang })}
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
            value={draft.theme}
            onChange={(v) => setDraft({ ...draft, theme: v })}
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
            value={draft.hb}
            onChange={(v) => setDraft({ ...draft, hb: v })}
            options={[
              { value: "normal", label: tr("hbNormal") },
              { value: "compact", label: tr("hbCompact") },
              { value: "none", label: tr("hbNone") },
            ]}
          />
          <p className="text-xs text-[var(--muted)] mt-2">{tr("heartbeatHint")}</p>
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-end gap-2">
        {dirty && (
          <span className="text-xs text-[var(--muted)] mr-auto">
            Unsaved changes
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={!dirty}
          className="btn btn-ghost"
        >
          {tr("cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          className="btn btn-primary"
        >
          {tr("save")}
        </button>
      </div>
    </div>
  );
}
