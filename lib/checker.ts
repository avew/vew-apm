import tls from "node:tls";
import { getDb, schema } from "@/lib/db/client";
import { and, eq, lte, desc, inArray } from "drizzle-orm";
import { parseHealth, type ParsedHealth } from "./parser";
import { evaluateHttp, evaluateJson } from "./check-eval";
import { parsePromText, selectSample, type PromSample } from "./prom-parse";
import { buildAuthHeaders } from "./auth-header";
import { isMonitorMuted } from "./maintenance";
import { dispatch } from "./notifier";
import { getEffectiveThresholds } from "./alerts";
import {
  evaluateRules,
  alertKey,
  type DesiredAlert,
  type AlertKind,
  type MetricInput,
  type MetricOp,
} from "./rules";
import type { Monitor } from "@/lib/db/schema";

interface FetchResult {
  overall: string;
  parsed: ParsedHealth | null;
  responseMs: number;
  httpStatus: number | null;
  errorText: string | null;
  rawJson: unknown;
}

/**
 * Read the TLS certificate's expiry for an https URL. rejectUnauthorized:false
 * so we still read expired/self-signed certs (we're monitoring, not trusting).
 * Returns null for non-https URLs or on any connection failure.
 */
export function fetchCertExpiry(
  urlStr: string,
  timeoutMs: number,
): Promise<Date | null> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return Promise.resolve(null);
  }
  if (u.protocol !== "https:") return Promise.resolve(null);
  const port = u.port ? Number(u.port) : 443;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: Date | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const socket = tls.connect(
      {
        host: u.hostname,
        port,
        servername: u.hostname,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        const valid = cert && cert.valid_to ? new Date(cert.valid_to) : null;
        finish(valid && !isNaN(valid.getTime()) ? valid : null);
      },
    );
    socket.on("error", () => finish(null));
    socket.on("timeout", () => {
      socket.destroy();
      finish(null);
    });
  });
}

// Actuator health payloads are KBs; cap what we read so a misbehaving or
// runaway endpoint can't stream an unbounded body into memory.
export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Read a response body as text, bounded to MAX_BODY_BYTES. Rejects early via
 * Content-Length when present, otherwise stops (and cancels) mid-stream once the
 * cap is exceeded. Returns `{ tooLarge: true }` instead of the text if over cap.
 */
export async function readBodyCapped(
  res: Response,
): Promise<{ text: string | null; tooLarge: boolean }> {
  const cl = Number(res.headers.get("content-length"));
  if (Number.isFinite(cl) && cl > MAX_BODY_BYTES) {
    return { text: null, tooLarge: true };
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const t = await res.text().catch(() => "");
    return t.length > MAX_BODY_BYTES
      ? { text: null, tooLarge: true }
      : { text: t, tooLarge: false };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return { text: null, tooLarge: true };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder().decode(buf), tooLarge: false };
}

