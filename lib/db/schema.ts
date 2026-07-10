import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const ts = (name: string) =>
  integer(name, { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const monitors = sqliteTable(
  "monitors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    method: text("method").notNull().default("GET"),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    authHeaderName: text("auth_header_name"),
    authHeaderValue: text("auth_header_value"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // opt-in: show this monitor on the public /status page
    public: integer("public", { mode: "boolean" }).notNull().default(false),
    // optional grouping label for the dashboard + status page ("group" is a
    // SQL reserved word, so the column is group_name)
    group: text("group_name"),
    nextCheckAt: ts("next_check_at"),
    lastStatus: text("last_status"),
    // Alert threshold overrides (null = inherit global alert_settings)
    diskWarnPct: real("disk_warn_pct"),
    diskCritPct: real("disk_crit_pct"),
    downForMinutes: integer("down_for_minutes"),
    latencyWarnMs: integer("latency_warn_ms"),
    latencyWindow: integer("latency_window"),
    eurekaDropAlert: integer("eureka_drop_alert", { mode: "boolean" }),
    serviceGraceSeconds: integer("service_grace_seconds"),
    componentGraceSeconds: integer("component_grace_seconds"),
    renotifyMinutes: integer("renotify_minutes"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("monitors_next_check_idx").on(t.enabled, t.nextCheckAt)],
);

export const checks = sqliteTable(
  "checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    checkedAt: ts("checked_at"),
    overallStatus: text("overall_status").notNull(),
    responseMs: integer("response_ms"),
    httpStatus: integer("http_status"),
    errorText: text("error_text"),
    // true if a maintenance window was active at check time → excluded from uptime%
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
    rawJson: text("raw_json", { mode: "json" }),
  },
  (t) => [index("checks_monitor_time_idx").on(t.monitorId, t.checkedAt)],
);

export const componentStatuses = sqliteTable(
  "component_statuses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkId: integer("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    status: text("status").notNull(),
    details: text("details", { mode: "json" }),
  },
  (t) => [index("comp_check_path_idx").on(t.checkId, t.path)],
);

export const diskSnapshots = sqliteTable("disk_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkId: integer("check_id")
    .notNull()
    .references(() => checks.id, { onDelete: "cascade" }),
  diskPath: text("disk_path"),
  totalBytes: integer("total_bytes"),
  freeBytes: integer("free_bytes"),
  usedPct: real("used_pct"),
  thresholdBytes: integer("threshold_bytes"),
});

export const serviceSnapshots = sqliteTable(
  "service_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkId: integer("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    serviceName: text("service_name").notNull(),
    instanceCount: integer("instance_count").notNull().default(1),
  },
  (t) => [index("svc_check_source_idx").on(t.checkId, t.source)],
);

export const incidents = sqliteTable(
  "incidents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    componentPath: text("component_path"),
    // "availability" | "disk" | "latency" | "component_down" | "eureka" | "down"
    kind: text("kind").notNull(),
    // "warning" | "critical"
    severity: text("severity").notNull().default("critical"),
    metricValue: real("metric_value"),
    threshold: real("threshold"),
    reason: text("reason"),
    startedAt: ts("started_at"),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    suppressed: integer("suppressed", { mode: "boolean" }).notNull().default(false),
    // Renotify bookkeeping: when the last alert for this incident was sent, and
    // how many alerts fired (open + reminders + escalations).
    lastNotifiedAt: integer("last_notified_at", { mode: "timestamp" }),
    notifyCount: integer("notify_count").notNull().default(0),
  },
  (t) => [index("incidents_monitor_open_idx").on(t.monitorId, t.resolved)],
);

export const monitorServices = sqliteTable(
  "monitor_services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    serviceName: text("service_name").notNull(),
    // last source it was seen from: eureka | discoveryComposite | reactive | manual
    source: text("source").notNull().default("eureka"),
    present: integer("present", { mode: "boolean" }).notNull().default(true),
    tracked: integer("tracked", { mode: "boolean" }).notNull().default(true),
    firstSeenAt: ts("first_seen_at"),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [
    uniqueIndex("monitor_services_uniq").on(t.monitorId, t.serviceName),
  ],
);

export const notificationChannels = sqliteTable("notification_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  config: text("config", { mode: "json" }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: ts("created_at"),
});

export const maintenanceWindows = sqliteTable("maintenance_windows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  scope: text("scope").notNull(),
  monitorId: integer("monitor_id").references(() => monitors.id, {
    onDelete: "cascade",
  }),
  startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp" }).notNull(),
  recurrence: text("recurrence").notNull().default("none"),
  recurrenceConfig: text("recurrence_config", { mode: "json" }),
  reason: text("reason"),
  createdAt: ts("created_at"),
});

export const authSettings = sqliteTable("auth_settings", {
  id: integer("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionEpoch: integer("session_epoch").notNull().default(0),
  updatedAt: ts("updated_at"),
});

export const alertSettings = sqliteTable("alert_settings", {
  id: integer("id").primaryKey(),
  diskWarnPct: real("disk_warn_pct").notNull().default(60),
  diskCritPct: real("disk_crit_pct").notNull().default(85),
  downForMinutes: integer("down_for_minutes").notNull().default(3),
  latencyWarnMs: integer("latency_warn_ms").notNull().default(2000),
  latencyWindow: integer("latency_window").notNull().default(5),
  eurekaDropAlert: integer("eureka_drop_alert", { mode: "boolean" })
    .notNull()
    .default(true),
  serviceGraceSeconds: integer("service_grace_seconds").notNull().default(30),
  componentGraceSeconds: integer("component_grace_seconds").notNull().default(60),
  // re-send an alert for a still-open critical incident every N minutes; 0 = off
  renotifyMinutes: integer("renotify_minutes").notNull().default(30),
  // days of check history to keep; 0 = keep forever
  retentionDays: integer("retention_days").notNull().default(30),
  updatedAt: ts("updated_at"),
});

export const statusPage = sqliteTable("status_page", {
  id: integer("id").primaryKey(),
  // master switch: /status 404s until this is on
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  title: text("title").notNull().default("Service Status"),
  updatedAt: ts("updated_at"),
});

export type Monitor = typeof monitors.$inferSelect;
export type StatusPage = typeof statusPage.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type Check = typeof checks.$inferSelect;
export type NewCheck = typeof checks.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type MaintenanceWindow = typeof maintenanceWindows.$inferSelect;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type MonitorService = typeof monitorServices.$inferSelect;
