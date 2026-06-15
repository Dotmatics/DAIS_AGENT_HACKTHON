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
          { title: 'Avg Facility Confidence', value: loading ? null : stats?.avg_facility_confidence != null ? String(stats.avg_facility_confidence) : '—', accent: false },
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
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {s.isGap
                          ? (s.geo_confidence != null ? String(s.geo_confidence) : '—')
                          : (s.facility_confidence != null ? String(s.facility_confidence) : '—')}
                      </td>
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
