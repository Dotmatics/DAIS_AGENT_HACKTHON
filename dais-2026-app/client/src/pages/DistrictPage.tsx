import { useMemo, useState } from 'react';
import {
  useAnalyticsQuery,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';

const STATE_LIST = [
  'Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

function MetricBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const color = value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-yellow-400' : 'bg-[#FF3621]';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-[#0B2026]">{value}%</span>
      </div>
      <div className="h-2 w-full bg-[#EEEDE9] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export function DistrictPage() {
  const ALL = '__all__';
  const [selectedState, setSelectedState] = useState(ALL);

  const params = useMemo(
    () => ({ state_ut: sql.string(selectedState === ALL ? '' : selectedState) }),
    [selectedState]
  );

  const { data, loading, error } = useAnalyticsQuery('district_health_indicators', params);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[#0B2026]">District Health Indicators</h2>
        <p className="text-muted-foreground mt-1">
          NFHS-5 health metrics at the district level. Filter by state to explore gaps.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-64 bg-white">
            <SelectValue placeholder="All states & UTs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states & UTs</SelectItem>
            {STATE_LIST.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <Badge variant="secondary">{data.length} district{data.length !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">Error: {error}</div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-white shadow-sm">
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && data && data.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">No districts found for the selected filter.</div>
      )}

      {!loading && data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((d) => (
            <Card key={`${d.state_ut}-${d.district_name}`} className="bg-white shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#0B2026]">{d.district_name}</CardTitle>
                <p className="text-xs text-muted-foreground">{d.state_ut}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricBar label="Institutional Births" value={d.institutional_births_pct} />
                <MetricBar label="Improved Water" value={d.improved_water_pct} />
                <MetricBar label="Sanitation" value={d.improved_sanitation_pct} />
                <MetricBar label="Health Insurance" value={d.health_insurance_pct} />
                <MetricBar label="Women's Literacy" value={d.women_literacy_pct} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
