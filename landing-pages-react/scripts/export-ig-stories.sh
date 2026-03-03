#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/instagram-stories/end-of-quarter-mar-2026"
PORT="${PORT:-3310}"
HOST="${HOST:-127.0.0.1}"
LOCK_PATH="$ROOT_DIR/.next/dev/lock"
BUILD_LOG="/tmp/slugswap-ig-story-build.log"
SERVER_LOG="/tmp/slugswap-ig-story-server.log"

mkdir -p "$OUT_DIR"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"

# Build and serve in production mode to avoid Next.js dev indicator badges in exports.
npm run build >"$BUILD_LOG" 2>&1

node -e "require('fs').rmSync(process.argv[1], { force: true })" "$LOCK_PATH"
npm run start -- --port "$PORT" --hostname "$HOST" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in {1..90}; do
  if curl -sf "http://$HOST:$PORT/ig-stories/option-a/1" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://$HOST:$PORT/ig-stories/option-a/1" >/dev/null; then
  echo "Failed to start Next.js server. See $SERVER_LOG"
  exit 1
fi

for variant in option-a option-b; do
  for slide in 1 2 3; do
    url="http://$HOST:$PORT/ig-stories/$variant/$slide"
    out="$OUT_DIR/story-slide-$slide-$variant.png"
    npx playwright screenshot \
      --viewport-size=1080,1920 \
      --wait-for-timeout=1200 \
      "$url" \
      "$out"
    echo "Exported: $out"
  done
done