async function fetchHealth(monitor: Monitor): Promise<FetchResult> {
  const started = Date.now();
  const headers: Record<string, string> = {
    accept: monitor.type === "prometheus" ? "text/plain" : "application/json",
    ...buildAuthHeaders(monitor),
  };
  try {
    const res = await fetch(monitor.url, {
      method: monitor.method,
      headers,
      signal: AbortSignal.timeout(monitor.timeoutMs),
      cache: "no-store",
    });
    const responseMs = Date.now() - started;
    const { text, tooLarge } = await readBodyCapped(res);
    if (tooLarge) {
      return {
        overall: "DOWN",
        parsed: null,
        responseMs,
        httpStatus: res.status,
        errorText: `response too large (> ${MAX_BODY_BYTES} bytes)`,
        rawJson: null,
      };
    }

    // Generic monitor types: up/down from status code, keyword, or a JSON path
    // — no actuator parsing.
    if (monitor.type === "http") {
      const v = evaluateHttp(res.status, text ?? "", {
        expectStatus: monitor.expectStatus,
        keyword: monitor.keyword,
      });
      return {
        overall: v.up ? "UP" : "DOWN",
        parsed: null,
        responseMs,
        httpStatus: res.status,
        errorText: v.reason,
        rawJson: null,
      };
    }
    if (monitor.type === "json") {
      const v = evaluateJson(res.status, text ?? "", {
        statusPath: monitor.statusPath ?? "$.status",
        statusUpValue: monitor.statusUpValue,
        keyword: monitor.keyword,
      });
      return {
        overall: v.up ? "UP" : "DOWN",
        parsed: null,
        responseMs,
        httpStatus: res.status,
        errorText: v.reason,
        rawJson: null,
      };
    }
    if (monitor.type === "prometheus") {
      // Health = reachable + 2xx (+ optional keyword). Metric thresholds are
      // evaluated separately from scraped metric_sources, so a breach never
      // marks the monitor DOWN.
      const v = evaluateHttp(res.status, text ?? "", {
        expectStatus: monitor.expectStatus,
        keyword: monitor.keyword,
      });
      return {
        overall: v.up ? "UP" : "DOWN",
        parsed: null,
        responseMs,
        httpStatus: res.status,
        errorText: v.reason,
        rawJson: null,
      };
    }

    // actuator (default): parse the Spring health tree.
    let body: unknown = null;
    if (text !== null) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!res.ok || !body) {
      return {
        overall: "DOWN",
        parsed: null,
        responseMs,
        httpStatus: res.status,
        errorText: !res.ok ? `HTTP ${res.status}` : "invalid json body",
        rawJson: body,
      };
    }
    const parsed = parseHealth(body);
    return {
      overall: parsed.overall,
      parsed,
      responseMs,
      httpStatus: res.status,
      errorText: null,
      rawJson: body,
    };
  } catch (err) {
    return {
      overall: "DOWN",
      parsed: null,
      responseMs: Date.now() - started,
      httpStatus: null,
      errorText: (err as Error).message ?? String(err),
      rawJson: null,
    };
  }
}

/**
 * Order-independent fingerprint of a service set, for delta storage. Two checks
 * with the same (source, name, instanceCount) triples — in any order — produce
 * the same string, so an unchanged set is detected and not re-snapshotted.
 */
export function serviceSetSignature(
  rows: { source: string; serviceName: string; instanceCount: number }[],
): string {
  return rows
    .map((r) => `${r.source}|${r.serviceName}|${r.instanceCount}`)
    .sort()
    .join(";");
}

function persistCheck(
  monitor: Monitor,
  result: FetchResult,
  muted: boolean,
  metricReadings: { ruleId: number; value: number }[] = [],
): { checkId: number; componentStatuses: Map<string, string> } {
  const db = getDb();
  // One transaction: atomic (no orphan check without its child rows on a crash)
  // and a single WAL commit instead of ~4 fsyncs per check. better-sqlite3
  // transactions are synchronous, so this callback must stay sync.
  // raw_json intentionally NOT stored per check (avoids unbounded blob growth);
  // propertySources are recoverable from component_statuses details.
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.checks)
      .values({
        monitorId: monitor.id,
        overallStatus: result.overall,
        responseMs: result.responseMs,
        httpStatus: result.httpStatus ?? undefined,
        errorText: result.errorText ?? undefined,
        muted,
      })
      .returning({ id: schema.checks.id })
      .all();
    const checkId = row.id;

    const compMap = new Map<string, string>();
    if (result.parsed) {
      const { components, disks, services } = result.parsed;
      if (components.length > 0) {
        tx.insert(schema.componentStatuses)
          .values(
            components.map((c) => ({
              checkId,
              path: c.path,
              status: c.status,
              details: (c.details as object) ?? undefined,
            })),
          )
          .run();
        for (const c of components) compMap.set(c.path, c.status);
      }
      if (disks.length > 0) {
        tx.insert(schema.diskSnapshots)
          .values(
            disks.map((d) => ({
              checkId,
              diskPath: d.diskPath ?? undefined,
              totalBytes: d.totalBytes,
              freeBytes: d.freeBytes,
              usedPct: d.usedPct,
              thresholdBytes: d.thresholdBytes ?? undefined,
            })),
          )
          .run();
      }
      if (services.length > 0) {
        // Delta storage. Discovered services rarely change between checks but
        // dominate row volume (~1 row per service, every check). Only snapshot
        // when the set changed vs the last stored snapshot; the detail page
        // reads the latest *stored* set, so unchanged checks need no rows.
        // (No rule reads this table — availability/eureka come from the parse
        // and the monitor_services registry — so delta storage is display-only.)
        const [prevCp] = tx
          .select({ id: schema.serviceSnapshots.checkId })
          .from(schema.serviceSnapshots)
          .innerJoin(
            schema.checks,
            eq(schema.serviceSnapshots.checkId, schema.checks.id),
          )
          .where(eq(schema.checks.monitorId, monitor.id))
          .orderBy(desc(schema.serviceSnapshots.checkId))
          .limit(1)
          .all();
        let changed = true;
        if (prevCp) {
          const prevRows = tx
            .select({
              source: schema.serviceSnapshots.source,
              serviceName: schema.serviceSnapshots.serviceName,
              instanceCount: schema.serviceSnapshots.instanceCount,
            })
            .from(schema.serviceSnapshots)
            .where(eq(schema.serviceSnapshots.checkId, prevCp.id))
            .all();
          changed = serviceSetSignature(prevRows) !== serviceSetSignature(services);
        }
        if (changed) {
          tx.insert(schema.serviceSnapshots)
            .values(
              services.map((s) => ({
                checkId,
                source: s.source,
                serviceName: s.serviceName,
                instanceCount: s.instanceCount,
              })),
            )
            .run();
        }
      }
    }

    // Prometheus metric samples — one row per rule with a reading this check
    // (time series for the chart; pruned with checks via FK cascade).
    if (metricReadings.length > 0) {
      tx.insert(schema.metricSamples)
        .values(metricReadings.map((r) => ({ checkId, ruleId: r.ruleId, value: r.value })))
        .run();
    }

    return { checkId, componentStatuses: compMap };
  });
}

