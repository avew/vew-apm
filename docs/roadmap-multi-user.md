# Vew APM — Multi-User / RBAC / SSO Roadmap (Track C)

Phased plan to evolve the single self-hosted operator into a team: multiple
users, roles, audit, and SSO. For what exists today see
[FEATURES.md](../FEATURES.md); for architecture see [AGENTS.md](../AGENTS.md).

---

## Where we are today (single-user)

- **`auth_settings`** — one row: `username`, `passwordHash`, `sessionEpoch`.
  There is exactly one operator.
- **`lib/auth.ts`** — `hashPassword` / `verifyPassword`, `createInitialAdmin`,
  `changeCredentials`, `issueSession(username)`, `verifySession` /
  `verifySessionEdge`, `isSetupComplete`.
- **`lib/session.ts`** — `getCurrentUser()` / `requireUser()` gate every API
  route (except `/api/cron/*` and the public paths).
- **`middleware.ts`** — verifies the `apm_session` JWT (jose) signed with
  `SESSION_SECRET`; `PUBLIC_PATHS` allowlist.
- Auth routes: `login`, `logout`, `password`, `setup`.

**Goal:** many users with roles, without breaking the existing operator or the
single-tenant, self-hostable model.

> ⚠️ **This is the auth surface — the highest-stakes area in the app.** Every
> phase needs a security pass, must never lock out the existing user, and must
> keep `sessionEpoch`-based invalidation working.

## Sequence (dependencies)

```
C1 users + multi-user auth  ──► foundation for everything
      │
C2 RBAC (roles + gating)
      │
C3 user management UI
      │
C4 audit log  ◄──────────────── depends only on C1; can run parallel to C2/C3
      │
C5 SSO (OIDC)               ──► auto-provisions/maps users
      │
C6 MFA (TOTP) + hardening
```

---

## C1 — User model + multi-user auth

**Effort: L · Depends on: — · Foundation**

Introduce real users while keeping the current login working.

- **Schema**: new `users` (`id`, `username` / `email`, `passwordHash`, `role`,
  `active`, `sessionEpoch`, `createdAt`, `lastLoginAt`). Migrate the single
  `auth_settings` row into the first `admin` user (idempotent, in
  `instrumentation.ts` or the migration). Keep `auth_settings` for instance-wide
  config or retire it.
- **Code**: `SessionClaims` carry `userId` + `role`; `issueSession(userId)`;
  `verifySession` / `verifySessionEdge` resolve the user and check per-user
  `sessionEpoch`; `getCurrentUser()` returns the user row. `login` looks up by
  username/email; `setup` still bootstraps the first admin.
- **Back-compat**: the migrated operator logs in unchanged; existing sessions
  stay valid until epoch bump.
- **Security**: bump `sessionEpoch` on password change / deactivate to kill
  sessions; keep the login rate-limit (`lib/rate-limit.ts`).

## C2 — RBAC (roles + gating)

**Effort: M · Depends on: C1**

- **Roles**: `admin` (everything, incl. user management), `editor` (manage
  monitors / notifications / escalation / on-call), `viewer` (read-only).
- **Code**: add `requireRole(min)` alongside `requireUser()`; gate every
  mutating route (POST / PATCH / DELETE) by role — viewers get GET only.
  Centralize the role check so it can't be forgotten per-route.
- **UI**: hide / disable create-edit-delete controls for viewers (server-gated
  regardless — the UI gate is convenience, not security).
- **Tests**: a pure `canMutate(role, action)` matrix + per-route 403 checks.

## C3 — User management UI

**Effort: M · Depends on: C1, C2**

- **Settings › Users** (admin-only): list users, create / invite, set role,
  deactivate / reactivate, reset password, force-logout (epoch bump).
- **API**: `/api/users` (+ `/[id]`) CRUD, admin-gated; never return password
  hashes to the client.
- **Guardrails**: cannot delete / demote the last admin; cannot deactivate
  yourself into lockout.

## C4 — Audit log

**Effort: S–M · Depends on: C1 · parallel to C2/C3**

- **Schema**: `audit_log` (`userId`, `action`, `targetType`, `targetId`,
  `metadata` jsonb, `createdAt`).
- **Code**: record mutations (monitor / channel / policy / user changes) with
  the acting user. A small `audit(userId, action, target)` helper called from
  mutating routes.
- **UI**: Settings › Audit — filterable, paginated (reuse the incident-list
  pagination pattern). Retention pruned like other history.

## C5 — SSO (OIDC)

**Effort: L · Depends on: C1**

- **OIDC** (Authorization Code + PKCE) against a configured provider
  (`OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / redirect URL).
  Map the OIDC identity to a user by email; auto-provision with a default role
  (configurable) or require pre-creation. Keep local password login as a
  fallback / break-glass admin.
- **Routes**: `/api/auth/oidc/start` + `/api/auth/oidc/callback` (public);
  issue the same `apm_session` JWT on success.
- **Security**: validate `state` + `nonce` + PKCE; pin the issuer; map claims
  carefully; never trust email without `email_verified`.
- **SAML** is a heavier, enterprise-only stretch — track as **C5b**, not part of
  the OIDC phase.

## C6 — MFA (TOTP) + auth hardening

**Effort: M · Depends on: C1**

- **TOTP**: per-user enrollment (QR / secret), required at login when enabled;
  recovery codes.
- **Hardening**: password reset flow; session list + per-session revoke;
  lockout/backoff on repeated failures (extend `lib/rate-limit.ts`).

---

## Recommendation

Ship **C1 → C2 → C3** as the core team-adoption slice (multi-user with roles and
a management UI) — that alone unblocks internal team use. **C4 (audit)** slots in
whenever "who changed this?" becomes a question. **C5 (SSO)** and **C6 (MFA)** are
the enterprise/hardening layer — do them once the org actually requires SSO.

Because this is auth, each phase must: run a security review, ship behind tests
(including 403 gating tests), and be verified to never lock out the existing
operator before merge.
