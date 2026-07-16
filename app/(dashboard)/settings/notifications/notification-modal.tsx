"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Eye, EyeOff } from "lucide-react";

type Kind =
  | "telegram"
  | "webhook"
  | "email"
  | "slack"
  | "discord"
  | "teams"
  | "pagerduty"
  | "opsgenie";

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
            checked ? "bg-[var(--foreground)]" : "bg-neutral-300 dark:bg-neutral-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-[var(--surface)] transition-transform ${
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

export interface EditChannel {
  id: number;
  kind: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export function NotificationModal({
  onClose,
  edit,
}: {
  onClose: () => void;
  edit?: EditChannel;
}) {
  const router = useRouter();
  const isEdit = !!edit;
  const cfg = edit?.config ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : v != null ? String(v) : "");

  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [kind, setKind] = useState<Kind>((edit?.kind as Kind) ?? "telegram");
  const [name, setName] = useState(edit?.name ?? "");
  // telegram (botToken is secret — always starts blank in edit)
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [chatId, setChatId] = useState(str(cfg.chatId));
  const [threadId, setThreadId] = useState(str(cfg.messageThreadId));
  const [serverUrl, setServerUrl] = useState(str(cfg.serverUrl));
  const [silent, setSilent] = useState(!!cfg.silent);
  const [protect, setProtect] = useState(!!cfg.protect);
  const [useTemplate, setUseTemplate] = useState(!!cfg.template);
  const [template, setTemplate] = useState(str(cfg.template));
  // webhook
  const [url, setUrl] = useState(str(cfg.url));
  // webhook request auth (authHeaderValue is the secret — blank in edit)
  const [whAuthType, setWhAuthType] = useState(
    (str(cfg.authType) || "none") as "none" | "basic" | "header" | "bearer",
  );
  const [whUsername, setWhUsername] = useState(str(cfg.authUsername));
  const [whHeaderName, setWhHeaderName] = useState(str(cfg.authHeaderName));
  const [whAuthValue, setWhAuthValue] = useState("");
  // slack / discord / teams — all use an incoming-webhook URL (secret, blank in edit)
  const [hookUrl, setHookUrl] = useState("");
  const [showHookUrl, setShowHookUrl] = useState(false);
  const [hookUsername, setHookUsername] = useState(str(cfg.username)); // slack + discord
  const [slackIcon, setSlackIcon] = useState(str(cfg.iconEmoji)); // slack only
  // pagerduty (routingKey secret) / opsgenie (apiKey secret)
  const [pdRoutingKey, setPdRoutingKey] = useState("");
  const [showPdKey, setShowPdKey] = useState(false);
  const [ogApiKey, setOgApiKey] = useState("");
  const [showOgKey, setShowOgKey] = useState(false);
  const [ogRegion, setOgRegion] = useState<"us" | "eu">(
    (str(cfg.region) as "us" | "eu") || "us",
  );
  // email (apiKey is secret — always starts blank in edit)
  const [emailApiKey, setEmailApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [emailFrom, setEmailFrom] = useState(str(cfg.from));
  const [emailTo, setEmailTo] = useState(Array.isArray(cfg.to) ? cfg.to.join(", ") : "");
  // common
  const [enabled, setEnabled] = useState(edit?.enabled ?? true);

  function buildConfig(): Record<string, unknown> | null {
    if (kind === "telegram") {
      // secret required only when creating; on edit a blank token keeps the old one
      if (!chatId.trim() || (!isEdit && !botToken.trim())) return null;
      const n = Number(chatId);
      return {
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
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
      return {
        url: url.trim(),
        authType: whAuthType,
        ...(whAuthType === "basic" && whUsername.trim()
          ? { authUsername: whUsername.trim() }
          : {}),
        ...(whAuthType === "header" && whHeaderName.trim()
          ? { authHeaderName: whHeaderName.trim() }
          : {}),
        // include the secret only when typed; blank on edit keeps the stored one
        ...(whAuthValue.trim() ? { authHeaderValue: whAuthValue.trim() } : {}),
      };
    }
    if (kind === "slack" || kind === "discord" || kind === "teams") {
      // secret required only when creating; on edit a blank URL keeps the old one
      if (!isEdit && !hookUrl.trim()) return null;
      const base = hookUrl.trim() ? { webhookUrl: hookUrl.trim() } : {};
      if (kind === "teams") return { ...base };
      if (kind === "discord") {
        return {
          ...base,
          ...(hookUsername.trim() ? { username: hookUsername.trim() } : {}),
        };
      }
      // slack
      return {
        ...base,
        ...(hookUsername.trim() ? { username: hookUsername.trim() } : {}),
        ...(slackIcon.trim() ? { iconEmoji: slackIcon.trim() } : {}),
      };
    }
    if (kind === "pagerduty") {
      if (!isEdit && !pdRoutingKey.trim()) return null;
      return pdRoutingKey.trim() ? { routingKey: pdRoutingKey.trim() } : {};
    }
    if (kind === "opsgenie") {
      if (!isEdit && !ogApiKey.trim()) return null;
      return {
        ...(ogApiKey.trim() ? { apiKey: ogApiKey.trim() } : {}),
        region: ogRegion,
      };
    }
    // email
    const to = emailTo.split(",").map((s) => s.trim()).filter(Boolean);
    if (!emailFrom.trim() || to.length === 0 || (!isEdit && !emailApiKey.trim())) return null;
    return {
      ...(emailApiKey.trim() ? { apiKey: emailApiKey.trim() } : {}),
      from: emailFrom.trim(),
      to,
    };
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
      const res = await fetch(
        isEdit ? `/api/notifications/${edit!.id}` : "/api/notifications",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? { name: name.trim(), enabled, config }
              : { kind, name: name.trim(), enabled, config },
          ),
        },
      );
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
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit notification" : "Set Up Notification"}
          </h2>
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
              disabled={isEdit}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="telegram">Telegram</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="teams">Microsoft Teams</option>
              <option value="pagerduty">PagerDuty</option>
              <option value="opsgenie">Opsgenie</option>
              <option value="webhook">Webhook</option>
              <option value="email">Email (via Resend)</option>
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
                    placeholder={isEdit ? "leave blank to keep current" : ""}
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

          {(kind === "slack" || kind === "discord" || kind === "teams") && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Incoming Webhook URL</span>
                <div className="relative">
                  <input
                    className={`${cls} pr-10`}
                    type={showHookUrl ? "text" : "password"}
                    value={hookUrl}
                    placeholder={
                      isEdit
                        ? "leave blank to keep current"
                        : kind === "slack"
                          ? "https://hooks.slack.com/services/…"
                          : kind === "discord"
                            ? "https://discord.com/api/webhooks/…"
                            : "https://….webhook.office.com/…"
                    }
                    onChange={(e) => setHookUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowHookUrl((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {showHookUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {kind === "slack" && (
                    <>
                      Create one under{" "}
                      <a
                        href="https://api.slack.com/messaging/webhooks"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-brand-600)] hover:underline"
                      >
                        Incoming Webhooks
                      </a>{" "}
                      for the channel you want alerts in.
                    </>
                  )}
                  {kind === "discord" && (
                    <>
                      Server Settings → Integrations →{" "}
                      <a
                        href="https://support.discord.com/hc/en-us/articles/228383668"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-brand-600)] hover:underline"
                      >
                        Webhooks
                      </a>{" "}
                      → New Webhook, then copy the URL.
                    </>
                  )}
                  {kind === "teams" && (
                    <>
                      Add an{" "}
                      <a
                        href="https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-brand-600)] hover:underline"
                      >
                        Incoming Webhook
                      </a>{" "}
                      to the channel and paste its URL.
                    </>
                  )}
                </span>
              </label>
              {(kind === "slack" || kind === "discord") && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium">Display name</span>
                    <span className="text-[var(--muted)]"> (optional)</span>
                    <input
                      className={cls}
                      value={hookUsername}
                      onChange={(e) => setHookUsername(e.target.value)}
                      placeholder="Vew APM"
                    />
                  </label>
                  {kind === "slack" && (
                    <label className="block text-sm">
                      <span className="font-medium">Icon emoji</span>
                      <span className="text-[var(--muted)]"> (optional)</span>
                      <input
                        className={cls}
                        value={slackIcon}
                        onChange={(e) => setSlackIcon(e.target.value)}
                        placeholder=":rotating_light:"
                      />
                    </label>
                  )}
                </div>
              )}
            </>
          )}

          {kind === "pagerduty" && (
            <label className="block text-sm">
              <span className="font-medium">Integration / Routing Key</span>
              <div className="relative">
                <input
                  className={`${cls} pr-10`}
                  type={showPdKey ? "text" : "password"}
                  value={pdRoutingKey}
                  placeholder={isEdit ? "leave blank to keep current" : "Events API v2 routing key"}
                  onChange={(e) => setPdRoutingKey(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPdKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {showPdKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-xs text-[var(--muted)]">
                Create an <b>Events API v2</b> integration on a PagerDuty service
                and paste its integration key. Incidents map to trigger / resolve.
              </span>
            </label>
          )}

          {kind === "opsgenie" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">API Key</span>
                <div className="relative">
                  <input
                    className={`${cls} pr-10`}
                    type={showOgKey ? "text" : "password"}
                    value={ogApiKey}
                    placeholder={isEdit ? "leave blank to keep current" : "Opsgenie API integration key"}
                    onChange={(e) => setOgApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOgKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {showOgKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  From an <b>API</b> integration in Opsgenie. Incidents open and
                  close an alert keyed by incident id.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Region</span>
                <select
                  className={cls}
                  value={ogRegion}
                  onChange={(e) => setOgRegion(e.target.value as "us" | "eu")}
                >
                  <option value="us">US (api.opsgenie.com)</option>
                  <option value="eu">EU (api.eu.opsgenie.com)</option>
                </select>
              </label>
            </>
          )}

          {kind === "webhook" && (
            <>
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
              <label className="block text-sm">
                <span className="font-medium">Authentication</span>
                <select
                  className={cls}
                  value={whAuthType}
                  onChange={(e) => setWhAuthType(e.target.value as typeof whAuthType)}
                >
                  <option value="none">None</option>
                  <option value="basic">Basic Auth</option>
                  <option value="header">Header Auth</option>
                  <option value="bearer">Bearer / JWT</option>
                </select>
              </label>
              {whAuthType === "basic" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium">Username</span>
                    <input className={cls} value={whUsername} onChange={(e) => setWhUsername(e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Password</span>
                    <input className={cls} type="password" value={whAuthValue} onChange={(e) => setWhAuthValue(e.target.value)} placeholder={isEdit ? "leave blank to keep" : ""} />
                  </label>
                </div>
              )}
              {whAuthType === "header" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium">Header name</span>
                    <input className={cls} value={whHeaderName} onChange={(e) => setWhHeaderName(e.target.value)} placeholder="X-API-Key" />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Header value</span>
                    <input className={cls} type="password" value={whAuthValue} onChange={(e) => setWhAuthValue(e.target.value)} placeholder={isEdit ? "leave blank to keep" : ""} />
                  </label>
                </div>
              )}
              {whAuthType === "bearer" && (
                <label className="block text-sm">
                  <span className="font-medium">Token</span>
                  <input className={cls} type="password" value={whAuthValue} onChange={(e) => setWhAuthValue(e.target.value)} placeholder={isEdit ? "leave blank to keep" : "JWT / bearer token"} />
                </label>
              )}
            </>
          )}

          {kind === "email" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Resend API Key</span>
                <div className="relative">
                  <input
                    className={`${cls} pr-10`}
                    type={showApiKey ? "text" : "password"}
                    value={emailApiKey}
                    onChange={(e) => setEmailApiKey(e.target.value)}
                    placeholder={isEdit ? "leave blank to keep current" : "re_xxxxxxxxxxxxxxxx"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  Per-channel key — get one at{" "}
                  <a
                    href="https://resend.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-brand-600)] hover:underline"
                  >
                    resend.com/api-keys
                  </a>
                  .
                </span>
              </label>
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
                  Comma-separated recipients.
                </span>
              </label>
            </>
          )}

          <hr className="border-[var(--border)]" />

          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Enabled"
            hint="This channel notifies for all monitors. Disable to pause it without deleting."
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
