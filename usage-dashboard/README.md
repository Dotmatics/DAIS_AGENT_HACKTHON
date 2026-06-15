# Usage Dashboard

India Community Health Access dashboard built for DAIS 2026 Hackathon. Visualizes NFHS-5 health indicators and facility coverage data alongside real-time intake session activity from the Luma agent.

**Live app:** https://usage-dashboard-7474644358787296.aws.databricksapps.com

## What It Does

- **Overview page** — national NFHS-5 health KPIs, coverage gap rates by state, state summary table
- **Sessions page** — intake session activity from the Luma agent
- **Districts page** — district-level health indicators with choropleth map and per-district metric bars

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express (Node.js)
- **Data**: Databricks AppKit — `useAnalyticsQuery` for SQL warehouse (NFHS-5 UC tables), Lakebase Postgres for intake session data
- **Maps**: react-simple-maps with bundled India GeoJSON

## Local Development

```bash
npm install
npm run dev
```

Requires a `.env` file:

```bash
cp .env.example .env
```

Key env vars: `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, `LAKEBASE_ENDPOINT`.

## Deploy

```bash
npm run build
databricks workspace import-dir dist /Workspace/Users/<user>/.bundle/usage-dashboard/default/files --profile <PROFILE> --overwrite
databricks apps deploy usage-dashboard --source-code-path /Workspace/Users/<user>/.bundle/usage-dashboard/default/files --profile <PROFILE>
```

Bundle variables (warehouse ID, Lakebase branch/database) are configured in `databricks.yml`.

## Project Structure

```
client/src/
  pages/            # OverviewPage, SessionsPage, DistrictPage
  lib/              # intakeApi.ts (Lakebase routes), stateNormalization.ts
  assets/           # india-states.json (bundled GeoJSON)
config/queries/     # state_summary.sql, district_health_indicators.sql
server/
  routes/lakebase/  # intake-routes.ts (sessions, gaps, stats)
databricks.yml      # bundle config (warehouse ID, Lakebase branch/database)
app.yaml            # app manifest
```

## Key Data Sources

| Source | Type | Used for |
|--------|------|----------|
| `intake_app.intake_bundles` | Lakebase Postgres | Session counts, coverage gaps |
| `catalog.nfhs5.*` | Unity Catalog (SQL warehouse) | NFHS-5 health indicators |

## Code Quality

```bash
npm run typecheck
npm run lint
npm run format
```
