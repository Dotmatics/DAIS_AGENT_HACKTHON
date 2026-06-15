# India Health Access Dashboard — Design Spec

**Date:** 2026-06-15  
**App:** `dais-2026-app` (operator analytics dashboard)  
**Deadline:** June 16 2026, 2:30 PM PT

---

## Overview

A three-page analytics dashboard for health system operators. Primary story: "The intake agent is helping people in underserved areas find care — and here's where it's failing to find care nearby." The dashboard reads agent activity data from four Lakebase tables (`app.sms_sessions`, `app.coverage_gaps`, `app.facility_recommendations`, `app.sms_messages`) and health indicator data from Unity Catalog (NFHS-5).

**Audience:** Health program managers, policy analysts, hackathon judges.  
**Primary question answered:** Where are coverage gaps, and how do they correlate with poor health outcomes?

---

## Aesthetic

**Editorial Light** — cream (`#faf8f5`) background, Georgia/serif for display text, monospace for data labels and metadata, ruled lines as section dividers.

- Background: `#faf8f5`
- Primary: `#0B2026` (Databricks dark)
- Accent/alert: `#FF3621` (Databricks red) — used for gap indicators, KPI borders, high-gap states
- Success/match: `#2a7a6f` (teal) — used for matched sessions
- Border: `#ddd` / `#eee`
- Display font: Georgia, serif
- Data labels: monospace, uppercase, letter-spacing 0.08–0.12em

---

## Data Sources

### Lakebase tables (written by `aaron/` agent, queried via Express routes)

Four normalized tables in the `app` schema:

| Table | Key columns |
|-------|-------------|
| `app.sms_sessions` | `id`, `phone`, `status`, `postal_code`, `age`, `symptoms`, `district`, `state`, `user_lat`, `user_lon`, `created_at` |
| `app.sms_messages` | `id`, `session_id`, `direction`, `body`, `created_at` |
| `app.facility_recommendations` | `id`, `session_id`, `facility_name`, `facility_phone`, `distance_km`, `specialties`, `rank`, `is_nearest_appropriate`, `created_at` |
| `app.coverage_gaps` | `id`, `session_id`, `nearest_distance_km`, `gap_threshold_km`, `has_coverage_gap`, `symptoms`, `postal_code`, `created_at` |

**Confidence scores** (`geo_confidence`, `facility_confidence`) will be added to the schema by the agent teammate. Dashboard treats them as optional until present — KPIs show `—` if columns are absent.

### Express routes (dashboard server, `intake-routes.ts`)

**`GET /api/lakebase/intakes/stats`** — aggregate stats:
```sql
SELECT
  COUNT(DISTINCT s.id) AS total_sessions,
  COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true) AS coverage_gap_count,
  ROUND(100.0 * COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true)
    / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS coverage_gap_pct,
  ROUND(AVG(cg.nearest_distance_km) FILTER (WHERE cg.has_coverage_gap = true), 1) AS avg_gap_distance_km
FROM app.sms_sessions s
LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
```

**`GET /api/lakebase/intakes`** — last 50 sessions with gap and top recommendation joined:
```sql
SELECT
  s.id, s.symptoms, s.district, s.state, s.status, s.created_at,
  cg.has_coverage_gap, cg.nearest_distance_km,
  fr.facility_name, fr.distance_km AS recommended_distance_km
FROM app.sms_sessions s
LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
LEFT JOIN app.facility_recommendations fr ON fr.session_id = s.id AND fr.rank = 1
ORDER BY s.created_at DESC
LIMIT 50
```

**`GET /api/lakebase/gaps-by-state`** — gap rate per state for Overview bar chart:
```sql
SELECT
  s.state,
  COUNT(DISTINCT s.id) AS session_count,
  COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true) AS gap_count,
  ROUND(100.0 * COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true)
    / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS gap_pct
FROM app.sms_sessions s
LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
WHERE s.state IS NOT NULL
GROUP BY s.state
ORDER BY gap_pct DESC
```

