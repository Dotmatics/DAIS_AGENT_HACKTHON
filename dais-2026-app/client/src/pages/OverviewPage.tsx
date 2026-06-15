import { useMemo } from 'react';
import {
  useAnalyticsQuery,
  BarChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
} from '@databricks/appkit-ui/react';
import { Activity, Droplets, Zap, Shield } from 'lucide-react';

const EMPTY_PARAMS = {};

function KpiCard({ title, value, icon: Icon, color, description }: {
  title: string;
  value: string | number | null;
  icon: React.ElementType;
  color: string;
  description: string;
}) {
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {value === null ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-[#0B2026]">{value}%</p>
            )}
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const params = useMemo(() => EMPTY_PARAMS, []);
  const { data, loading, error } = useAnalyticsQuery('state_summary', params);

  const avgMetrics = useMemo(() => {
    if (!data || data.length === 0) return null;
    const n = data.length;
    return {
      births: (data.reduce((s, r) => s + (r.avg_institutional_births_pct ?? 0), 0) / n).toFixed(1),
      water: (data.reduce((s, r) => s + (r.avg_improved_water_pct ?? 0), 0) / n).toFixed(1),
      sanitation: (data.reduce((s, r) => s + (r.avg_improved_sanitation_pct ?? 0), 0) / n).toFixed(1),
      insurance: (data.reduce((s, r) => s + (r.avg_health_insurance_pct ?? 0), 0) / n).toFixed(1),
    };
  }, [data]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[#0B2026]">India Community Health Overview</h2>
        <p className="text-muted-foreground mt-1">
          National Family Health Survey (NFHS-5) district indicators across all states and union territories.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">Error loading data: {error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Institutional Births"
          value={loading ? null : avgMetrics?.births ?? '—'}
          icon={Activity}
          color="bg-[#FF3621]"
          description="Avg across states"
        />
        <KpiCard
          title="Improved Water Access"
          value={loading ? null : avgMetrics?.water ?? '—'}
          icon={Droplets}
          color="bg-blue-500"
          description="Avg across states"
        />
        <KpiCard
          title="Improved Sanitation"
          value={loading ? null : avgMetrics?.sanitation ?? '—'}
          icon={Zap}
          color="bg-emerald-500"
          description="Avg across states"
        />
        <KpiCard
          title="Health Insurance"
          value={loading ? null : avgMetrics?.insurance ?? '—'}
          icon={Shield}
          color="bg-purple-500"
          description="Avg across states"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Institutional Births by State</CardTitle>
            <p className="text-sm text-muted-foreground">% of births in health facilities</p>
          </CardHeader>
          <CardContent>
            {loading && <Skeleton className="h-64 w-full" />}
            {!loading && !error && (
              <BarChart
                queryKey="state_summary"
                parameters={params}
                xKey="state_ut"
                yKey="avg_institutional_births_pct"
                colors={['#FF3621']}
              />
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Women's Literacy by State</CardTitle>
            <p className="text-sm text-muted-foreground">% of women aged 15–49 who are literate</p>
          </CardHeader>
          <CardContent>
            {loading && <Skeleton className="h-64 w-full" />}
            {!loading && !error && (
              <BarChart
                queryKey="state_summary"
                parameters={params}
                xKey="state_ut"
                yKey="avg_women_literacy_pct"
                colors={['#0B2026']}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#0B2026]">State-level Summary</CardTitle>
            {data && <Badge variant="secondary">{data.length} states / UTs</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
          {!loading && data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 pr-4 font-medium">State / UT</th>
                    <th className="pb-2 pr-4 font-medium text-right">Districts</th>
                    <th className="pb-2 pr-4 font-medium text-right">Inst. Births %</th>
                    <th className="pb-2 pr-4 font-medium text-right">Water %</th>
                    <th className="pb-2 pr-4 font-medium text-right">Sanitation %</th>
                    <th className="pb-2 font-medium text-right">Insurance %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.state_ut} className="border-b hover:bg-[#EEEDE9]/50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-[#0B2026]">{row.state_ut}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{row.district_count}</td>
                      <td className="py-2 pr-4 text-right">{row.avg_institutional_births_pct ?? '—'}</td>
                      <td className="py-2 pr-4 text-right">{row.avg_improved_water_pct ?? '—'}</td>
                      <td className="py-2 pr-4 text-right">{row.avg_improved_sanitation_pct ?? '—'}</td>
                      <td className="py-2 text-right">{row.avg_health_insurance_pct ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data && data.length === 0 && (
            <p className="text-muted-foreground text-sm">No data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
