# Lakebase Schema Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite three dashboard Lakebase routes to query `intake_app.intake_bundles` (the real backend schema) instead of the non-existent `app.*` tables.

**Architecture:** All SQL in `server/routes/lakebase/intake-routes.ts` is replaced; the client type `IntakeSession` loses its unused `status` field. No new files, no backend changes, no UI changes. The `usage-dashboard` SP already has `USAGE + SELECT` on `intake_app` (granted 2026-06-15).

**Tech Stack:** TypeScript, node-postgres (via `@databricks/appkit` lakebase plugin), Postgres JSONB operators, AppKit Express routes.

---

### Task 1: Rewrite the three Lakebase server routes

**Files:**
- Modify: `usage-dashboard/server/routes/lakebase/intake-routes.ts`

**Context for the implementer:**

The file currently has three `app.get(...)` handlers registered inside `appkit.server.extend()`. All three query tables that don't exist (`app.sms_sessions`, `app.coverage_gaps`, etc.). Replace only the SQL strings inside each handler. Keep the route paths, error handling structure, and `isMissingTable` guard exactly as-is.

The real table is `intake_app.intake_bundles`. Its relevant columns:
- `id UUID`, `symptom_summary TEXT`, `geo_confidence DOUBLE PRECISION`, `facility_confidence DOUBLE PRECISION`, `has_coverage_gap BOOLEAN`, `created_at TIMESTAMPTZ`
- `chosen_location JSONB` — keys: `district`, `state`
- `nearest_facility JSONB` — keys: `name`, `distanceKm`

**CRITICAL — pg driver type coercion:** `node-postgres` returns `COUNT(*)` (bigint) and `ROUND()`/`NUMERIC` results as **JS strings**, not numbers. Cast all numeric outputs in SQL to get proper JS numbers:
- `COUNT(*)::int` → JS `number`
- `ROUND(...)::float8` → JS `number`
- `(jsonb->>'key')::float8` → JS `number`

- [ ] **Step 1: Read the current file**

Read `usage-dashboard/server/routes/lakebase/intake-routes.ts` in full so you understand the exact handler structure before touching it.

- [ ] **Step 2: Replace the `/api/lakebase/intakes/stats` SQL**

Find the `app.get('/api/lakebase/intakes/stats', ...)` handler. Replace its `appkit.lakebase.query(...)` call with:

```typescript
const result = await appkit.lakebase.query(`
  SELECT
    COUNT(*)::int AS total_sessions,
    COUNT(*) FILTER (WHERE has_coverage_gap)::int AS coverage_gap_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
      / NULLIF(COUNT(*), 0), 1)::float8 AS coverage_gap_pct,
    ROUND(AVG((nearest_facility->>'distanceKm')::numeric)
      FILTER (WHERE has_coverage_gap), 1)::float8 AS avg_gap_distance_km,
    ROUND(AVG(facility_confidence)::numeric, 2)::float8 AS avg_facility_confidence
  FROM intake_app.intake_bundles
`);
res.json(result.rows[0] ?? {});
```

Keep the surrounding `try/catch` and `isMissingTable` fallback exactly as they are. The fallback object (`{ total_sessions: 0, coverage_gap_count: 0, ... }`) stays unchanged.

- [ ] **Step 3: Replace the `/api/lakebase/intakes` SQL**

Find the `app.get('/api/lakebase/intakes', ...)` handler. Replace its query with:

```typescript
const result = await appkit.lakebase.query(`
  SELECT
    id,
    symptom_summary AS symptoms,
    chosen_location->>'district' AS district,
    chosen_location->>'state'    AS state,
    has_coverage_gap,
    (nearest_facility->>'distanceKm')::float8 AS nearest_distance_km,
    nearest_facility->>'name'    AS facility_name,
    NULL::float8                 AS recommended_distance_km,
    geo_confidence,
    facility_confidence,
    created_at
  FROM intake_app.intake_bundles
  ORDER BY created_at DESC
  LIMIT 50
`);
res.json(result.rows);
```

Keep the surrounding `try/catch` and `isMissingTable` fallback (`res.json([])`) unchanged.

- [ ] **Step 4: Replace the `/api/lakebase/gaps-by-state` SQL**

Find the `app.get('/api/lakebase/gaps-by-state', ...)` handler. Replace its query with:

