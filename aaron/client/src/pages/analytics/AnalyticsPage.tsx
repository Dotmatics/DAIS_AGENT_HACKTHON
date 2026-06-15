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

interface ChosenLocation {
  district: string | null;
  state: string | null;
  pincode: string | null;
}

interface IntakeStats {
  stats: { total_bundles: string; coverage_gaps: string; high_confidence_locations: string };
  recent: Array<{
    symptom_summary: string;
    chosen_location: ChosenLocation | null;
    geo_confidence: number;
    has_coverage_gap: boolean;
  }>;
}

export function AnalyticsPage() {
  const { data, loading, error } = useAnalyticsQuery('underserved_districts', {
    min_facilities: sql.int(3),
  });
  const [intakeStats, setIntakeStats] = useState<IntakeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/intake/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setIntakeStats)
      .catch(() => undefined)
      .finally(() => setStatsLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Healthcare Coverage Analytics"
        subtitle="Districts with few mapped facilities and agent intake coverage gaps from Lakebase."
      />

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          Error loading data: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total Intakes"
          value={statsLoading ? null : intakeStats?.stats.total_bundles ?? '0'}
          icon={Activity}
          color="bg-[#FF3621]"
          description="Agent intake conversations"
        />
        <KpiCard
          title="High-confidence Locations"
          value={statsLoading ? null : intakeStats?.stats.high_confidence_locations ?? '0'}
          icon={MapPin}
          color="bg-emerald-500"
          description="Geo confidence ≥ 80%"
        />
        <KpiCard
          title="Coverage Gaps"
          value={statsLoading ? null : intakeStats?.stats.coverage_gaps ?? '0'}
          icon={AlertTriangle}
          color="bg-amber-500"
          description="Nearest facility &gt; 50 km"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthCard>
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Recent intakes</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading && <Skeleton className="h-20 w-full" />}
            {!statsLoading && intakeStats?.recent.length === 0 && (
              <p className="text-sm text-muted-foreground">No intakes yet. Try the SMS demo.</p>
            )}
            {intakeStats?.recent.map((r, i) => {
              const loc = [r.chosen_location?.district, r.chosen_location?.state]
                .filter(Boolean)
                .join(', ');
              return (
                <div
                  key={`${r.symptom_summary}-${i}`}
                  className="border-b border-[#EEEDE9] py-3 text-sm last:border-0"
                >
                  <div className="font-medium text-[#0B2026]">
                    {loc || 'Location pending'}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {Math.round((r.geo_confidence ?? 0) * 100)}% geo
                    </span>
                    {r.has_coverage_gap && (
                      <span className="ml-2 font-normal text-amber-600">(coverage gap)</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">{r.symptom_summary}</div>
                </div>
              );
            })}
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
