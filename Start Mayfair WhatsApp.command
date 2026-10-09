#!/bin/bash

set -u
set -o pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_URL="http://localhost:5173"

cd "$PROJECT_DIR" || exit 1
printf '\033]0;Mayfair WhatsApp Campaigns\007'

printf '\n'
printf 'Mayfair WhatsApp Campaigns\n'
printf '===========================\n'
printf 'Project: %s\n\n' "$PROJECT_DIR"

pause_before_exit() {
  printf '\n'
  read -r -p "Press Return to close this window..."
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  pause_before_exit
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This launcher is intended for macOS."
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'Node.js 22 is not installed or is not available in Terminal.\n' >&2
  printf 'Follow ReadmeForMac.md, reopen Terminal, and run this launcher again.\n' >&2
  pause_before_exit
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  fail "Node.js 22.13.0 or newer is required. Installed version: $(node --version)"
fi

if [[ ! -f ".env.local" ]]; then
  if [[ ! -f ".env.example" ]]; then
    fail ".env.example is missing. Download a complete copy of the repository."
  fi

  /bin/cp ".env.example" ".env.local" || fail "Could not create .env.local."
  /bin/chmod 600 ".env.local"
  printf 'Created the private .env.local configuration file.\n'
fi

find_missing_config() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const source = readFileSync(".env.local", "utf8");
    const values = new Map();
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) ||
          (value.startsWith("\u0027") && value.endsWith("\u0027"))) {
        value = value.slice(1, -1);
      }
      values.set(key, value);
    }
    const required = [
      "META_ACCESS_TOKEN",
      "META_PHONE_NUMBER_ID",
      "META_TEMPLATE_NAME",
      "META_TEMPLATE_LANGUAGE",
      "META_GRAPH_API_VERSION",
    ];
    process.stdout.write(required.filter((key) => !values.get(key)).join(", "));
  '
}

MISSING_CONFIG="$(find_missing_config)" || fail "Could not read .env.local."
if [[ -n "$MISSING_CONFIG" ]]; then
  printf '\nThe following settings still need values:\n'
  printf '  %s\n\n' "$MISSING_CONFIG"
  printf 'Opening .env.local in TextEdit. Add the values and save the file.\n'
  /usr/bin/open -e ".env.local"
  read -r -p "After saving the file, return here and press Return..."

  MISSING_CONFIG="$(find_missing_config)" || fail "Could not read .env.local."
  if [[ -n "$MISSING_CONFIG" ]]; then
    fail "Configuration is incomplete: $MISSING_CONFIG"
  fi
fi

/bin/chmod 600 ".env.local"

if [[ ! -d "node_modules" || ! -f "node_modules/.package-lock.json" || "package-lock.json" -nt "node_modules/.package-lock.json" ]]; then
  printf 'Installing project dependencies. This may take a few minutes...\n'
  npm ci || fail "Dependency installation failed."
fi

if [[ ! -f "dist/server/wrangler.json" ]]; then
  printf 'Preparing the local application...\n'
  npm run build || fail "The application build failed."
fi

D1_COMMAND=(
  node
  --import "./scripts/sites-env.mjs"
  "./node_modules/wrangler/bin/wrangler.js"
  d1 execute DB
  --local
  --config "dist/server/wrangler.json"
  --persist-to ".wrangler/state"
)

DATABASE_CHECK="$("${D1_COMMAND[@]}" --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'campaigns';" --json 2>/dev/null || true)"
if [[ "$DATABASE_CHECK" != *'"campaigns"'* ]]; then
  printf 'Initializing the local campaign database...\n'
  "${D1_COMMAND[@]}" --file "drizzle/0000_busy_warstar.sql" --yes || fail "Local database initialization failed."
fi

open_dashboard_when_ready() {
  local attempt=1
  while (( attempt <= 90 )); do
    if /usr/bin/curl --fail --silent --output /dev/null "$LOCAL_URL"; then
      /usr/bin/open "$LOCAL_URL"
      return 0
    fi
    /bin/sleep 1
    attempt=$((attempt + 1))
  done
  return 1
}

printf '\nStarting the dashboard at %s\n' "$LOCAL_URL"
printf 'Keep this Terminal window open while using the app.\n'
printf 'Press Control+C here when you want to stop it.\n\n'

open_dashboard_when_ready &
BROWSER_WAITER_PID=$!

cleanup() {
  /bin/kill "$BROWSER_WAITER_PID" >/dev/null 2>&1 || true
}

stop_app() {
  cleanup
  printf '\nDashboard stopped.\n'
  exit 0
}

trap cleanup EXIT
trap stop_app INT TERM

npm run dev
DEV_STATUS=$?
cleanup

if (( DEV_STATUS != 0 )); then
  fail "The development server stopped with an error."
fi
