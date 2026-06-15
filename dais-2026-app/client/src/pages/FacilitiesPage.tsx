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

const EMPTY_PARAMS = {};

export function FacilitiesPage() {
  const params = useMemo(() => EMPTY_PARAMS, []);
  const { data, loading, error } = useAnalyticsQuery('facilities_by_state', params);

  const totalFacilities = useMemo(
    () => data?.reduce((s, r) => s + r.facility_count, 0) ?? null,
    [data]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-[#0B2026]">Healthcare Facilities</h2>
          <p className="text-muted-foreground mt-1">
            Facilities by state and organization type across India.
          </p>
        </div>
        {totalFacilities !== null && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {totalFacilities.toLocaleString()} total facilities
          </Badge>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">Error: {error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Facilities by State</CardTitle>
            <p className="text-sm text-muted-foreground">Total count per state</p>
          </CardHeader>
          <CardContent>
            {loading && <Skeleton className="h-64 w-full" />}
            {!loading && !error && (
              <BarChart
                queryKey="facilities_by_state"
                parameters={params}
                xKey="state"
                yKey="facility_count"
                colors={['#FF3621']}
              />
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0B2026]">Facilities with Doctors on Record</CardTitle>
            <p className="text-sm text-muted-foreground">Subset with doctor count data available</p>
          </CardHeader>
          <CardContent>
            {loading && <Skeleton className="h-64 w-full" />}
            {!loading && !error && (
              <BarChart
                queryKey="facilities_by_state"
                parameters={params}
                xKey="state"
                yKey="with_doctors"
                colors={['#0B2026']}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#0B2026]">Facility Data Table</CardTitle>
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
                    <th className="pb-2 pr-4 font-medium">State</th>
                    <th className="pb-2 pr-4 font-medium">Organization Type</th>
                    <th className="pb-2 pr-4 font-medium text-right">Facilities</th>
                    <th className="pb-2 font-medium text-right">With Doctors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-[#EEEDE9]/50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-[#0B2026]">{row.state || '—'}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.organization_type || '—'}</td>
                      <td className="py-2 pr-4 text-right">{row.facility_count.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.with_doctors.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data && data.length === 0 && (
            <p className="text-muted-foreground text-sm">No facility data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
