"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationChannel } from "@/lib/db/schema";
import { Send, Trash2 } from "lucide-react";

type Kind = "webhook" | "email" | "telegram";

const cls = "field-input";

export function ChannelsClient({
  initial,
}: {
  initial: NotificationChannel[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="font-medium mb-2">Add channel</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            let config: Record<string, unknown>;
            if (kind === "webhook") {
              config = { url };
            } else if (kind === "email") {
              config = {
                from: emailFrom,
                to: emailTo.split(",").map((s) => s.trim()).filter(Boolean),
              };
            } else {
              const asNumber = Number(chatId);
              config = {
                botToken,
                chatId: Number.isFinite(asNumber) && chatId.trim() !== "" ? asNumber : chatId,
              };
            }
            start(async () => {
              const res = await fetch("/api/notifications", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind, name, config, enabled: true }),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                setError(j.error ?? "Failed");
                return;
              }
              setName("");
              setUrl("");
              setEmailFrom("");
              setEmailTo("");
              setBotToken("");
              setChatId("");
              router.refresh();
            });
          }}
        >
          <label className="block text-sm">
            <span>Kind</span>
            <select
              className={cls}
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="webhook">Webhook</option>
              <option value="email">Email (Resend)</option>
              <option value="telegram">Telegram</option>
            </select>
          </label>
          <label className="block text-sm">
            <span>Name</span>
            <input
              className={cls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {kind === "webhook" && (
            <label className="block text-sm">
              <span>URL</span>
              <input
                className={cls}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://webhook.example.com/hook"
              />
            </label>
          )}
          {kind === "email" && (
            <>
              <label className="block text-sm">
                <span>From</span>
                <input
                  className={cls}
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="alerts@yourdomain.com"
                  required
                />
              </label>
              <label className="block text-sm">
                <span>To (comma-separated)</span>
                <input
                  className={cls}
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="ops@company.com, oncall@company.com"
                  required
                />
              </label>
              <p className="text-xs text-neutral-500">
                Uses <code>RESEND_API_KEY</code> from env.
              </p>
            </>
          )}
          {kind === "telegram" && (
            <>
              <label className="block text-sm">
                <span>Bot token</span>
                <input
                  className={cls}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span>Chat ID</span>
                <input
                  className={cls}
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                  required
                />
              </label>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Adding…" : "Add channel"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="font-medium mb-2">Existing channels</h2>
        {initial.length === 0 && (
          <p className="text-sm text-neutral-500">None yet.</p>
        )}
        <ul className="divide-y">
          {initial.map((c) => (
            <ChannelRow key={c.id} channel={c} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ChannelRow({ channel }: { channel: NotificationChannel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <li className="py-2 flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">
          {channel.name}{" "}
          <span className="text-neutral-500 font-normal">({channel.kind})</span>
        </div>
        <div className="text-xs text-neutral-500 font-mono truncate max-w-xs">
          {JSON.stringify(channel.config).slice(0, 100)}
        </div>
        {msg && <div className="text-xs text-emerald-600 mt-0.5">{msg}</div>}
      </div>
      <div className="flex items-center gap-1">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await fetch(`/api/notifications/${channel.id}/test`, {
                method: "POST",
              });
              if (res.ok) setMsg("test sent");
              else {
                const j = await res.json().catch(() => ({}));
                setMsg(`error: ${j.error}`);
              }
            })
          }
          className="btn btn-ghost !px-2 !py-1 text-xs"
        >
          <Send className="w-3 h-3" /> Test
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete channel?")) return;
            start(async () => {
              await fetch(`/api/notifications/${channel.id}`, {
                method: "DELETE",
              });
              router.refresh();
            });
          }}
          className="btn btn-danger !px-2 !py-1 text-xs"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </li>
  );
}
