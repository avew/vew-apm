import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getLang } from "@/lib/i18n-server";
import { LangProvider } from "@/lib/i18n-client";
import { LogoutButton } from "./logout-button";
import { Nav } from "./nav";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";

async function ongoingIncidentCount(): Promise<number> {
  try {
    const db = getDb();
    const rows = await db
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(eq(schema.incidents.resolved, false));
    return rows.length;
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ongoing = await ongoingIncidentCount();
  const lang = await getLang();
  return (
    <LangProvider lang={lang}>
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14 gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--foreground)] text-[var(--background)]">
              <Activity className="w-4.5 h-4.5" />
            </span>
            <span className="tracking-tight">
              Vew APM
              <span className="ml-1.5 text-[var(--muted)] font-normal hidden md:inline">
                - Trust ur monitor
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Nav ongoingCount={ongoing} />
            <div className="w-px h-6 bg-[var(--border)] hidden sm:block" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-1 text-xs text-[var(--muted)]">
          <span>Crafted with</span>
          <span className="text-red-500" aria-label="love">♥</span>
          <span>in Bandung by</span>
          <a
            href="https://saweria.co/asepthon"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-brand-600)] hover:underline"
          >
            avew
          </a>
          <span className="mx-1">·</span>
          <span>2026</span>
        </div>
      </footer>
    </div>
    </LangProvider>
  );
}
