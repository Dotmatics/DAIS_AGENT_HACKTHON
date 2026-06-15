import { useMemo, useEffect, useState } from 'react';
import { useAnalyticsQuery, Card, CardContent, CardHeader, CardTitle, Skeleton, Badge } from '@databricks/appkit-ui/react';
import { Activity, Droplets, Zap, Shield, Flame, BookOpen } from 'lucide-react';
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
    type NfhsRow = typeof nfhs[number];
    const avg = (field: keyof NfhsRow) => (nfhs.reduce((s, r) => s + (Number(r[field]) || 0), 0) / n).toFixed(1);
    return {
      births: avg('avg_institutional_births_pct'),
      water: avg('avg_improved_water_pct'),
      sanitation: avg('avg_improved_sanitation_pct'),
      insurance: avg('avg_health_insurance_pct'),
      fuel: avg('avg_clean_fuel_pct'),
      literacy: avg('avg_women_literacy_pct'),
    };
  }, [nfhs]);

  const topGapStates = gapsByState.slice(0, 8);
  const maxGapPct = topGapStates.length > 0 ? topGapStates[0].gap_pct : 100;

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
                  { label: 'Institutional Births', value: nfhsAvg?.births, icon: Activity },
                  { label: 'Clean Water', value: nfhsAvg?.water, icon: Droplets },
                  { label: 'Sanitation', value: nfhsAvg?.sanitation, icon: Zap },
                  { label: 'Health Insurance', value: nfhsAvg?.insurance, icon: Shield },
                  { label: 'Clean Cooking Fuel', value: nfhsAvg?.fuel, icon: Flame },
                  { label: 'Women Literacy', value: nfhsAvg?.literacy, icon: BookOpen },
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
                    <th className="pb-2 pr-4 text-right">Clean Water %</th>
                    <th className="pb-2 pr-4 text-right">Sanitation %</th>
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
                        <td className="py-2 pr-4 text-right">{row.avg_improved_water_pct ?? '—'}</td>
                        <td className="py-2 pr-4 text-right">{row.avg_improved_sanitation_pct ?? '—'}</td>
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
