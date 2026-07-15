#!/usr/bin/env bash
#
# Build the Vew APM image and push it to a private registry.
#
#   Default target: registry.pajakku.com/etax-op/apm:<package.json version> + :latest
#
# Usage:
#   ./scripts/docker-push.sh                      # build + push :<version> and :latest
#   VERSION=1.2.0 ./scripts/docker-push.sh        # override the version tag
#   REGISTRY=registry.pajakku.com \
#   IMAGE=apm/vew-apm ./scripts/docker-push.sh    # override registry / repo path
#   PLATFORM=linux/arm64 ./scripts/docker-push.sh # override target arch
#   PUSH=0 ./scripts/docker-push.sh               # build only (load locally), don't push
#
# Log in to the registry FIRST — this script never stores credentials:
#   docker login registry.pajakku.com
#
set -euo pipefail

REGISTRY="${REGISTRY:-registry.pajakku.com}"
IMAGE="${IMAGE:-etax-op/apm}"
PLATFORM="${PLATFORM:-linux/amd64}"   # Coolify hosts are usually x86_64
PUSH="${PUSH:-1}"

# Repo root (this script lives in scripts/)
cd "$(dirname "$0")/.."

# Version from package.json unless overridden.
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"

REPO="${REGISTRY}/${IMAGE}"

echo "→ Image:    ${REPO}"
echo "→ Tags:     ${VERSION}, latest"
echo "→ Platform: ${PLATFORM}"
if [ "$PUSH" = 1 ]; then echo "→ Push:     yes"; else echo "→ Push:     no (build only)"; fi
echo

# A dedicated buildx builder so we can cross-build (e.g. amd64 image from an
# arm64 Mac). Reuse it if it already exists.
if ! docker buildx inspect vew-apm-builder >/dev/null 2>&1; then
  docker buildx create --name vew-apm-builder --use >/dev/null
fi
docker buildx use vew-apm-builder

OUTPUT=(--load)                       # build-only: import into local docker
if [ "$PUSH" = 1 ]; then OUTPUT=(--push); fi

docker buildx build \
  --platform "${PLATFORM}" \
  -t "${REPO}:${VERSION}" \
  -t "${REPO}:latest" \
  "${OUTPUT[@]}" \
  .

echo
if [ "$PUSH" = 1 ]; then
  echo "✓ Pushed ${REPO}:${VERSION} (+ :latest)"
  echo "  Pull on the server:  docker pull ${REPO}:${VERSION}"
else
  echo "✓ Built ${REPO}:${VERSION} (+ :latest) — not pushed (PUSH=0)"
fi
