"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SetupForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (password.length < 8) return setError("Password too short (min 8).");
        if (password !== confirm) return setError("Passwords do not match.");
        start(async () => {
          const res = await fetch("/api/auth/setup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setError(j.error ?? "Setup failed");
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <label className="block text-sm">
        <span>Username</span>
        <input
          className="field-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span>Password</span>
        <input
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span>Confirm password</span>
        <input
          className="field-input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full justify-center py-2.5"
      >
        {pending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
