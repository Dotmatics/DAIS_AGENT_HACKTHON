import {
  useAnalyticsQuery,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, MapPin } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { KpiCard } from '../../components/KpiCard';
import { HealthCard } from '../../components/HealthCard';

interface GapStats {
  stats: { total_sessions: string; completed_sessions: string; coverage_gaps: string };
  recentGaps: Array<{
    postal_code: string;
    symptoms: string;
    nearest_distance_km: number;
    phone: string;
  }>;
}

export function AnalyticsPage() {
  const { data, loading, error } = useAnalyticsQuery('underserved_districts', {
    min_facilities: sql.int(3),
  });
  const [gapStats, setGapStats] = useState<GapStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sms/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setGapStats)
      .catch(() => undefined)
      .finally(() => setStatsLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Healthcare Coverage Analytics"
        subtitle="Districts with few mapped facilities and SMS intake coverage gaps from Lakebase."
      />

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          Error loading data: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="SMS Sessions"
          value={statsLoading ? null : gapStats?.stats.total_sessions ?? '0'}
          icon={Activity}
          color="bg-[#FF3621]"
          description="Total mock SMS intakes"
        />
        <KpiCard
          title="Completed Intakes"
          value={statsLoading ? null : gapStats?.stats.completed_sessions ?? '0'}
          icon={MapPin}
          color="bg-emerald-500"
          description="Full pincode + age + symptoms"
        />
        <KpiCard
          title="Coverage Gaps"
          value={statsLoading ? null : gapStats?.stats.coverage_gaps ?? '0'}
          icon={AlertTriangle}
          color="bg-amber-500"
          description="Nearest facility &gt; 50 km"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthCard>
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Recent coverage gaps (SMS users)</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading && <Skeleton className="h-20 w-full" />}
            {!statsLoading && gapStats?.recentGaps.length === 0 && (
              <p className="text-sm text-muted-foreground">No gap records yet. Try the SMS demo.</p>
            )}
            {gapStats?.recentGaps.map((g, i) => (
              <div
                key={i}
                className="border-b border-[#EEEDE9] py-3 text-sm last:border-0"
              >
                <div className="font-medium text-[#0B2026]">Pincode {g.postal_code}</div>
                <div className="text-muted-foreground">
                  {Math.round(g.nearest_distance_km)} km to nearest · {g.symptoms}
                </div>
              </div>
            ))}
          </CardContent>
        </HealthCard>

        <HealthCard>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#0B2026]">Underserved districts preview</CardTitle>
              {data && (
                <Badge variant="secondary">{data.length} districts</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Fewer than 3 mapped facilities</p>
          </CardHeader>
          <CardContent>
            {loading && <Skeleton className="h-32 w-full" />}
            {data && data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">State</th>
                      <th className="py-2 pr-4 font-medium">District</th>
                      <th className="py-2 font-medium text-right">Facilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 8).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-[#EEEDE9] transition-colors last:border-0 hover:bg-[#EEEDE9]/50"
                      >
                        <td className="py-2 pr-4 font-medium text-[#0B2026]">{String(row.state)}</td>
                        <td className="py-2 pr-4">{String(row.district)}</td>
                        <td className="py-2 text-right">{String(row.facility_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </HealthCard>
      </div>

      <HealthCard>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#0B2026]">
              Underserved districts (Virtue Foundation dataset)
            </CardTitle>
            {data && <Badge variant="secondary">{data.length} rows</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {loading && <Skeleton className="h-32 w-full" />}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">State</th>
                    <th className="py-2 pr-4 font-medium">District</th>
                    <th className="py-2 font-medium text-right">Facilities</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-[#EEEDE9] transition-colors last:border-0 hover:bg-[#EEEDE9]/50"
                    >
                      <td className="py-2 pr-4 font-medium text-[#0B2026]">{String(row.state)}</td>
                      <td className="py-2 pr-4">{String(row.district)}</td>
                      <td className="py-2 text-right">{String(row.facility_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </HealthCard>
    </div>
  );
}