```typescript
const result = await appkit.lakebase.query(`
  SELECT
    chosen_location->>'state'                              AS state,
    COUNT(*)::int                                          AS session_count,
    COUNT(*) FILTER (WHERE has_coverage_gap)::int          AS gap_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
      / NULLIF(COUNT(*), 0), 1)::float8                   AS gap_pct
  FROM intake_app.intake_bundles
  WHERE chosen_location->>'state' IS NOT NULL
  GROUP BY chosen_location->>'state'
  ORDER BY gap_pct DESC
`);
res.json(result.rows);
```

Keep the surrounding `try/catch` and `isMissingTable` fallback (`res.json([])`) unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON
git add usage-dashboard/server/routes/lakebase/intake-routes.ts
git commit -m "Rewrite lakebase routes to query intake_app.intake_bundles"
```

---

### Task 2: Remove unused `status` field from `IntakeSession`

**Files:**
- Modify: `usage-dashboard/client/src/lib/intakeApi.ts`

**Context for the implementer:**

`IntakeSession` currently has a `status: string` field that was designed for the old `app.sms_sessions` table. The new query doesn't return it, and the UI never uses it (gap status is computed from `has_coverage_gap` and `nearest_distance_km` client-side). Remove it.

- [ ] **Step 1: Read the current file**

Read `usage-dashboard/client/src/lib/intakeApi.ts` to confirm the current `IntakeSession` shape.

- [ ] **Step 2: Remove the `status` field**

In `IntakeSession`, delete this line:
```typescript
  status: string;
```

The interface after the change:
```typescript
export interface IntakeSession {
  id: string;
  symptoms: string | null;
  district: string | null;
  state: string | null;
  created_at: string;
  has_coverage_gap: boolean | null;
  nearest_distance_km: number | null;
  facility_name: string | null;
  recommended_distance_km: number | null;
  geo_confidence: number | null;
  facility_confidence: number | null;
}
```

- [ ] **Step 3: Verify no type errors**

Run from the `usage-dashboard` directory:
```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/usage-dashboard
npm run typecheck 2>&1 || npx tsc --noEmit 2>&1
```

Expected: no errors. If `status` was referenced in any `.tsx` file, the compiler will report it here. Fix any errors before continuing — but there should be none (the UI derives gap status from `isGap`, not `status`).

- [ ] **Step 4: Commit**

```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON
git add usage-dashboard/client/src/lib/intakeApi.ts
git commit -m "Remove unused status field from IntakeSession"
```

---

### Task 3: Deploy and verify

**Files:** None modified — this is a deploy + smoke check task.

**Context for the implementer:**

The `usage-dashboard` app uses a two-step manual deploy (bundle deploy panics due to a CLI rename bug — use import-dir + apps deploy instead).

- [ ] **Step 1: Deploy to Databricks**

Run from the `usage-dashboard` directory:
```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/usage-dashboard
databricks workspace import-dir . /Workspace/Users/aaron_dais_2026@icloud.com/.bundle/usage-dashboard/default/files --overwrite --profile dais-2026-lakebase
databricks apps deploy usage-dashboard --source-code-path /Workspace/Users/aaron_dais_2026@icloud.com/.bundle/usage-dashboard/default/files --profile dais-2026-lakebase
```

Expected: deploy completes without error. The second command streams progress until `RUNNING`.

- [ ] **Step 2: Verify app is running**

```bash
databricks apps get usage-dashboard --profile dais-2026-lakebase -o json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['app_status']['state'])"
```

Expected output: `RUNNING`

- [ ] **Step 3: Smoke-check the three routes**

The live URL is `https://usage-dashboard-7474644358787296.aws.databricksapps.com`. Hit each route (you'll need to be authenticated — use the app's browser session or check if the routes are publicly accessible via the app):

1. Open the app in a browser and navigate to the Overview page — the "Agent Activity" KPI section should show numbers (not blank/error).
2. Navigate to the Sessions page — the table should render (empty rows if no data yet is fine; an error banner is not fine).
3. Navigate to the Districts page — the choropleth should render without a gap-data error.

If any route returns a 500, check the app logs:
```bash
databricks apps get usage-dashboard --profile dais-2026-lakebase -o json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin).get('app_status'), indent=2))"
```
