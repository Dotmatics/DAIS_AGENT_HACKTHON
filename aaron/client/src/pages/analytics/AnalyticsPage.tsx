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

  useEffect(() => {
    fetch('/api/sms/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setGapStats)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Healthcare Coverage Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Districts with few mapped facilities and SMS intake coverage gaps from Lakebase.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {gapStats && (
          <Card>
            <CardHeader>
              <CardTitle>SMS intake summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>Total sessions: {gapStats.stats.total_sessions}</div>
              <div>Completed intakes: {gapStats.stats.completed_sessions}</div>
              <div>Coverage gaps: {gapStats.stats.coverage_gaps}</div>
            </CardContent>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Recent coverage gaps (SMS users)</CardTitle>
          </CardHeader>
          <CardContent>
            {!gapStats && <Skeleton className="h-20 w-full" />}
            {gapStats?.recentGaps.length === 0 && (
              <p className="text-sm text-muted-foreground">No gap records yet. Try the SMS demo.</p>
            )}
            {gapStats?.recentGaps.map((g, i) => (
              <div key={i} className="text-sm border-b py-2 last:border-0">
                Pincode {g.postal_code} · {Math.round(g.nearest_distance_km)} km to nearest · {g.symptoms}
              </div>
            ))}
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
