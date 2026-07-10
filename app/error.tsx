"use client";
import Link from "next/link";

// Route-segment error boundary. The raw error message is intentionally not shown
// (it may leak internals) — only the digest ref, which maps to the server logs.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-semibold tracking-tight">Something went wrong</p>
      <p className="text-[var(--muted)]">
        An unexpected error occurred. Try again — if it keeps happening, check the
        server logs.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-[var(--muted)]">ref: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
