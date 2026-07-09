import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
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
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14 gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--color-brand-600)] text-white shadow-sm">
              <Activity className="w-4.5 h-4.5" />
            </span>
            <span className="tracking-tight">
              APM
              <span className="ml-1.5 text-[var(--muted)] font-normal hidden md:inline">
                actuator monitor
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
    </div>
  );
}
