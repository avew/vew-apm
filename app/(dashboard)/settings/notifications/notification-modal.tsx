"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Eye, EyeOff } from "lucide-react";

type Kind = "telegram" | "webhook" | "email";

const cls = "field-input !mt-1";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex items-center gap-2 text-sm"
      >
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            checked ? "bg-[var(--color-brand-600)]" : "bg-neutral-300 dark:bg-neutral-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className="font-medium">{label}</span>
      </button>
      {hint && <p className="text-xs text-[var(--muted)] mt-1 ml-11">{hint}</p>}
    </div>
  );
}

export function NotificationModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [kind, setKind] = useState<Kind>("telegram");
  const [name, setName] = useState("");
  // telegram
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [silent, setSilent] = useState(false);
  const [protect, setProtect] = useState(false);
  const [useTemplate, setUseTemplate] = useState(false);
  const [template, setTemplate] = useState("");
  // webhook
  const [url, setUrl] = useState("");
  // email
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState("");
  // common
  const [defaultEnabled, setDefaultEnabled] = useState(true);
  const [applyAll, setApplyAll] = useState(false);

  function buildConfig(): Record<string, unknown> | null {
    if (kind === "telegram") {
      if (!botToken.trim() || !chatId.trim()) return null;
      const n = Number(chatId);
      return {
        botToken: botToken.trim(),
        chatId: Number.isFinite(n) && chatId.trim() !== "" ? n : chatId.trim(),
        ...(threadId.trim() ? { messageThreadId: threadId.trim() } : {}),
        ...(serverUrl.trim() ? { serverUrl: serverUrl.trim() } : {}),
        silent,
        protect,
        ...(useTemplate && template.trim() ? { template: template.trim() } : {}),
      };
    }
    if (kind === "webhook") {
      if (!url.trim()) return null;
      return { url: url.trim() };
    }
    // email
    const to = emailTo.split(",").map((s) => s.trim()).filter(Boolean);
    if (!emailFrom.trim() || to.length === 0) return null;
    return { from: emailFrom.trim(), to };
  }

  function doTest() {
    setMsg(null);
    const config = buildConfig();
    if (!config) {
      setMsg({ type: "err", text: "Fill the required fields first." });
      return;
    }
    start(async () => {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, config }),
      });
      if (res.ok) setMsg({ type: "ok", text: "Test message sent." });
      else {
        const j = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: j.error ?? "Test failed" });
      }
    });
  }

  function doSave() {
    setMsg(null);
    if (!name.trim()) return setMsg({ type: "err", text: "Friendly name is required." });
    const config = buildConfig();
    if (!config) return setMsg({ type: "err", text: "Fill the required fields." });
    start(async () => {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          enabled: defaultEnabled,
          applyAll,
          config,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: j.error ?? "Save failed" });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const getUpdatesUrl = `https://api.telegram.org/bot${
    botToken.trim() || "<YOUR_BOT_TOKEN>"
  }/getUpdates`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg my-8 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Set Up Notification</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Notification Type</span>
            <select
              className={cls}
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="telegram">Telegram</option>
              <option value="webhook">Webhook</option>
              <option value="email">Email (Resend)</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">Friendly Name</span>
            <input
              className={cls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`My ${kind} alert`}
            />
          </label>

          {kind === "telegram" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Bot Token</span>
                <div className="relative">
                  <input
                    className={`${cls} pr-10`}
                    type={showToken ? "text" : "password"}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  Get a token from{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-brand-600)] hover:underline"
                  >
                    @BotFather
                  </a>
                  .
                </span>
              </label>

              <label className="block text-sm">
                <span className="font-medium">Chat ID</span>
                <input
                  className={cls}
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                />
                <span className="text-xs text-[var(--muted)] block mt-1">
                  Supports Direct / Group / Channel chat ID. Send a message to the
                  bot then open{" "}
                  <a
                    href={getUpdatesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-brand-600)] hover:underline break-all"
                  >
                    getUpdates
                  </a>{" "}
                  to find the chat_id.
                </span>
              </label>

              <label className="block text-sm">
                <span className="font-medium">Message Thread ID</span>
                <span className="text-[var(--muted)]"> (optional)</span>
                <input
                  className={cls}
                  value={threadId}
                  onChange={(e) => setThreadId(e.target.value)}
                  placeholder="forum supergroups only"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium">Server URL</span>
                <span className="text-[var(--muted)]"> (optional)</span>
                <input
                  className={cls}
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://api.telegram.org"
                />
              </label>

              <Toggle
                checked={useTemplate}
                onChange={setUseTemplate}
                label="Use custom message template"
                hint="If enabled, the message body uses your template."
              />
              {useTemplate && (
                <textarea
                  className={`${cls} font-mono text-xs`}
                  rows={3}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="{{name}} is {{status}} — {{reason}}"
                />
              )}
              <Toggle checked={silent} onChange={setSilent} label="Send Silently" hint="Notify with no sound." />
              <Toggle
                checked={protect}
                onChange={setProtect}
                label="Protect Forwarding/Saving"
                hint="Messages protected from forwarding and saving."
              />
            </>
          )}

          {kind === "webhook" && (
            <label className="block text-sm">
              <span className="font-medium">Webhook URL</span>
              <input
                className={cls}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.example.com/xyz"
              />
            </label>
          )}

          {kind === "email" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">From</span>
                <input
                  className={cls}
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="alerts@yourdomain.com"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">To</span>
                <input
                  className={cls}
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="ops@company.com, oncall@company.com"
                />
                <span className="text-xs text-[var(--muted)]">
                  Comma-separated. Uses <code>RESEND_API_KEY</code> from env.
                </span>
              </label>
            </>
          )}

          <hr className="border-[var(--border)]" />

          <Toggle
            checked={defaultEnabled}
            onChange={setDefaultEnabled}
            label="Default enabled"
            hint="Enabled by default. You can still mute it per monitor."
          />
          <Toggle
            checked={applyAll}
            onChange={setApplyAll}
            label="Apply on all existing monitors"
            hint="Link this channel to every monitor that already exists."
          />

          {msg && (
            <p
              className={
                msg.type === "ok"
                  ? "text-sm text-emerald-600"
                  : "text-sm text-red-600"
              }
            >
              {msg.text}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={doTest}
            disabled={pending}
            className="btn"
            style={{ background: "#f59e0b", color: "#fff" }}
          >
            {pending ? "…" : "Test"}
          </button>
          <button onClick={doSave} disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
