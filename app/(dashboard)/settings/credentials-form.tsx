"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CredentialsForm({
  currentUsername,
}: {
  currentUsername: string;
}) {
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const cls = "field-input";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        if (newPassword && newPassword.length < 8) {
          setMsg({ type: "err", text: "New password too short (min 8)." });
          return;
        }
        start(async () => {
          const res = await fetch("/api/auth/password", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              currentPassword,
              newUsername,
              newPassword: newPassword || null,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setMsg({ type: "err", text: j.error ?? "Failed" });
            return;
          }
          setCurrentPassword("");
          setNewPassword("");
          setMsg({ type: "ok", text: "Credentials updated." });
          router.refresh();
        });
      }}
    >
      <label className="block text-sm">
        <span>New username</span>
        <input
          className={cls}
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span>New password (leave empty to keep current)</span>
        <input
          className={cls}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={0}
        />
      </label>
      <label className="block text-sm">
        <span>Current password</span>
        <input
          className={cls}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      {msg && (
        <p
          className={
            msg.type === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"
          }
        >
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
