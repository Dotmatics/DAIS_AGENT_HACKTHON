# India Health Access Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-page operator dashboard (Overview, Districts, Sessions) reading agent intake data from Lakebase and NFHS-5 data from Unity Catalog.

**Architecture:** Express server exposes three read-only Lakebase routes; React client fetches them via `fetch` and NFHS-5 data via `useAnalyticsQuery`; gap threshold stored in React context updates counts client-side without refetch.

**Tech Stack:** Databricks AppKit 0.38.1, React 19, react-simple-maps, d3-scale, d3-scale-chromatic, Tailwind CSS, TypeScript

---

## File Map

**New files:**
- `server/routes/lakebase/intake-routes.ts` — three read-only Lakebase routes
- `client/src/context/GapThresholdContext.tsx` — gap threshold React context + hook
- `client/src/lib/stateNormalization.ts` — NORMALIZATION_MAP constant
- `client/src/lib/intakeApi.ts` — typed fetch helpers for the three routes
- `client/src/pages/OverviewPage.tsx` — full rewrite
- `client/src/pages/DistrictPage.tsx` — full rewrite with choropleth map
- `client/src/pages/SessionsPage.tsx` — new (replaces FacilitiesPage)
- `client/src/components/SettingsPanel.tsx` — gap threshold slider sheet

**Modified files:**
- `server/server.ts` — swap todo-routes for intake-routes
- `client/src/App.tsx` — add GapThresholdProvider, /sessions route, SettingsPanel, remove /facilities
- `tests/smoke.spec.ts` — update selectors for new pages
- `config/queries/facilities_by_state.sql` — delete (retired)

---

### Task 1: Install dependencies

**Files:** `package.json`

- [ ] Run install:
```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/dais-2026-app
npm install react-simple-maps d3-scale d3-scale-chromatic
npm install --save-dev @types/d3-scale @types/d3-scale-chromatic
```
- [ ] Download India states TopoJSON as a local asset (avoids CDN 404 during demo):
```bash
curl -L "https://raw.githubusercontent.com/AshKyd/geojson-regions/master/countries/110m/IND/states.topojson" \
  -o client/src/assets/india-states.json
```
If that URL is unavailable, use the topojson from `topojson-client` or any India states topojson with a `name` or `ST_NM` property. Verify the file downloads and contains `"type":"Topology"`.

- [ ] Verify no peer dep errors, then commit:
```bash
git add package.json package-lock.json client/src/assets/india-states.json
git commit -m "Add map dependencies and bundle India states GeoJSON asset"
```

---

### Task 2: Server — intake-routes.ts

**Files:**
- Create: `server/routes/lakebase/intake-routes.ts`
- Modify: `server/server.ts`

- [ ] Create `server/routes/lakebase/intake-routes.ts`:

```typescript
import { Application } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: { extend(fn: (app: Application) => void): void };
}

const TABLE_MISSING = '42P01';

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string }).code === TABLE_MISSING;
}

export async function setupIntakeRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/lakebase/intakes/stats', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            COUNT(DISTINCT s.id) AS total_sessions,
            COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true) AS coverage_gap_count,
            ROUND(100.0 * COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true)
              / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS coverage_gap_pct,
            ROUND(AVG(cg.nearest_distance_km) FILTER (WHERE cg.has_coverage_gap = true), 1) AS avg_gap_distance_km
          FROM app.sms_sessions s
          LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
        `);
        res.json(result.rows[0] ?? {});
      } catch (err) {
        if (isMissingTable(err)) { res.json({ total_sessions: 0, coverage_gap_count: 0, coverage_gap_pct: 0, avg_gap_distance_km: null }); return; }
        console.error('intakes/stats failed:', err);
        res.status(500).json({ error: 'Failed to load stats' });
      }
    });

    app.get('/api/lakebase/intakes', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT DISTINCT ON (s.id)
            s.id, s.symptoms, s.district, s.state, s.status, s.created_at,
            cg.has_coverage_gap, cg.nearest_distance_km,
            fr.facility_name, fr.distance_km AS recommended_distance_km
          FROM app.sms_sessions s
          LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
          LEFT JOIN app.facility_recommendations fr ON fr.session_id = s.id AND fr.rank = 1
          ORDER BY s.id, s.created_at DESC
          LIMIT 50
        `);
        res.json(result.rows);
      } catch (err) {
        if (isMissingTable(err)) { res.json([]); return; }
        console.error('intakes failed:', err);
        res.status(500).json({ error: 'Failed to load intakes' });
      }
    });

    app.get('/api/lakebase/gaps-by-state', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
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
        `);
        res.json(result.rows);
      } catch (err) {
        if (isMissingTable(err)) { res.json([]); return; }
        console.error('gaps-by-state failed:', err);
        res.status(500).json({ error: 'Failed to load gap data' });
      }
    });
  });
}
```

- [ ] Update `server/server.ts`:

```typescript
import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { setupIntakeRoutes } from './routes/lakebase/intake-routes';

