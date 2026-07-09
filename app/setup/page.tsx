import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 card p-7">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xl font-bold">
            V
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight leading-none">
              Create admin
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              First-time setup.
            </p>
          </div>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
