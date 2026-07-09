"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setError(j.error ?? "Login failed");
            return;
          }
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-neutral-700 dark:text-neutral-300">Username</span>
        <input
          className="field-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-700 dark:text-neutral-300">Password</span>
        <input
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full justify-center py-2.5"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
