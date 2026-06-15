# India Health Access Dashboard — Design Spec

**Date:** 2026-06-15  
**App:** `dais-2026-app` (operator analytics dashboard)  
**Deadline:** June 16 2026, 2:30 PM PT

---

## Overview

A three-page analytics dashboard for health system operators. Primary story: "The intake agent is helping people in underserved areas find care — and here's where it's failing to find care nearby." The dashboard reads agent activity data from Lakebase (`app.intake_bundles`) and health indicator data from Unity Catalog (NFHS-5).

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

| Data | Source | Access pattern |
|------|--------|----------------|
| `total_sessions`, `coverage_gap_count`, `avg_geo_confidence`, `avg_facility_confidence`, `coverage_gap_pct` | Lakebase `app.intake_bundles` | Express route `GET /api/lakebase/intakes/stats` |
| Recent intake sessions (last 50) | Lakebase `app.intake_bundles` | Express route `GET /api/lakebase/intakes` |
| State/district health indicators | UC `nfhs_5_district_health_indicators` | `useAnalyticsQuery('state_summary')`, `useAnalyticsQuery('district_health_indicators')` |
| Facility counts | UC `facilities` | `useAnalyticsQuery('facilities_by_state')` (existing, may be retired) |

**Gap threshold** is a client-side config value (default 50km) stored in React context. It filters the intake sessions client-side — the Lakebase query returns all sessions, the UI applies the threshold. This means no re-fetch when the user changes the threshold.

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
**Left:** Coverage Gaps by State — horizontal bar chart, bars in `#FF3621`, state names in monospace, sorted descending by gap rate. Data: aggregate from `intake_bundles` grouped by `chosen_location->>'state'`.

**Right:** National Health Indicators (NFHS-5) — 2×2 grid of mini-KPIs (institutional births, health insurance, clean water, sanitation). Each with a `#0B2026` top rule. Data: `state_summary` query averages.

### Section 3 — State Summary Table
Full-width table. Columns: State, Sessions, Gap Rate, Inst. Births %, Insurance %.  
Gap Rate column values in `#FF3621` when >50%.  
Data: `intake_bundles` aggregated by `chosen_location->>'state'` for session/gap columns; `state_summary` for NFHS-5 columns. These are displayed as separate columns — no SQL join needed, both keyed by state name in the UI. Note: state name normalization (e.g. "Uttar Pradesh" vs "UP") may require a client-side mapping.

---

## Page 2: Districts

**Route:** `/districts`  
**Heading:** "District Health & Coverage"  
**Controls:** State filter dropdown (right of heading)

### Layout: Two-column
**Left column:**
- Choropleth map of India districts using **react-simple-maps** + India district GeoJSON
- Fill color: white → `#FF3621` gradient based on coverage gap rate per district
- Hover tooltip: district name, gap rate, NFHS-5 institutional births %, nearest facility distance
- No data districts: `#eee` fill
- Legend: inline below map (High gap >50%, Medium, Low, No data)

**Right column:**
- District cards, sorted by gap rate descending
- Each card: left border color = gap severity (`#FF3621` high, `#f5a89a` medium, `#eee` low)
- Card content: district name (Georgia serif), gap rate (right-aligned), metric bars for institutional births + water access
- Metric bars: thin (3px), cream background, `#FF3621` fill for health metrics, `#0B2026` (40% opacity) for infrastructure metrics

**Map data:** Gap rate per district computed client-side from `intake_bundles` (grouped by `chosen_location->>'district'`). NFHS-5 overlay from `district_health_indicators` query. Joined by district name.

---

## Page 3: Sessions

**Route:** `/sessions`  
**Heading:** "Agent Session Activity"

### Section 1 — Stats Row
Three KPI cards (3-column grid):
- Coverage Gaps (`#FF3621` top rule, value in `#FF3621`)
- Avg Gap Distance in km (`#0B2026` rule) — avg of `nearest_facility->>'distance_km'` where `has_coverage_gap = true`
- Avg Facility Confidence (`#0B2026` rule)

### Section 2 — Sessions Feed
Table of last 50 intake sessions from `/api/lakebase/intakes`.

Columns: Status | Symptoms | Location | Confidence | Time

- **Status**: "⚠ GAP" in `#FF3621` bold (when `has_coverage_gap = true` AND distance > threshold) or "✓ MATCHED" in `#2a7a6f` bold
- **Symptoms**: `symptom_summary` field
- **Location**: `chosen_location->>'district'`, `chosen_location->>'state'`
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
Returns aggregate stats from `app.intake_bundles`. If table doesn't exist (TableMissing error code `42P01`), returns zeroed object — no crash.

**`GET /api/lakebase/intakes`**  
Returns last 50 rows ordered by `created_at DESC`. Same graceful missing-table handling.

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
