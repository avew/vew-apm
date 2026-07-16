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
    // "actuator" (Spring health tree) | "http" (2xx + keyword) | "json" (JSON path)
    // | "prometheus" (scrape a metrics endpoint; alert via metric_rules)
    type: text("type").notNull().default("actuator"),
    expectStatus: text("expect_status"), // http: e.g. "2xx" | "200" | "200-204"
    keyword: text("keyword"), // http/json: body must contain this
    statusPath: text("status_path"), // json: e.g. "$.status"
    statusUpValue: text("status_up_value"), // json: value that means UP
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    // request auth: "none" | "basic" | "header" | "bearer"
    authType: text("auth_type").notNull().default("none"),
    authUsername: text("auth_username"), // basic
    authHeaderName: text("auth_header_name"), // header: the header name
    authHeaderValue: text("auth_header_value"), // secret: header value / bearer token / basic password
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
    certWarnDays: integer("cert_warn_days"),
    certCritDays: integer("cert_crit_days"),
    // SLO uptime target % override (null = inherit global)
    sloTarget: real("slo_target"),
    // latest observed TLS cert expiry (https monitors only)
    certExpiresAt: integer("cert_expires_at", { mode: "timestamp" }),
    certCheckedAt: integer("cert_checked_at", { mode: "timestamp" }),
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

export const diskSnapshots = sqliteTable(
  "disk_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkId: integer("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    diskPath: text("disk_path"),
    totalBytes: integer("total_bytes"),
    freeBytes: integer("free_bytes"),
    usedPct: real("used_pct"),
    thresholdBytes: integer("threshold_bytes"),
  },
  // Join key for "latest disk per monitor" (dashboard) and the 24h disk chart.
  // Without it those queries full-SCAN disk_snapshots per candidate check.
  (t) => [index("disk_check_idx").on(t.checkId)],
);

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

// Prometheus scrape endpoints for a monitor. A monitor (any type) can have
// several — e.g. one per microservice (gateway, billing-svc, …). Metric rules
// target a source; the checker scrapes each distinct URL once per check.
export const metricSources = sqliteTable(
  "metric_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // friendly name shown on rules + charts
    url: text("url").notNull(), // e.g. https://billing/actuator/prometheus
    createdAt: ts("created_at"),
  },
  (t) => [index("metric_sources_monitor_idx").on(t.monitorId)],
);

// Per-monitor Prometheus metric alert rules. Each rule targets a metric_source,
// selects one sample (metricName + label matchers) and compares it to a
// warn/crit threshold with an operator. Thresholds live here, NOT in
// alert_settings, because they're metric-specific, not global.
export const metricRules = sqliteTable(
  "metric_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    // which endpoint to scrape this metric from (null = inert until set)
    sourceId: integer("source_id").references(() => metricSources.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(), // friendly name shown on the incident + chart
    metricName: text("metric_name").notNull(), // e.g. jvm_memory_used_bytes
    labelMatchers: text("label_matchers", { mode: "json" }), // Record<string,string> | null
    operator: text("operator").notNull().default("gt"), // gt | gte | lt | lte
    warnValue: real("warn_value"),
    critValue: real("crit_value"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at"),
  },
  (t) => [index("metric_rules_monitor_idx").on(t.monitorId)],
);

// Per-check time series of watched metric values (one row per enabled rule per
// check). Mirrors disk_snapshots; pruned with checks via the FK cascade.
export const metricSamples = sqliteTable(
  "metric_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkId: integer("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => metricRules.id, { onDelete: "cascade" }),
    value: real("value").notNull(),
  },
  (t) => [index("metric_samples_check_idx").on(t.checkId)],
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
    // Acknowledge / snooze (P3): an acked incident stops renotifying; a snoozed
    // incident stops until snoozedUntil passes.
    ackedAt: integer("acked_at", { mode: "timestamp" }),
    ackedBy: text("acked_by"),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp" }),
    // Escalation (P4): how many ordered policy steps have already fired.
    escalationStep: integer("escalation_step").notNull().default(0),
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

// Per-channel routing rules (P2). A channel with NO routes fires for every
// monitor/severity (backward-compatible default). A channel with routes fires
// only when at least one route matches the event.
export const channelRoutes = sqliteTable("channel_routes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: integer("channel_id")
    .notNull()
    .references(() => notificationChannels.id, { onDelete: "cascade" }),
  // "all" (any monitor) | "group" (targetId = group name) | "monitor" (targetId = monitor id)
  scope: text("scope").notNull().default("all"),
  targetId: text("target_id"),
  // minimum severity that fires this route: "warning" (all) | "critical" (only crit)
  minSeverity: text("min_severity").notNull().default("warning"),
  // restrict to specific alert kinds; null/empty = all kinds
  alertKinds: text("alert_kinds", { mode: "json" }).$type<string[]>(),
  createdAt: ts("created_at"),
});

