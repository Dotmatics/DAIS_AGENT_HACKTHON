import {
  useAnalyticsQuery,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    fetch('/api/intake/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setIntakeStats)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Healthcare Coverage Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Districts with few mapped facilities and agent intake coverage gaps from Lakebase.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {intakeStats && (
          <Card>
            <CardHeader>
              <CardTitle>Agent intake summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>Total intakes: {intakeStats.stats.total_bundles}</div>
              <div>High-confidence locations: {intakeStats.stats.high_confidence_locations}</div>
              <div>Coverage gaps: {intakeStats.stats.coverage_gaps}</div>
            </CardContent>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Recent intakes</CardTitle>
          </CardHeader>
          <CardContent>
            {!intakeStats && <Skeleton className="h-20 w-full" />}
            {intakeStats?.recent.length === 0 && (
              <p className="text-sm text-muted-foreground">No intakes yet. Try the SMS demo.</p>
            )}
            {intakeStats?.recent.map((r, i) => {
              const loc = [r.chosen_location?.district, r.chosen_location?.state]
                .filter(Boolean)
                .join(', ');
              return (
                <div
                  key={`${r.symptom_summary}-${i}`}
                  className="text-sm border-b py-2 last:border-0"
                >
                  {loc || 'Location pending'} · {Math.round((r.geo_confidence ?? 0) * 100)}% geo ·{' '}
                  {r.symptom_summary}
                  {r.has_coverage_gap && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">(coverage gap)</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Underserved districts (Virtue Foundation dataset)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <Skeleton className="h-32 w-full" />}
          {error && <div className="text-destructive text-sm">Error: {error}</div>}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">District</th>
                    <th className="py-2">Facilities</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{String(row.state)}</td>
                      <td className="py-2 pr-4">{String(row.district)}</td>
                      <td className="py-2">{String(row.facility_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