async function loadRecentChecks(monitorId: number, limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      checkedAt: schema.checks.checkedAt,
      overallStatus: schema.checks.overallStatus,
      responseMs: schema.checks.responseMs,
    })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.id))
    .limit(limit);
  return rows;
}

/**
 * Components that are currently non-UP AND have stayed non-UP continuously for
 * at least `graceSeconds` (debounce, avoids flapping). Uses recent
 * component_statuses history. Returns current status per sustained-bad path.
 */
async function computeBadComponents(
  monitorId: number,
  parsed: ParsedHealth | null,
  graceSeconds: number,
  now: Date,
): Promise<{ path: string; status: string }[]> {
  const isBad = (s: string) => s === "DOWN" || s === "OUT_OF_SERVICE";
  const currentBad = (parsed?.components ?? []).filter((c) => isBad(c.status));
  if (currentBad.length === 0) return [];

  const db = getDb();
  const recent = await db
    .select({ id: schema.checks.id, checkedAt: schema.checks.checkedAt })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.id))
    .limit(40);
  const ids = recent.map((r) => r.id);
  const rows = ids.length
    ? await db
        .select({
          checkId: schema.componentStatuses.checkId,
          path: schema.componentStatuses.path,
          status: schema.componentStatuses.status,
        })
        .from(schema.componentStatuses)
        .where(inArray(schema.componentStatuses.checkId, ids))
    : [];
  // checkId -> (path -> status)
  const byCheck = new Map<number, Map<string, string>>();
  for (const r of rows) {
    let m = byCheck.get(r.checkId);
    if (!m) byCheck.set(r.checkId, (m = new Map()));
    m.set(r.path, r.status);
  }

  const graceMs = graceSeconds * 1000;
  const out: { path: string; status: string }[] = [];
  for (const c of currentBad) {
    // walk checks newest→oldest while this path stays bad
    let oldestBadAt = now;
    for (const chk of recent) {
      const st = byCheck.get(chk.id)?.get(c.path);
      if (st && isBad(st)) oldestBadAt = chk.checkedAt;
      else break;
    }
    if (now.getTime() - oldestBadAt.getTime() >= graceMs) {
      out.push({ path: c.path, status: c.status });
    }
  }
  return out;
}

const SOURCE_PRIORITY: Record<string, number> = {
  eureka: 3,
  discoveryComposite: 2,
  reactiveDiscoveryClients: 1,
};

/**
 * A service is reported under different casing by different discovery sources
 * (Eureka `applications` = UPPERCASE, discoveryClient `services` = lowercase).
 * They are the same service — canonicalise to a single key to avoid duplicates.
 */
function canonicalServiceName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * Persist every service the health check reports into a per-monitor registry.
 * First sighting seeds the baseline (firstSeenAt). On each run, services in the
 * response are marked present; registry entries no longer reported are marked
 * absent. A tracked service that has been absent past the grace window counts
 * as DOWN and is returned for alerting. Service names are canonicalised
 * (case-insensitive) so the same service across sources is one entry.
 */
