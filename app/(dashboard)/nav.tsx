"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LayoutGrid, Siren } from "lucide-react";

const LINKS = [
  { href: "/", label: "Monitors", icon: LayoutGrid, exact: true },
  { href: "/incidents", label: "Incidents", icon: Siren, badge: true },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
];

export function Nav({ ongoingCount = 0 }: { ongoingCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label, icon: Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              active
                ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] dark:bg-[rgb(79_107_237/0.15)] dark:text-[#8ea2ff]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
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
