"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LayoutGrid, Siren } from "lucide-react";
import { useT } from "@/lib/i18n-client";
import type { MsgKey } from "@/lib/i18n";

const LINKS: {
  href: string;
  key: MsgKey;
  icon: typeof LayoutGrid;
  exact: boolean;
  badge?: boolean;
}[] = [
  { href: "/", key: "navMonitors", icon: LayoutGrid, exact: true },
  { href: "/incidents", key: "navIncidents", icon: Siren, exact: false, badge: true },
  { href: "/settings", key: "navSettings", icon: Settings, exact: false },
];

export function Nav({ ongoingCount = 0 }: { ongoingCount?: number }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, key, icon: Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              active
                ? "bg-black/[0.06] text-[var(--foreground)] dark:bg-white/[0.08]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t(key)}</span>
            {badge && ongoingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none tabular-nums">
                {ongoingCount > 99 ? "99+" : ongoingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