// Escalation policies (P4). A policy is an ordered set of time-delayed steps;
// each step notifies one channel N minutes after an incident opens if it is
// still unacknowledged. At most one policy is active at a time (global).
export const escalationPolicies = sqliteTable("escalation_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: ts("created_at"),
});

export const escalationSteps = sqliteTable("escalation_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  policyId: integer("policy_id")
    .notNull()
    .references(() => escalationPolicies.id, { onDelete: "cascade" }),
  // minutes after the incident opened at which this step fires
  afterMinutes: integer("after_minutes").notNull(),
  // a step targets EITHER a fixed channel OR an on-call schedule (P5), which
  // resolves to whoever is on call at fire time. Exactly one is set.
  channelId: integer("channel_id").references(() => notificationChannels.id, {
    onDelete: "cascade",
  }),
  scheduleId: integer("schedule_id").references(() => oncallSchedules.id, {
    onDelete: "cascade",
  }),
  createdAt: ts("created_at"),
});

// On-call (P5). A responder is a person mapped to their contact channel. A
// schedule rotates over an ordered list of responders every `rotationDays`,
// counting from `anchorAt`. An escalation step can target a schedule instead of
// a fixed channel, resolving to the current on-call responder's channel.
export const responders = sqliteTable("responders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => notificationChannels.id, { onDelete: "cascade" }),
  createdAt: ts("created_at"),
});

export const oncallSchedules = sqliteTable("oncall_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rotationDays: integer("rotation_days").notNull().default(7),
  anchorAt: integer("anchor_at", { mode: "timestamp" }).notNull(),
  createdAt: ts("created_at"),
});

export const oncallMembers = sqliteTable("oncall_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scheduleId: integer("schedule_id")
    .notNull()
    .references(() => oncallSchedules.id, { onDelete: "cascade" }),
  responderId: integer("responder_id")
    .notNull()
    .references(() => responders.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
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
  // TLS cert expiry alerting (days before notAfter)
  certWarnDays: integer("cert_warn_days").notNull().default(14),
  certCritDays: integer("cert_crit_days").notNull().default(3),
  // global SLO uptime target %
  sloTarget: real("slo_target").notNull().default(99.9),
  // days of check history to keep; 0 = keep forever
  retentionDays: integer("retention_days").notNull().default(30),
  updatedAt: ts("updated_at"),
});

// Operator-authored ("manual") incidents shown on the public status page, with
// a timeline of updates. Distinct from the auto-detected `incidents` table.
export const statusIncidents = sqliteTable("status_incidents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  // "minor" | "major" | "critical"
  impact: text("impact").notNull().default("minor"),
  // "investigating" | "identified" | "monitoring" | "resolved"
  status: text("status").notNull().default("investigating"),
  startedAt: ts("started_at"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  updatedAt: ts("updated_at"),
});

export const statusIncidentUpdates = sqliteTable(
  "status_incident_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    incidentId: integer("incident_id")
      .notNull()
      .references(() => statusIncidents.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    body: text("body").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [index("status_incident_update_idx").on(t.incidentId)],
);

export const statusPage = sqliteTable("status_page", {
  id: integer("id").primaryKey(),
  // master switch: /status 404s until this is on
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  title: text("title").notNull().default("Service Status"),
  updatedAt: ts("updated_at"),
});

export type Monitor = typeof monitors.$inferSelect;
export type StatusPage = typeof statusPage.$inferSelect;
export type StatusIncident = typeof statusIncidents.$inferSelect;
export type StatusIncidentUpdate = typeof statusIncidentUpdates.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type Check = typeof checks.$inferSelect;
export type NewCheck = typeof checks.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type ChannelRoute = typeof channelRoutes.$inferSelect;
export type EscalationPolicy = typeof escalationPolicies.$inferSelect;
export type EscalationStep = typeof escalationSteps.$inferSelect;
export type Responder = typeof responders.$inferSelect;
export type OncallSchedule = typeof oncallSchedules.$inferSelect;
export type OncallMember = typeof oncallMembers.$inferSelect;
export type MaintenanceWindow = typeof maintenanceWindows.$inferSelect;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type MonitorService = typeof monitorServices.$inferSelect;
