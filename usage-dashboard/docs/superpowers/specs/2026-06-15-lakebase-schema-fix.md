# Lakebase Schema Fix — Dashboard Route Rewrite

## Goal

Rewrite the three Lakebase routes in `usage-dashboard` to query the real backend schema (`intake_app.intake_bundles`) instead of the non-existent `app.*` tables written during early development.

## Background

The `luma` (aaron/) app writes intake data to `intake_app.intake_bundles` in the shared Lakebase project (`projects/dais-2026-app/branches/production`). The dashboard was scaffolded against a hypothetical four-table schema (`app.sms_sessions`, `app.coverage_gaps`, `app.facility_recommendations`, `app.intake_bundles`) that was never implemented. All three dashboard Lakebase routes currently return errors at runtime.

The `usage-dashboard` SP (`a61969c0-ecfc-4051-814e-66dff32039e1`) has been granted `USAGE` + `SELECT` on `intake_app` by the project owner (done manually on 2026-06-15).

## Architecture

Single-file change: `server/routes/lakebase/intake-routes.ts`. No backend changes, no new files, no client type changes except removing the unused `status` field from `IntakeSession`.

```
intake_app.intake_bundles
  id UUID
  session_id UUID
  symptom_summary TEXT          -- maps to IntakeSession.symptoms
  location_evidence JSONB
  chosen_location JSONB         -- ->>'district', ->>'state'
  geo_confidence DOUBLE PRECISION
  nearest_facility JSONB        -- ->>'name', ->>'distanceKm'
  facility_confidence DOUBLE PRECISION
  has_coverage_gap BOOLEAN
  created_at TIMESTAMPTZ
```

## Changes

### `server/routes/lakebase/intake-routes.ts`

**`/api/lakebase/intakes/stats`** — rewrite SQL:
```sql
SELECT
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE has_coverage_gap) AS coverage_gap_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
    / NULLIF(COUNT(*), 0), 1) AS coverage_gap_pct,
  ROUND(AVG((nearest_facility->>'distanceKm')::numeric)
    FILTER (WHERE has_coverage_gap), 1) AS avg_gap_distance_km,
  ROUND(AVG(facility_confidence)::numeric, 2) AS avg_facility_confidence
FROM intake_app.intake_bundles
```

**`/api/lakebase/intakes`** — rewrite SQL:
```sql
SELECT
  id,
  symptom_summary AS symptoms,
  chosen_location->>'district' AS district,
  chosen_location->>'state'    AS state,
  has_coverage_gap,
  (nearest_facility->>'distanceKm')::numeric AS nearest_distance_km,
  nearest_facility->>'name'    AS facility_name,
  NULL::numeric                AS recommended_distance_km,
  geo_confidence,
  facility_confidence,
  created_at
FROM intake_app.intake_bundles
ORDER BY created_at DESC
LIMIT 50
```

**`/api/lakebase/gaps-by-state`** — rewrite SQL:
```sql
SELECT
  chosen_location->>'state' AS state,
  COUNT(*) AS session_count,
  COUNT(*) FILTER (WHERE has_coverage_gap) AS gap_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
    / NULLIF(COUNT(*), 0), 1) AS gap_pct
FROM intake_app.intake_bundles
WHERE chosen_location->>'state' IS NOT NULL
GROUP BY chosen_location->>'state'
ORDER BY gap_pct DESC
```

### `client/src/lib/intakeApi.ts`

Remove `status: string` from `IntakeSession`. No other changes.

## Error Handling

- Keep existing `isMissingTable` guard (`42P01`) on all three routes — handles the case where `luma` hasn't run its schema init yet.
- JSONB casts to `::numeric` return `NULL` on missing/null values; `AVG` and `ROUND` handle NULLs gracefully — no extra error handling needed.
- `status` derivation: client already computes `isGap` from `has_coverage_gap` and `nearest_distance_km` (see `SessionsPage.tsx:29`). No UI changes required.

## Out of Scope

- No changes to `OverviewPage`, `DistrictPage`, `SessionsPage`, or `stateNormalization.ts`
- No backend (`luma`) changes
- No new Lakebase tables or views
- No deployment configuration changes