async function syncServiceRegistry(
  monitorId: number,
  parsed: ParsedHealth | null,
  graceSeconds: number,
  now: Date,
): Promise<string[]> {
  const db = getDb();

  // De-dupe detected services by canonical name, keep highest-priority source.
  const detected = new Map<string, string>();
  for (const s of parsed?.services ?? []) {
    const key = canonicalServiceName(s.serviceName);
    const prev = detected.get(key);
    if (!prev || (SOURCE_PRIORITY[s.source] ?? 0) > (SOURCE_PRIORITY[prev] ?? 0)) {
      detected.set(key, s.source);
    }
  }

  // Load registry, collapse any legacy mixed-case duplicates into one row.
  let registry = await db
    .select()
    .from(schema.monitorServices)
    .where(eq(schema.monitorServices.monitorId, monitorId));

  const byCanon = new Map<string, typeof registry>();
  for (const row of registry) {
    const key = canonicalServiceName(row.serviceName);
    (byCanon.get(key) ?? byCanon.set(key, []).get(key)!).push(row);
  }
  let mutated = false;
  for (const [key, rows] of byCanon) {
    if (rows.length > 1) {
      // keep the earliest, drop the rest (merge duplicates)
      const [keep, ...dups] = rows.sort((a, b) => a.id - b.id);
      for (const d of dups) {
        await db
          .delete(schema.monitorServices)
          .where(eq(schema.monitorServices.id, d.id));
      }
      if (keep.serviceName !== key) {
        await db
          .update(schema.monitorServices)
          .set({ serviceName: key })
          .where(eq(schema.monitorServices.id, keep.id));
      }
      mutated = true;
    } else if (rows[0].serviceName !== key) {
      await db
        .update(schema.monitorServices)
        .set({ serviceName: key })
        .where(eq(schema.monitorServices.id, rows[0].id));
      mutated = true;
    }
  }
  if (mutated) {
    registry = await db
      .select()
      .from(schema.monitorServices)
      .where(eq(schema.monitorServices.monitorId, monitorId));
  }

  // Upsert present services (insert on first sight = seed baseline).
  for (const [serviceName, source] of detected) {
    await db
      .insert(schema.monitorServices)
      .values({
        monitorId,
        serviceName,
        source,
        present: true,
        tracked: true,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.monitorServices.monitorId,
          schema.monitorServices.serviceName,
        ],
        set: { present: true, source, lastSeenAt: now },
      });
  }

  // Only reconcile absences when this check actually returned a registry.
  const down: string[] = [];
  if (detected.size > 0) {
    const graceMs = graceSeconds * 1000;
    for (const row of registry) {
      const key = canonicalServiceName(row.serviceName);
      if (detected.has(key)) continue;
      // absent this run
      if (row.present) {
        await db
          .update(schema.monitorServices)
          .set({ present: false })
          .where(eq(schema.monitorServices.id, row.id));
      }
      const absentMs = now.getTime() - row.lastSeenAt.getTime();
      if (row.tracked && absentMs >= graceMs) down.push(key);
    }
  }
  return down;
}

/**
 * Reconcile open incidents against the alert rules' desired state.
 * Opens incidents that should exist, resolves ones that no longer apply,
 * and refreshes metric/reason on ones that persist.
 */
