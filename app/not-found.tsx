import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold tracking-tight">404</p>
      <p className="text-[var(--muted)]">This page could not be found.</p>
      <Link href="/" className="btn btn-primary">
        Back to dashboard
      </Link>
    </main>
  );
}