createApp({
  plugins: [analytics(), lakebase(), server()],
  async onPluginsReady(appkit) {
    await setupIntakeRoutes(appkit);
  },
}).catch(console.error);
```

- [ ] Delete old routes file:
```bash
rm /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/dais-2026-app/server/routes/lakebase/todo-routes.ts
```

- [ ] Commit:
```bash
git add server/
git commit -m "Replace todo-routes with intake-routes for agent session data"
```

---

### Task 3: Client lib — context, normalization, API helpers

**Files:**
- Create: `client/src/context/GapThresholdContext.tsx`
- Create: `client/src/lib/stateNormalization.ts`
- Create: `client/src/lib/intakeApi.ts`

- [ ] Create `client/src/context/GapThresholdContext.tsx`:

```typescript
import { createContext, useContext, useState } from 'react';

const GapThresholdContext = createContext<{
  threshold: number;
  setThreshold: (v: number) => void;
}>({ threshold: 50, setThreshold: () => {} });

export function GapThresholdProvider({ children }: { children: React.ReactNode }) {
  const [threshold, setThreshold] = useState(50);
  return (
    <GapThresholdContext.Provider value={{ threshold, setThreshold }}>
      {children}
    </GapThresholdContext.Provider>
  );
}

export function useGapThreshold() {
  return useContext(GapThresholdContext);
}
```

- [ ] Create `client/src/lib/stateNormalization.ts`:

```typescript
// Maps sms_sessions.state variants to NFHS-5 state_ut values
export const NORMALIZATION_MAP: Record<string, string> = {
  'UP': 'Uttar Pradesh',
  'MP': 'Madhya Pradesh',
  'UK': 'Uttarakhand',
  'HP': 'Himachal Pradesh',
  'J&K': 'Jammu & Kashmir',
  'JK': 'Jammu & Kashmir',
  'TN': 'Tamil Nadu',
  'AP': 'Andhra Pradesh',
  'WB': 'West Bengal',
  'MH': 'Maharashtra',
  'KA': 'Karnataka',
  'KL': 'Kerala',
  'RJ': 'Rajasthan',
  'GJ': 'Gujarat',
  'PB': 'Punjab',
  'HR': 'Haryana',
  'BR': 'Bihar',
  'JH': 'Jharkhand',
  'OD': 'Odisha',
  'OR': 'Odisha',
  'AS': 'Assam',
  'CG': 'Chhattisgarh',
  'DL': 'Delhi',
  'TS': 'Telangana',
  'GA': 'Goa',
};

export function normalizeState(state: string): string {
  return NORMALIZATION_MAP[state.trim()] ?? state.trim();
}
```

- [ ] Create `client/src/lib/intakeApi.ts`:

```typescript
export interface IntakeStats {
  total_sessions: number;
  coverage_gap_count: number;
  coverage_gap_pct: number;
  avg_gap_distance_km: number | null;
}

export interface IntakeSession {
  id: string;
  symptoms: string | null;
  district: string | null;
  state: string | null;
  status: string;
  created_at: string;
  has_coverage_gap: boolean | null;
  nearest_distance_km: number | null;
  facility_name: string | null;
  recommended_distance_km: number | null;
}

export interface GapByState {
  state: string;
  session_count: number;
  gap_count: number;
  gap_pct: number;
}

export async function fetchIntakeStats(): Promise<IntakeStats> {
  const res = await fetch('/api/lakebase/intakes/stats');
  if (!res.ok) throw new Error('Failed to fetch intake stats');
  return res.json();
}