All three routes handle missing tables gracefully (Postgres error code `42P01` → return empty/zeroed response).

### Unity Catalog (via `useAnalyticsQuery`)

| Query key | Used on |
|-----------|---------|
| `state_summary` | Overview — NFHS-5 national KPIs + state table |
| `district_health_indicators` | Districts — metric bars on district cards |

`facilities_by_state` query is retired.

### Gap threshold

Client-side React context (`GapThresholdContext`), default 50km. The `/api/lakebase/intakes` route returns `nearest_distance_km` for every session, so the UI re-evaluates `has_coverage_gap` client-side against the current threshold (overriding the server-computed boolean). This means the slider updates counts and status without a refetch.

### State name normalization

NFHS-5 uses `state_ut` (e.g. "Uttar Pradesh"); `sms_sessions` uses `state` (free text from pincode lookup, e.g. "Uttar Pradesh" or "UP"). A static normalization map is required to join them in the Overview state table. Implementation will include a `NORMALIZATION_MAP` constant for known variants.

---

## Shared Header

Dark `#0B2026` header across all pages:
- Left: ♥ icon + "India Health Access" (Georgia serif, white)
- Center: Nav links — Overview, Districts, Sessions (active = `#FF3621` pill)
- Right: ⚙ Settings icon — opens a slide-over or modal panel

**Settings panel** contains:
- Gap threshold slider: 10km–100km, default 50km
- Description: "Sessions where the nearest facility is farther than this are flagged as coverage gaps."
- Affects: gap counts on Overview, district card gap rate, Sessions feed filter

---

## Page 1: Overview

**Route:** `/`  
**Heading:** "India Community Health Overview" + "JUNE 2026" dateline (monospace)  
**Divider:** 2px `#0B2026` rule below heading

### Section 1 — Agent Activity KPIs (Lakebase)
Four KPI cards in a 4-column grid, each with a top rule:
- Total Sessions (`#FF3621` rule)
- Coverage Gaps (`#FF3621` rule, value in `#FF3621`)
- Avg Confidence (`#0B2026` rule)
- Gap Rate (`#0B2026` rule)

### Section 2 — Two-column row
**Left:** Coverage Gaps by State — horizontal bar chart, bars in `#FF3621`, state names in monospace, sorted descending by gap rate. Data: `GET /api/lakebase/gaps-by-state` → `gap_pct` per `state`.

**Right:** National Health Indicators (NFHS-5) — 2×2 grid of mini-KPIs (institutional births, health insurance, clean water, sanitation). Each with a `#0B2026` top rule. Data: `state_summary` query averages.

### Section 3 — State Summary Table
Full-width table. Columns: State, Sessions, Gap Rate, Inst. Births %, Insurance %.  
Gap Rate column values in `#FF3621` when >50%.  
Data: `gaps-by-state` route for session/gap columns; `state_summary` query for NFHS-5 columns. These are separate columns merged in the UI by state name using `NORMALIZATION_MAP`.

---

## Page 2: Districts

**Route:** `/districts`  
**Heading:** "District Health & Coverage"  
**Controls:** State filter dropdown (right of heading)

### Layout: Two-column
**Left column:**
- Choropleth map of India **states** using **react-simple-maps** + India states GeoJSON (36 states/UTs)
- Fill color: white → `#FF3621` gradient based on `gap_pct` from `GET /api/lakebase/gaps-by-state`
- Hover tooltip: state name, gap rate, session count, NFHS-5 institutional births %
- No data states: `#eee` fill
- Legend: inline below map (High gap >50%, Medium, Low, No data)
- State-level chosen for demo reliability: clean GeoJSON, reliable name matching via `NORMALIZATION_MAP`

**Right column:**
- District cards, sorted by gap rate descending (gap rate = `gap_count / session_count` from `gaps-by-state`, scoped to selected state)
- Each card: left border color = gap severity (`#FF3621` high >50%, `#f5a89a` medium 25–50%, `#eee` low)
- Card content: district name (Georgia serif), gap rate (right-aligned), NFHS-5 metric bars for institutional births + water access from `district_health_indicators`
- Metric bars: thin (3px), cream background, `#FF3621` fill for health metrics, `#0B2026` (40% opacity) for infrastructure metrics

