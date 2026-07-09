"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, SlidersHorizontal, Bell, Wrench, Palette } from "lucide-react";

const TABS = [
  { href: "/settings", label: "General", icon: User, exact: true },
  { href: "/settings/appearance", label: "Appearance", icon: Palette },
  { href: "/settings/alerts", label: "Alerts", icon: SlidersHorizontal },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/maintenance", label: "Maintenance", icon: Wrench },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-3">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] dark:bg-[rgb(79_107_237/0.15)] dark:text-[#8ea2ff]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