async function reconcileIncidents(
  monitor: Monitor,
  result: FetchResult,
  now: Date,
  muted: boolean,
  certDaysLeft: number | null,
  metricInputs: MetricInput[] = [],
): Promise<void> {
  const db = getDb();
  const thresholds = await getEffectiveThresholds(monitor);
  const window = Math.max(thresholds.latencyWindow, thresholds.downForMinutes + 2, 10);
  const recentChecks = await loadRecentChecks(monitor.id, window);

  const eurekaServices =
    result.parsed?.services
      .filter((s) => s.source === "eureka")
      .map((s) => ({
        serviceName: s.serviceName,
        instanceCount: s.instanceCount,
      })) ?? [];

  // Persist/refresh the per-monitor service registry and get services that
  // are tracked but have been absent past the grace window (= down).
  const downServices = await syncServiceRegistry(
    monitor.id,
    result.parsed,
    thresholds.serviceGraceSeconds,
    now,
  );
  const eurekaMissing = thresholds.eurekaDropAlert ? downServices : [];

  // Components non-UP past the grace window (debounced).
  const badComponents = await computeBadComponents(
    monitor.id,
    result.parsed,
    thresholds.componentGraceSeconds,
    now,
  );

  const desiredList: DesiredAlert[] = evaluateRules({
    now,
    thresholds,
    recentChecks,
    badComponents,
    disks: result.parsed?.disks.map((d) => ({
      path: d.path,
      usedPct: d.usedPct,
    })) ?? [],
    eurekaServices,
    eurekaMissing,
    certDaysLeft,
    metrics: metricInputs,
  });
  const desired = new Map(desiredList.map((a) => [alertKey(a), a]));

  const openRows = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.monitorId, monitor.id),
        eq(schema.incidents.resolved, false),
      ),
    );
  const open = new Map(
    openRows.map((r) => [
      alertKey({ kind: r.kind as AlertKind, componentPath: r.componentPath }),
      r,
    ]),
  );

  // Open new alerts.
  for (const [key, a] of desired) {
    if (open.has(key)) continue;
    await db.insert(schema.incidents).values({
      monitorId: monitor.id,
      componentPath: a.componentPath ?? undefined,
      kind: a.kind,
      severity: a.severity,
      metricValue: a.metricValue ?? undefined,
      threshold: a.threshold ?? undefined,
      reason: a.reason,
      startedAt: now,
      resolved: false,
      suppressed: muted,
      lastNotifiedAt: muted ? undefined : now,
      notifyCount: muted ? 0 : 1,
    });
    if (!muted) {
      await dispatch({
        kind: "down",
        monitor,
        componentPath: a.componentPath,
        startedAt: now,
        severity: a.severity,
        alertKind: a.kind,
        reason: a.reason,
        metricValue: a.metricValue,
        threshold: a.threshold,
      });
    }
  }

  // Resolve or refresh existing.
  for (const [key, row] of open) {
    const still = desired.get(key);
    if (!still) {
      await db
        .update(schema.incidents)
        .set({ resolved: true, endedAt: now })
        .where(eq(schema.incidents.id, row.id));
      if (!row.suppressed) {
        await dispatch({
          kind: "resolved",
          monitor,
          componentPath: row.componentPath,
          startedAt: row.startedAt,
          endedAt: now,
          severity: (row.severity as "warning" | "critical") ?? "critical",
          alertKind: row.kind as AlertKind,
          reason: row.reason,
          metricValue: row.metricValue,
          threshold: row.threshold,
        });
      }
    } else {
      // Incident persists. Refresh live metric/reason/severity, and re-notify if
      // it escalated (warning → critical) or the renotify cadence elapsed for a
      // still-open critical. Suppressed (maintenance) incidents never re-notify.
      const escalated =
        row.severity !== "critical" && still.severity === "critical";
      const renotifyMs = thresholds.renotifyMinutes * 60_000;
      const dueRenotify =
        thresholds.renotifyMinutes > 0 &&
        still.severity === "critical" &&
        row.lastNotifiedAt != null &&
        now.getTime() - row.lastNotifiedAt.getTime() >= renotifyMs;
      const notify = !row.suppressed && (escalated || dueRenotify);
      await db
        .update(schema.incidents)
        .set({
          metricValue: still.metricValue ?? undefined,
          threshold: still.threshold ?? undefined,
          reason: still.reason,
          severity: still.severity,
          ...(notify
            ? { lastNotifiedAt: now, notifyCount: row.notifyCount + 1 }
            : {}),
        })
        .where(eq(schema.incidents.id, row.id));
      if (notify) {
        await dispatch({
          kind: "down",
          monitor,
          componentPath: row.componentPath,
          startedAt: row.startedAt,
          severity: still.severity,
          alertKind: still.kind,
          reason: still.reason,
          metricValue: still.metricValue,
          threshold: still.threshold,
          repeat: !escalated,
          escalated,
        });
      }
    }
  }
}

async function loadMetricSources(monitorId: number) {
  return getDb()
    .select()
    .from(schema.metricSources)
    .where(eq(schema.metricSources.monitorId, monitorId));
}

