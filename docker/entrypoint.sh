#!/bin/sh
set -e

# Auto-provision secrets so operators don't have to. If an env var is provided
# (e.g. from a K8s/CI secret) it wins; otherwise we generate once and persist to
# the data volume so it stays stable across restarts (sessions don't invalidate).
SECRET_DIR="${SECRET_DIR:-/data}"
mkdir -p "$SECRET_DIR"

gen() { node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }

if [ -z "$SESSION_SECRET" ]; then
  f="$SECRET_DIR/.session_secret"
  [ -s "$f" ] || gen 32 > "$f"
  SESSION_SECRET="$(cat "$f")"
  export SESSION_SECRET
  echo "[entrypoint] using generated SESSION_SECRET ($SECRET_DIR/.session_secret)"
fi

if [ -z "$CRON_SECRET" ]; then
  f="$SECRET_DIR/.cron_secret"
  [ -s "$f" ] || gen 24 > "$f"
  CRON_SECRET="$(cat "$f")"
  export CRON_SECRET
  echo "[entrypoint] using generated CRON_SECRET ($SECRET_DIR/.cron_secret)"
fi

# apply migrations, then run the standalone server (in-process scheduler runs checks)
node scripts/migrate.cjs
exec node server.js
