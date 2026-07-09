"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, SlidersHorizontal, Bell, Wrench, Palette } from "lucide-react";
import { useT } from "@/lib/i18n-client";
import type { MsgKey } from "@/lib/i18n";

const TABS: {
  href: string;
  key: MsgKey;
  icon: typeof User;
  exact?: boolean;
}[] = [
  { href: "/settings", key: "navGeneral", icon: User, exact: true },
  { href: "/settings/appearance", key: "appearance", icon: Palette },
  { href: "/settings/alerts", key: "navAlerts", icon: SlidersHorizontal },
  { href: "/settings/notifications", key: "navNotifications", icon: Bell },
  { href: "/settings/maintenance", key: "navMaintenance", icon: Wrench },
];

export function SettingsNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-3">
      {TABS.map(({ href, key, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-black/[0.06] text-[var(--foreground)] dark:bg-white/[0.08]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