async function loadEnabledMetricRules(monitorId: number) {
  return getDb()
    .select()
    .from(schema.metricRules)
    .where(
      and(
        eq(schema.metricRules.monitorId, monitorId),
        eq(schema.metricRules.enabled, true),
      ),
    );
}

/** Scrape a Prometheus text endpoint. Null on any failure — rules just don't fire. */
async function scrapeMetrics(
  monitor: Monitor,
  url: string,
): Promise<PromSample[] | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "text/plain", ...buildAuthHeaders(monitor) },
      signal: AbortSignal.timeout(monitor.timeoutMs),
      cache: "no-store",
    });
    const { text, tooLarge } = await readBodyCapped(res);
    if (!res.ok || tooLarge || text === null) return null;
    return parsePromText(text);
  } catch {
    return null;
  }
}

/**
 * Pure: match each enabled rule against its source's scraped samples. Returns the
 * per-rule thresholds (for the rule engine) and the readings to store (rules with a
 * present value). Rules without a source, or whose metric is absent, are skipped.
 */
function computeMetricReadings(
  rules: (typeof schema.metricRules.$inferSelect)[],
  sources: (typeof schema.metricSources.$inferSelect)[],
  samplesByUrl: Map<string, PromSample[] | null>,
): { inputs: MetricInput[]; readings: { ruleId: number; value: number }[] } {
  const urlBySourceId = new Map(sources.map((s) => [s.id, s.url]));
  const inputs: MetricInput[] = [];
  const readings: { ruleId: number; value: number }[] = [];
  for (const r of rules) {
    if (r.sourceId == null) continue;
    const url = urlBySourceId.get(r.sourceId);
    if (!url) continue;
    const value = selectSample(
      samplesByUrl.get(url) ?? [],
      r.metricName,
      (r.labelMatchers as Record<string, string> | null) ?? null,
    );
    if (value === null) continue;
    readings.push({ ruleId: r.id, value });
    inputs.push({
      key: r.label,
      label: r.label,
      value,
      operator: r.operator as MetricOp,
      warnValue: r.warnValue,
      critValue: r.critValue,
    });
  }
  return { inputs, readings };
}

export async function runCheck(monitor: Monitor): Promise<void> {
  const db = getDb();
  const now = new Date();
  const result = await fetchHealth(monitor);
  const muted = await isMonitorMuted(monitor.id, now);

  // Prometheus metrics: scrape each distinct source URL once, then evaluate the
  // monitor's rules against their source's samples. Independent of monitor type
  // and of the health check — a breach raises a `metric` incident, not DOWN.
  const [sources, rules] = await Promise.all([
    loadMetricSources(monitor.id),
    loadEnabledMetricRules(monitor.id),
  ]);
  const samplesByUrl = new Map<string, PromSample[] | null>();
  if (rules.length > 0) {
    for (const url of new Set(sources.map((s) => s.url))) {
      samplesByUrl.set(url, await scrapeMetrics(monitor, url));
    }
  }
  const { inputs: metricInputs, readings } = computeMetricReadings(
    rules,
    sources,
    samplesByUrl,
  );
  persistCheck(monitor, result, muted, readings);

  // TLS cert: re-read for https monitors; keep the last known value on failure
  // so a transient TLS blip doesn't clear/flap the expiry alert.
  const certTimeout = Math.min(monitor.timeoutMs, 5000);
  const freshCert = await fetchCertExpiry(monitor.url, certTimeout);
  const certExpiresAt = freshCert ?? monitor.certExpiresAt;
  const certDaysLeft = certExpiresAt
    ? (certExpiresAt.getTime() - now.getTime()) / 86_400_000
    : null;

  await reconcileIncidents(monitor, result, now, muted, certDaysLeft, metricInputs);
  await db
    .update(schema.monitors)
    .set({
      lastStatus: result.overall,
      nextCheckAt: new Date(now.getTime() + monitor.intervalSeconds * 1000),
      updatedAt: now,
      certExpiresAt,
      ...(freshCert ? { certCheckedAt: now } : {}),
    })
    .where(eq(schema.monitors.id, monitor.id));
}

export async function runDueChecks(): Promise<{ ran: number }> {
  const db = getDb();
  const now = new Date();
  const due = await db
    .select()
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.enabled, true),
        lte(schema.monitors.nextCheckAt, now),
      ),
    )
    .limit(50);

  await Promise.allSettled(due.map((m) => runCheck(m)));
  return { ran: due.length };
}