export async function fetchIntakes(): Promise<IntakeSession[]> {
  const res = await fetch('/api/lakebase/intakes');
  if (!res.ok) throw new Error('Failed to fetch intakes');
  return res.json();
}

export async function fetchGapsByState(): Promise<GapByState[]> {
  const res = await fetch('/api/lakebase/gaps-by-state');
  if (!res.ok) throw new Error('Failed to fetch gaps by state');
  return res.json();
}
```

- [ ] Commit:
```bash
git add client/src/context/ client/src/lib/
git commit -m "Add GapThresholdContext, state normalization, and intake API helpers"
```

---

### Task 4: SettingsPanel component

**Files:**
- Create: `client/src/components/SettingsPanel.tsx`

- [ ] Create `client/src/components/SettingsPanel.tsx`:

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@databricks/appkit-ui/react';
import { useGapThreshold } from '../context/GapThresholdContext';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { threshold, setThreshold } = useGapThreshold();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle className="font-serif text-[#0B2026]">Dashboard Settings</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Coverage Gap Threshold
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1 accent-[#0B2026]"
              />
              <span className="text-sm font-mono font-bold text-[#0B2026] w-14 text-right">
                {threshold} km
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
              <span>10 km</span><span>100 km</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sessions where the nearest facility is farther than this are flagged as coverage gaps.
            Affects gap counts on Overview, Districts, and Sessions pages.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] Commit:
```bash
git add client/src/components/SettingsPanel.tsx
git commit -m "Add SettingsPanel component with gap threshold slider"
```

---

### Task 5: App.tsx — wire context, routes, settings

**Files:**
- Modify: `client/src/App.tsx`

- [ ] Replace `client/src/App.tsx` with:

```typescript
import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState, useEffect } from 'react';
import {
  Button, Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu, HeartPulse, Settings } from 'lucide-react';
import { GapThresholdProvider } from './context/GapThresholdContext';
import { SettingsPanel } from './components/SettingsPanel';
import { OverviewPage } from './pages/OverviewPage';
import { DistrictPage } from './pages/DistrictPage';
import { SessionsPage } from './pages/SessionsPage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-[#FF3621] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-[#FF3621] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { if (!isMobile) setMobileNavOpen(false); }, [isMobile]);

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">
      <header className="bg-[#0B2026] px-4 md:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#FF3621]" />
          <h1 className="text-lg font-serif font-bold text-white">India Health Access</h1>
        </div>
        <nav className="hidden md:flex gap-1 ml-4">
          <NavLink to="/" end className={navLinkClass}>Overview</NavLink>
          <NavLink to="/districts" className={navLinkClass}>Districts</NavLink>
          <NavLink to="/sessions" className={navLinkClass}>Sessions</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}
            className="text-white/70 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)}
              className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left">
          <SheetHeader><SheetTitle>Navigation</SheetTitle></SheetHeader>
          <nav className="flex flex-col gap-1 mt-4">
            <NavLink to="/" end className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Overview</NavLink>
            <NavLink to="/districts" className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Districts</NavLink>
            <NavLink to="/sessions" className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Sessions</NavLink>
          </nav>
        </SheetContent>
      </Sheet>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <main className="flex-1 p-4 md:p-6"><Outlet /></main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/districts', element: <DistrictPage /> },
      { path: '/sessions', element: <SessionsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <GapThresholdProvider>
      <RouterProvider router={router} />
    </GapThresholdProvider>
  );
}
```

- [ ] Commit:
```bash
git add client/src/App.tsx
git commit -m "Wire GapThresholdProvider, Sessions route, Settings button in App"
```

---

### Task 6: OverviewPage rewrite

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

- [ ] Replace full contents of `client/src/pages/OverviewPage.tsx`:

```typescript
import { useMemo, useEffect, useState } from 'react';
import { useAnalyticsQuery, Card, CardContent, CardHeader, CardTitle, Skeleton, Badge } from '@databricks/appkit-ui/react';
import { Activity, Droplets, Zap, Shield } from 'lucide-react';
import { fetchIntakeStats, fetchGapsByState, type IntakeStats, type GapByState } from '../lib/intakeApi';
import { normalizeState } from '../lib/stateNormalization';

const EMPTY = {};

