#!/usr/bin/env bash
# Grant the Luma app service principal read access to the Virtue Foundation
# Unity Catalog. Required for Analytics queries and facility lookup at runtime.
set -euo pipefail

APP_NAME="${DATABRICKS_APP_NAME:-luma}"
CATALOG="${VIRTUE_FOUNDATION_CATALOG:-databricks_virtue_foundation_dataset_dais_2026}"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-${DATABRICKS_PROFILE:-trialbridge}}"

echo "Granting catalog access for app '${APP_NAME}' on catalog '${CATALOG}' (profile: ${PROFILE})"

CLIENT_ID="$(
  databricks apps get "${APP_NAME}" --profile "${PROFILE}" -o json \
    | jq -r '.service_principal_client_id // empty'
)"

if [[ -z "${CLIENT_ID}" ]]; then
  echo "error: could not resolve service_principal_client_id for app '${APP_NAME}'." >&2
  echo "Deploy the app first: databricks bundle deploy && databricks apps deploy ${APP_NAME}" >&2
  exit 1
fi

echo "App service principal client id: ${CLIENT_ID}"

databricks grants update catalog "${CATALOG}" --profile "${PROFILE}" --json "$(jq -n \
  --arg principal "${CLIENT_ID}" \
  '{
    changes: [{
      principal: $principal,
      add: ["USE CATALOG", "USE SCHEMA", "SELECT"]
    }]
  }')"

echo "Catalog grants updated. Current assignments:"
databricks grants get catalog "${CATALOG}" --profile "${PROFILE}" -o json \
  | jq --arg id "${CLIENT_ID}" '.privilege_assignments[] | select(.principal == $id)'