**Note:** District cards show NFHS-5 health indicators (from UC) alongside the state-level gap rate. Per-district gap data is not available from `sms_sessions` reliably enough for demo — cards show the state gap rate as context.

---

## Page 3: Sessions

**Route:** `/sessions`  
**Heading:** "Agent Session Activity"

### Section 1 — Stats Row
Three KPI cards (3-column grid):
- Coverage Gaps (`#FF3621` top rule, value in `#FF3621`)
- Avg Gap Distance in km (`#0B2026` rule) — `avg_gap_distance_km` from `/api/lakebase/intakes/stats`
- Avg Facility Confidence (`#0B2026` rule)

### Section 2 — Sessions Feed
Table of last 50 intake sessions from `/api/lakebase/intakes`.

Columns: Status | Symptoms | Location | Confidence | Time

- **Status**: "⚠ GAP" in `#FF3621` bold (when `has_coverage_gap = true` AND distance > threshold) or "✓ MATCHED" in `#2a7a6f` bold
- **Symptoms**: `symptoms` field from `sms_sessions`
- **Location**: `district`, `state` (flat columns from `sms_sessions`)
- **Confidence**: show `geo_confidence` or `facility_confidence` (whichever is more relevant — facility for matched, geo for gaps)
- **Time**: relative time from `created_at`

Row hover: subtle `#f0ede8` background. Gap rows have a faint `#FF3621` left border.

---

## Routing & Navigation

Current routes `/districts` and `/facilities` are replaced:

| Route | Page | Notes |
|-------|------|-------|
| `/` | Overview | Unchanged path |
| `/districts` | Districts | Enriched with map + gap data |
| `/sessions` | Sessions | Replaces `/facilities` |

`smoke.spec.ts` must be updated: lakebase plugin page path changes from `/facilities` to `/sessions`, expected text changes to "Agent Session Activity".

---

## Server Routes (Lakebase)

Replace `todo-routes.ts` with `intake-routes.ts`:

**`GET /api/lakebase/intakes/stats`**  
Returns aggregate stats via JOIN of `app.sms_sessions` + `app.coverage_gaps`. If tables don't exist (error code `42P01`), returns zeroed object — no crash.

**`GET /api/lakebase/intakes`**  
Returns last 50 sessions via JOIN of `app.sms_sessions` + `app.coverage_gaps` + `app.facility_recommendations` (rank=1, with `DISTINCT ON (s.id)` to guard against duplicate rank-1 rows). Same graceful missing-table handling.

**`GET /api/lakebase/gaps-by-state`**  
Returns gap rate per state via JOIN of `app.sms_sessions` + `app.coverage_gaps`. Same graceful missing-table handling.

No writes — the dashboard is read-only against Lakebase.

---

## Map Implementation

- Library: `react-simple-maps`
- GeoJSON: India district boundaries — source from a public CDN or bundled asset
- Projection: Mercator, centered on India (~78°E, 22°N)
- Color scale: `d3-scale` `scaleSequential` with `interpolateReds`, domain [0, 1] (gap rate)
- Tooltip: custom HTML tooltip on hover, positioned relative to cursor
- Performance: memoize color scale and district gap rate map; avoid recomputing on every render

---

## Settings / Gap Threshold

- Stored in React context (`GapThresholdContext`), default 50km
- Accessed via `useGapThreshold()` hook
- Settings panel: sheet/modal, opened by ⚙ header button
- Slider: 10–100km range, 5km steps
- No persistence (in-memory only — resets on reload, acceptable for demo)

---

## What Is NOT in Scope

- Writing to Lakebase from the dashboard (read-only)
- Empty-state handling (teammate will seed demo data)
- The `/facilities` page content (retired)
- Mobile-optimized map (desktop demo only)