function KpiCard({ title, value, sub, accent }: { title: string; value: string | null; sub?: string; accent?: boolean }) {
  return (
    <Card className="bg-white shadow-sm rounded-none border-t-4" style={{ borderTopColor: accent ? '#FF3621' : '#0B2026' }}>
      <CardContent className="pt-4 pb-4">
        {value === null ? <Skeleton className="h-8 w-20 mb-1" /> : (
          <p className="text-3xl font-serif font-bold" style={{ color: accent ? '#FF3621' : '#0B2026' }}>{value}</p>
        )}
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const params = useMemo(() => EMPTY, []);
  const { data: nfhs, loading: nfhsLoading } = useAnalyticsQuery('state_summary', params);
  const [stats, setStats] = useState<IntakeStats | null>(null);
  const [gapsByState, setGapsByState] = useState<GapByState[]>([]);

  useEffect(() => {
    fetchIntakeStats().then(setStats).catch(console.error);
    fetchGapsByState().then(setGapsByState).catch(console.error);
  }, []);

  const nfhsAvg = useMemo(() => {
    if (!nfhs || nfhs.length === 0) return null;
    const n = nfhs.length;
    return {
      births: (nfhs.reduce((s, r) => s + (r.avg_institutional_births_pct ?? 0), 0) / n).toFixed(1),
      water: (nfhs.reduce((s, r) => s + (r.avg_improved_water_pct ?? 0), 0) / n).toFixed(1),
      sanitation: (nfhs.reduce((s, r) => s + (r.avg_improved_sanitation_pct ?? 0), 0) / n).toFixed(1),
      insurance: (nfhs.reduce((s, r) => s + (r.avg_health_insurance_pct ?? 0), 0) / n).toFixed(1),
    };
  }, [nfhs]);

  // Client-side re-evaluate gap threshold on gapsByState (server uses 50km default)
  // gapsByState.gap_pct already reflects server threshold; displayed as-is for Overview
  const topGapStates = gapsByState.slice(0, 8);
  const maxGapPct = topGapStates.length > 0 ? topGapStates[0].gap_pct : 100;

  // Merge gapsByState + nfhs for state summary table
  const gapMap = useMemo(() => {
    const m: Record<string, GapByState> = {};
    gapsByState.forEach(g => { m[normalizeState(g.state)] = g; });
    return m;
  }, [gapsByState]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="border-b-2 border-[#0B2026] pb-3 flex items-baseline justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#0B2026]">India Community Health Overview</h2>
        <span className="text-xs font-mono text-muted-foreground tracking-widest">JUNE 2026</span>
      </div>

      <section>
        <p className="text-xs font-mono uppercase tracking-widest text-[#FF3621] mb-3">Agent Activity</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Total Sessions" value={stats ? String(stats.total_sessions) : null} accent />
          <KpiCard title="Coverage Gaps" value={stats ? String(stats.coverage_gap_count) : null} accent />
          <KpiCard title="Gap Rate" value={stats ? `${stats.coverage_gap_pct}%` : null} />
          <KpiCard title="Avg Gap Distance" value={stats?.avg_gap_distance_km != null ? `${stats.avg_gap_distance_km} km` : '—'} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-sm rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Coverage Gaps by State</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topGapStates.map(g => (
              <div key={g.state} className="flex items-center gap-3">
                <span className="text-xs font-mono w-28 truncate text-[#0B2026]">{g.state}</span>
                <div className="flex-1 h-2 bg-[#f0ede8] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#FF3621] rounded-sm" style={{ width: `${(g.gap_pct / maxGapPct) * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-[#FF3621] w-10 text-right">{g.gap_pct}%</span>
              </div>
            ))}
            {gapsByState.length === 0 && <p className="text-sm text-muted-foreground">No gap data yet.</p>}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">National Health Indicators (NFHS-5)</CardTitle></CardHeader>
          <CardContent>
            {nfhsLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Inst. Births', value: nfhsAvg?.births, icon: Activity },
                  { label: 'Clean Water', value: nfhsAvg?.water, icon: Droplets },
                  { label: 'Sanitation', value: nfhsAvg?.sanitation, icon: Zap },
                  { label: 'Health Insurance', value: nfhsAvg?.insurance, icon: Shield },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="border-t-2 border-[#0B2026] pt-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
                    </div>
                    <p className="text-xl font-serif font-bold text-[#0B2026]">{value ?? '—'}%</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm rounded-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">State Summary</CardTitle>
            {nfhs && <Badge variant="secondary">{nfhs.length} states / UTs</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {nfhsLoading ? <Skeleton className="h-40 w-full" /> : nfhs && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left font-mono text-xs uppercase tracking-wider">
                    <th className="pb-2 pr-4">State / UT</th>
                    <th className="pb-2 pr-4 text-right">Sessions</th>
                    <th className="pb-2 pr-4 text-right">Gap Rate</th>
                    <th className="pb-2 pr-4 text-right">Inst. Births %</th>
                    <th className="pb-2 text-right">Insurance %</th>
                  </tr>
                </thead>
                <tbody>
                  {nfhs.map(row => {
                    const gap = gapMap[row.state_ut];
                    return (
                      <tr key={row.state_ut} className="border-b hover:bg-[#f0ede8]/50 transition-colors">
                        <td className="py-2 pr-4 font-serif font-medium text-[#0B2026]">{row.state_ut}</td>
                        <td className="py-2 pr-4 text-right font-mono text-muted-foreground">{gap?.session_count ?? '—'}</td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: gap && gap.gap_pct > 50 ? '#FF3621' : undefined }}>{gap ? `${gap.gap_pct}%` : '—'}</td>
                        <td className="py-2 pr-4 text-right">{row.avg_institutional_births_pct ?? '—'}</td>
                        <td className="py-2 text-right">{row.avg_health_insurance_pct ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] Commit:
```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Rewrite OverviewPage with agent KPIs and gap-by-state bar chart"
```

---

### Task 7: DistrictPage rewrite with choropleth map

**Files:**
- Modify: `client/src/pages/DistrictPage.tsx`

- [ ] Replace full contents of `client/src/pages/DistrictPage.tsx`:

```typescript
import { useMemo, useState, useEffect } from 'react';
import { useAnalyticsQuery, Card, CardContent, CardHeader, CardTitle, Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@databricks/appkit-ui/react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleSequential } from 'd3-scale';
import { interpolateReds } from 'd3-scale-chromatic';
import { sql } from '@databricks/appkit-ui/js';
import { fetchGapsByState, type GapByState } from '../lib/intakeApi';
import { normalizeState } from '../lib/stateNormalization';

import indiaStates from '../assets/india-states.json';
const GEO_URL = indiaStates;
const ALL = '__all__';

function gapColor(pct: number | undefined): string {
  if (pct === undefined) return '#eee';
  return scaleSequential(interpolateReds).domain([0, 100])(pct);
}

function gapBorderColor(pct: number): string {
  if (pct > 50) return '#FF3621';
  if (pct > 25) return '#f5a89a';
  return '#eee';
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono w-16 truncate text-muted-foreground">{label}</span>
      <div className="flex-1 h-[3px] bg-[#f0ede8]">
        <div className="h-full bg-[#FF3621]" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}%</span>
    </div>
  );
}

const STATE_LIST = [
  'Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export function DistrictPage() {
  const [selectedState, setSelectedState] = useState<string>(ALL);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [gapsByState, setGapsByState] = useState<GapByState[]>([]);

  const districtParams = useMemo(() => ({
    state_ut: sql.string(selectedState === ALL ? '' : selectedState),
  }), [selectedState]);

  const { data: districts, loading } = useAnalyticsQuery('district_health_indicators', districtParams);

  useEffect(() => {
    fetchGapsByState().then(setGapsByState).catch(console.error);
  }, []);

  const gapMap = useMemo(() => {
    const m: Record<string, GapByState> = {};
    gapsByState.forEach(g => { m[normalizeState(g.state)] = g; });
    return m;
  }, [gapsByState]);

  const filteredDistricts = useMemo(() => {
    if (!districts) return [];
    return [...districts].sort((a, b) => {
      const gapA = gapMap[a.state_ut]?.gap_pct ?? 0;
      const gapB = gapMap[b.state_ut]?.gap_pct ?? 0;
      return gapB - gapA;
    });
  }, [districts, gapMap]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="border-b-2 border-[#0B2026] pb-3 flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#0B2026]">District Health &amp; Coverage</h2>
        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-48 text-sm">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All States</SelectItem>
            {STATE_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-sm rounded-none">
          <CardHeader>
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Coverage Gap Rate by State
            </CardTitle>
          </CardHeader>
          <CardContent className="relative" onMouseLeave={() => setTooltip(null)}>
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 900, center: [82, 23] }}
              style={{ width: '100%', height: 'auto' }}
            >
              <ZoomableGroup>
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map(geo => {
                      // Property key depends on your bundled GeoJSON — check with Object.keys(geo.properties) if map shows empty
                      const stateName: string = geo.properties.ST_NM ?? geo.properties.st_nm ?? geo.properties.NAME_1 ?? geo.properties.name ?? '';
                      const gapData = gapMap[stateName];
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={gapColor(gapData?.gap_pct)}
                          stroke="#fff"
                          strokeWidth={0.5}
                          style={{ default: { outline: 'none' }, hover: { outline: 'none', opacity: 0.8 }, pressed: { outline: 'none' } }}
                          onMouseEnter={(e) => {
                            const nfhsRow = districts?.find(d => d.state_ut === stateName);
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              content: `${stateName} · Gap: ${gapData?.gap_pct ?? 'N/A'}% · Sessions: ${gapData?.session_count ?? 0} · Births: ${nfhsRow?.avg_institutional_births_pct ?? '—'}%`,
                            });
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
            {tooltip && (
              <div className="fixed z-50 bg-[#0B2026] text-white text-xs font-mono px-2 py-1 rounded pointer-events-none max-w-xs"
                style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}>
                {tooltip.content}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs font-mono text-muted-foreground">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: '#eee' }} /><span>No data</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: interpolateReds(0.3) }} /><span>Low</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: interpolateReds(0.6) }} /><span>Medium</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: '#FF3621' }} /><span>High (&gt;50%)</span></div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            District Cards — sorted by state gap rate
          </p>
          {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          {!loading && filteredDistricts.map(row => {
            const gap = gapMap[row.state_ut];
            const borderColor = gapBorderColor(gap?.gap_pct ?? 0);
            return (
              <div key={`${row.state_ut}-${row.district_name}`}
                className="bg-white border border-[#eee] p-4 space-y-2"
                style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-serif font-medium text-[#0B2026]">{row.district_name}</span>
                  <span className="text-xs font-mono" style={{ color: borderColor }}>
                    {gap ? `${gap.gap_pct}% gaps (state)` : 'no gap data'}
                  </span>
                </div>
                <MetricBar label="Inst. Births" value={row.institutional_births_pct} />
                <MetricBar label="Clean Water" value={row.improved_water_pct} />
              </div>
            );
          })}
          {!loading && filteredDistricts.length === 0 && (
            <p className="text-sm text-muted-foreground">No districts found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] Commit:
```bash
git add client/src/pages/DistrictPage.tsx
git commit -m "Rewrite DistrictPage with choropleth map and gap-enriched district cards"
```

---

### Task 8: SessionsPage

**Files:**
- Create: `client/src/pages/SessionsPage.tsx`
- Delete: `client/src/pages/FacilitiesPage.tsx`

- [ ] Create `client/src/pages/SessionsPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@databricks/appkit-ui/react';
import { fetchIntakeStats, fetchIntakes, type IntakeStats, type IntakeSession } from '../lib/intakeApi';
import { useGapThreshold } from '../context/GapThresholdContext';

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SessionsPage() {
  const { threshold } = useGapThreshold();
  const [stats, setStats] = useState<IntakeStats | null>(null);
  const [sessions, setSessions] = useState<IntakeSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchIntakeStats(), fetchIntakes()])
      .then(([s, i]) => { setStats(s); setSessions(i); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Re-evaluate gap status client-side against current threshold
  const evaluated = sessions.map(s => ({
    ...s,
    isGap: s.nearest_distance_km != null ? s.nearest_distance_km > threshold : (s.has_coverage_gap ?? false),
  }));

  const dynamicGapCount = evaluated.filter(s => s.isGap).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="border-b-2 border-[#0B2026] pb-3">
        <h2 className="text-2xl font-serif font-bold text-[#0B2026]">Agent Session Activity</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { title: 'Coverage Gaps', value: loading ? null : String(dynamicGapCount), accent: true },
          { title: 'Avg Gap Distance', value: loading ? null : stats?.avg_gap_distance_km != null ? `${stats.avg_gap_distance_km} km` : '—', accent: false },
          { title: 'Avg Facility Confidence', value: loading ? null : '—', accent: false },
        ].map(({ title, value, accent }) => (
          <Card key={title} className="bg-white shadow-sm rounded-none border-t-4" style={{ borderTopColor: accent ? '#FF3621' : '#0B2026' }}>
            <CardContent className="pt-4 pb-4">
              {value === null ? <Skeleton className="h-8 w-20 mb-1" /> : (
                <p className="text-3xl font-serif font-bold" style={{ color: accent ? '#FF3621' : '#0B2026' }}>{value}</p>
              )}
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1">{title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white shadow-sm rounded-none">
        <CardHeader>
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Recent Intake Sessions (last 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b font-mono text-xs uppercase tracking-wider text-muted-foreground text-left">
                    <th className="pb-2 pr-4 w-28">Status</th>
                    <th className="pb-2 pr-4">Symptoms</th>
                    <th className="pb-2 pr-4">Location</th>
                    <th className="pb-2 pr-4 w-28">Confidence</th>
                    <th className="pb-2 w-20">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluated.map(s => (
                    <tr key={s.id}
                      className="border-b transition-colors hover:bg-[#f0ede8]/50"
                      style={s.isGap ? { borderLeftWidth: 2, borderLeftColor: '#FF3621' } : undefined}>
                      <td className="py-2 pr-4">
                        {s.isGap
                          ? <span className="font-mono font-bold text-[#FF3621] text-xs">⚠ GAP</span>
                          : <span className="font-mono font-bold text-[#2a7a6f] text-xs">✓ MATCHED</span>}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{s.symptoms ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">
                        {[s.district, s.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">—</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{relativeTime(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {evaluated.length === 0 && <p className="text-sm text-muted-foreground py-4">No sessions yet.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] Delete retired page:
```bash
rm /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/dais-2026-app/client/src/pages/FacilitiesPage.tsx
```

- [ ] Commit:
```bash
git add client/src/pages/SessionsPage.tsx
git rm client/src/pages/FacilitiesPage.tsx
git commit -m "Add SessionsPage with intake feed and gap threshold re-evaluation"
```

---

### Task 9: Update smoke tests and retire facilities query

**Files:**
- Modify: `tests/smoke.spec.ts`
- Delete: `config/queries/facilities_by_state.sql`

- [ ] Update `tests/smoke.spec.ts` — change the lakebase plugin page entry:

Find this block:
```typescript
  lakebase: {
    navLabel: 'Facilities',
    path: '/facilities',
    expectedTexts: ['Healthcare Facilities'],
  },
```

Replace with:
```typescript
  lakebase: {
    navLabel: 'Sessions',
    path: '/sessions',
    expectedTexts: ['Agent Session Activity'],
  },
```

- [ ] Delete retired SQL query:
```bash
rm /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/dais-2026-app/config/queries/facilities_by_state.sql
```

- [ ] Commit:
```bash
git add tests/smoke.spec.ts
git rm config/queries/facilities_by_state.sql
git commit -m "Update smoke tests for Sessions page, retire facilities_by_state query"
```

---

### Task 10: Typecheck, validate, deploy

- [ ] Run typecheck:
```bash
cd /Users/aaron.kurtz/Code/DAIS_AGENT_HACKTHON/dais-2026-app
npm run typegen
npx tsc --noEmit
```
Expected: no errors. Fix any type errors before proceeding.

- [ ] Run validate:
```bash
databricks apps validate --profile dais-2026-lakebase
```
Expected: all checks pass. If smoke tests fail, check selectors match actual rendered text.

- [ ] Deploy:
```bash
databricks bundle deploy --profile dais-2026-lakebase
databricks apps deploy dais-2026-app --source-code-path /Workspace/Users/aaron_dais_2026@icloud.com/.bundle/dais-2026-app/default/files --profile dais-2026-lakebase
```

- [ ] Verify app is running:
```bash
databricks apps get dais-2026-app --profile dais-2026-lakebase -o json | python3 -c "import json,sys; s=json.load(sys.stdin); print(s['app_status']['state'])"
```
Expected: `RUNNING`

- [ ] Commit anything remaining:
```bash
git add -A && git status
# commit only if there are leftover changes
```
