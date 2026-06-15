import { useMemo, useState, useEffect } from 'react';
import { useAnalyticsQuery, Card, CardContent, CardHeader, CardTitle, Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@databricks/appkit-ui/react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleSequential } from 'd3-scale';
import { interpolateReds } from 'd3-scale-chromatic';
import { sql } from '@databricks/appkit-ui/js';
import { fetchGapsByState, type GapByState } from '../lib/intakeApi';
import { toGeoName, normalizeState } from '../lib/stateNormalization';

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
  const numeric = value !== null && value !== undefined ? Number(value) : null;
  if (numeric === null || isNaN(numeric)) return null;
  const value_ = numeric;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono w-36 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-[3px] bg-[#f0ede8]">
        <div className="h-full bg-[#FF3621]" style={{ width: `${value_}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right shrink-0">{value_}%</span>
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

  // Two keyed maps: nfhsGapMap for district-card lookups (NFHS-5 canonical names),
  // geoGapMap for choropleth fill (datamaps legacy names)
  const nfhsGapMap = useMemo(() => {
    const m: Record<string, GapByState> = {};
    gapsByState.forEach(g => { m[normalizeState(g.state)] = g; });
    return m;
  }, [gapsByState]);

  const geoGapMap = useMemo(() => {
    const m: Record<string, GapByState> = {};
    gapsByState.forEach(g => { m[toGeoName(g.state)] = g; });
    return m;
  }, [gapsByState]);

  const filteredDistricts = useMemo(() => {
    if (!districts) return [];
    return [...districts].sort((a, b) => {
      const gapA = nfhsGapMap[a.state_ut]?.gap_pct ?? 0;
      const gapB = nfhsGapMap[b.state_ut]?.gap_pct ?? 0;
      return gapB - gapA;
    });
  }, [districts, nfhsGapMap]);

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
                      if (!geo.properties.name) return null;
                      const stateName: string = geo.properties.name;
                      const gapData = geoGapMap[stateName];
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={gapColor(gapData?.gap_pct)}
                          stroke="#fff"
                          strokeWidth={0.5}
                          style={{ default: { outline: 'none' }, hover: { outline: 'none', opacity: 0.8 }, pressed: { outline: 'none' } }}
                          onMouseEnter={(e) => {
                            // stateName is datamaps legacy; gapData.state has the original value from sms_sessions
                            // normalizeState it to find the NFHS-5 canonical name for the tooltip
                            const nfhsName = gapData ? normalizeState(gapData.state) : stateName;
                            const nfhsRow = districts?.find(d => d.state_ut === nfhsName);
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              content: `${stateName} · Gap: ${gapData?.gap_pct ?? 'N/A'}% · Sessions: ${gapData?.session_count ?? 0} · Births: ${nfhsRow?.institutional_births_pct ?? '—'}%`,
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
            const gap = nfhsGapMap[row.state_ut];
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
                <MetricBar label="Institutional Births" value={row.institutional_births_pct} />
                <MetricBar label="Clean Water" value={row.improved_water_pct} />
                <MetricBar label="Improved Sanitation" value={row.improved_sanitation_pct} />
                <MetricBar label="Health Insurance" value={row.health_insurance_pct} />
                <MetricBar label="Clean Cooking Fuel" value={row.clean_fuel_pct} />
                <MetricBar label="Women Literacy" value={row.women_literacy_pct} />
                <MetricBar label="Family Planning" value={row.family_planning_pct} />
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
