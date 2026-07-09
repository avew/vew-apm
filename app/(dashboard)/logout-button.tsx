"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { useT } from "@/lib/i18n-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        })
      }
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
      title="Sign out"
    >
      <LogOut className="w-4 h-4" />
      <span className="hidden sm:inline">{t("signOut")}</span>
    </button>
  );
}
