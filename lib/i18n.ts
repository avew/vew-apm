export type Lang = "en" | "id" | "zh" | "ms";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "ms", label: "Bahasa Malaysia" },
];

type Dict = Record<string, string>;

// Starter dictionary — covers the Appearance settings surface. Extend per page
// as translation coverage grows.
export const MESSAGES: Record<Lang, Dict> = {
  en: {
    appearance: "Appearance",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    auto: "Auto",
    heartbeatBar: "Heartbeat Bar",
    hbNormal: "Normal",
    hbCompact: "Compact",
    hbNone: "None",
    heartbeatHint: "How the uptime bar on monitor cards is displayed.",
    themeHint: "Auto follows your operating system setting.",
    languageHint: "Applies to the interface where translations are available.",
    saved: "Saved",
  },
  id: {
    appearance: "Tampilan",
    language: "Bahasa",
    theme: "Tema",
    light: "Terang",
    dark: "Gelap",
    auto: "Otomatis",
    heartbeatBar: "Bar Heartbeat",
    hbNormal: "Normal",
    hbCompact: "Ringkas",
    hbNone: "Sembunyikan",
    heartbeatHint: "Cara bar uptime di kartu monitor ditampilkan.",
    themeHint: "Otomatis mengikuti pengaturan sistem operasi.",
    languageHint: "Berlaku pada antarmuka yang sudah diterjemahkan.",
    saved: "Tersimpan",
  },
  zh: {
    appearance: "外观",
    language: "语言",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    auto: "自动",
    heartbeatBar: "心跳条",
    hbNormal: "正常",
    hbCompact: "紧凑",
    hbNone: "隐藏",
    heartbeatHint: "监控卡片上正常运行时间条的显示方式。",
    themeHint: "自动跟随操作系统设置。",
    languageHint: "适用于已翻译的界面。",
    saved: "已保存",
  },
  ms: {
    appearance: "Penampilan",
    language: "Bahasa",
    theme: "Tema",
    light: "Cerah",
    dark: "Gelap",
    auto: "Automatik",
    heartbeatBar: "Bar Heartbeat",
    hbNormal: "Biasa",
    hbCompact: "Padat",
    hbNone: "Sembunyi",
    heartbeatHint: "Cara bar masa operasi pada kad monitor dipaparkan.",
    themeHint: "Automatik mengikut tetapan sistem pengendalian.",
    languageHint: "Digunakan pada antara muka yang telah diterjemahkan.",
    saved: "Disimpan",
  },
};

export function t(lang: Lang, key: keyof (typeof MESSAGES)["en"]): string {
  return MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key;
}
