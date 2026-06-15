# Luma — Rural SMS Health Agent

Databricks hackathon app: mock SMS intake for location, age, and symptoms, with facility recommendations from the Virtue Foundation dataset and coverage gap tracking in Lakebase.

## Demo (local)

**Requirements:** Node.js 22+ (23 recommended), `hackathon-dais` CLI profile.

```bash
cd aaron
cp .env.example .env   # fill in values below
npm install            # use Node 22+
npm run dev
```

Open http://localhost:8000 and use the **SMS Health Check** tab.

**Demo conversation:**
1. "I don't feel well"
2. "504273" (pincode)
3. "45" (age)
4. "fever and chest pain" (symptoms)

**curl:**
```bash
curl -X POST http://localhost:8000/api/sms/inbound \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","message":"504273 age 45 fever"}'
```

## `.env` for local dev

| Variable | Value |
|----------|--------|
| `DATABRICKS_HOST` | `https://dbc-90be8f46-8e3a.cloud.databricks.com` |
| `DATABRICKS_TOKEN` | Your PAT (or use CLI profile) |
| `DATABRICKS_WAREHOUSE_ID` | `e4e23f31c3028908` |
| `DATABRICKS_SERVING_ENDPOINT_NAME` | `databricks-claude-opus-4-8` |
| `LAKEBASE_ENDPOINT` | `projects/aaron-health/branches/production/endpoints/primary` |
| `PGHOST` | From `databricks postgres list-endpoints projects/aaron-health/branches/production` |
| `PGDATABASE` | `databricks_postgres` |

Generate a Lakebase OAuth token for local Postgres:
```bash
databricks postgres generate-database-credential \
  projects/aaron-health/branches/production/endpoints/primary \
  --profile hackathon-dais
```
Use the token as `PGPASSWORD` when connecting (AppKit handles this when deployed).

## Deploy to Databricks

```bash
cd aaron
npm install
npm run build

# Upload source to workspace (or use databricks apps deploy which syncs automatically)
databricks sync . /Workspace/Users/anna.sobolewska@gmail.com/.bundle/luma/default/files

# One-time / after fresh app create: grant app SP access to Virtue Foundation catalog
npm run setup:permissions

# Validate, deploy, and start
databricks warehouses start e4e23f31c3028908 --profile trialbridge
databricks apps deploy --profile trialbridge --auto-approve
```

Or use the combined helper (build + grant + deploy):

```bash
DATABRICKS_CONFIG_PROFILE=trialbridge npm run setup:deploy
```

**Analytics permission fix:** The app runs SQL as its service principal (the `luma` app SP), not as you. If Analytics shows `INSUFFICIENT_PERMISSIONS` on catalog `databricks_virtue_foundation_dataset_dais_2026`, run:

```bash
npm run setup:permissions
```

This uses the Databricks CLI to grant `USE CATALOG`, `USE SCHEMA`, and `SELECT` to the app SP. Requires catalog admin (or MANAGE) on your user account.

App URL (when running): https://aaron-7474656068082956.aws.databricksapps.com

If deploy fails, check logs in the Databricks UI (**Apps → luma → Logs**). App logs require OAuth CLI auth:
```bash
databricks auth login --host https://dbc-90be8f46-8e3a.cloud.databricks.com --profile trialbridge
```

## Architecture

- **Mock SMS UI** + `POST /api/sms/inbound` — multi-turn intake (pincode → age → symptoms)
- **Lakebase** (`aaron-health` project) — sessions, messages, recommendations, coverage gaps
- **Analytics SQL** — facility proximity queries (Haversine) on Virtue Foundation UC tables
- **Agent Bricks** — `intake` agent with `analytics` + `lakebase` plugin tools

## Known limitations

- **Lakebase synced tables failed** — the Virtue Foundation catalog is Delta Sharing (read-only); CDF cannot be enabled. Facility lookup uses **Analytics SQL warehouse** instead.
- **Deploy** — first cloud deploy may need log review in the workspace UI if package install fails.

## Data

`databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`
- `facilities`, `india_post_pincode_directory`, `nfhs_5_district_health_indicators`
