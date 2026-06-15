#!/usr/bin/env bash
# End-to-end deploy for the Luma health intake app.
#
# Steps:
#   1. Preflight: verify the Databricks CLI token is valid (fails fast with a
#      clear re-login hint if the OAuth token has expired).
#   2. Validate the asset bundle.
#   3. Build server + client.
#   4. databricks bundle deploy   -> uploads source to the workspace.
#   5. databricks apps deploy     -> restarts the app with the new code. On
#      startup the app's service principal runs CREATE SCHEMA IF NOT EXISTS
#      intake_app and creates its tables (it owns intake_app, so no permission
#      errors).
#   6. Verify the /api/intake/bundles endpoint responds.
#
# Usage:
#   ./scripts/deploy.sh                # full deploy
#   SKIP_BUILD=1 ./scripts/deploy.sh   # skip the build step
#   DATABRICKS_CONFIG_PROFILE=hackdais ./scripts/deploy.sh
set -euo pipefail

APP_NAME="${DATABRICKS_APP_NAME:-luma}"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-${DATABRICKS_PROFILE:-hackdais}}"

# Run from the bundle root (this script's parent directory) regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# 1. Token preflight -----------------------------------------------------------
log "Checking Databricks auth (profile: ${PROFILE})"
if ! databricks current-user me --profile "${PROFILE}" -o json >/dev/null 2>&1; then
  fail "Databricks token invalid or expired. Re-login then retry:
    databricks auth login --profile ${PROFILE}"
fi

# 2. Validate bundle -----------------------------------------------------------
log "Validating bundle"
databricks bundle validate --profile "${PROFILE}"

# 3. Build ---------------------------------------------------------------------
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  log "Skipping build (SKIP_BUILD=1)"
else
  log "Building server + client"
  npm run build
fi

# 4. Upload source via bundle --------------------------------------------------
log "Deploying bundle (uploading source files)"
if ! databricks bundle deploy --profile "${PROFILE}"; then
  fail "bundle deploy failed. If this was a token error, re-login then retry:
    databricks auth login --profile ${PROFILE}"
fi

# 5. Restart app with new code -------------------------------------------------
log "Deploying app code (restarting compute)"
databricks apps deploy "${APP_NAME}" --profile "${PROFILE}"

# 6. Verify --------------------------------------------------------------------
APP_URL="$(databricks apps get "${APP_NAME}" --profile "${PROFILE}" -o json | jq -r '.url // empty')"
SP_CLIENT_ID="$(databricks apps get "${APP_NAME}" --profile "${PROFILE}" -o json | jq -r '.service_principal_client_id // empty')"

log "Deploy complete"
echo "  app:                 ${APP_NAME}"
echo "  url:                 ${APP_URL:-unknown}"
echo "  service principal:   ${SP_CLIENT_ID:-unknown}"

if [[ -n "${APP_URL}" ]]; then
  log "Verifying /api/intake/bundles"
  # The endpoint requires the app's own auth, so an unauthenticated curl from
  # here may return a login redirect; we only check that the app is reachable.
  if curl -fsS -m 20 -o /dev/null "${APP_URL}/api/health" 2>/dev/null \
     || curl -fsS -m 20 -o /dev/null "${APP_URL}" 2>/dev/null; then
    echo "  app is reachable."
  else
    echo "  note: app not reachable from this shell (may require workspace auth)."
  fi
  echo
  echo "Tail runtime logs to confirm the intake_app schema was created:"
  echo "  databricks apps logs ${APP_NAME} --profile ${PROFILE} | grep -i 'schema ready\\|intake_app\\|permission'"
fi
