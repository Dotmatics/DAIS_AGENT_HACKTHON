export interface IntakeStats {
  total_sessions: number;
  coverage_gap_count: number;
  coverage_gap_pct: number;
  avg_gap_distance_km: number | null;
  avg_facility_confidence: number | null;
}

export interface IntakeSession {
  id: string;
  symptoms: string | null;
  district: string | null;
  state: string | null;
  status: string;
  created_at: string;
  has_coverage_gap: boolean | null;
  nearest_distance_km: number | null;
  facility_name: string | null;
  recommended_distance_km: number | null;
  geo_confidence: number | null;
  facility_confidence: number | null;
}

export interface GapByState {
  state: string;
  session_count: number;
  gap_count: number;
  gap_pct: number;
}

export async function fetchIntakeStats(): Promise<IntakeStats> {
  const res = await fetch('/api/lakebase/intakes/stats');
  if (!res.ok) throw new Error('Failed to fetch intake stats');
  return res.json();
}

export async function fetchIntakes(): Promise<IntakeSession[]> {
  const res = await fetch('/api/lakebase/intakes');
  if (!res.ok) throw new Error('Failed to fetch intakes');
  return res.json();
}

export async function fetchGapsByState(): Promise<GapByState[]> {
  const res = await fetch('/api/lakebase/gaps-by-state');
  if (!res.ok) throw new Error('Failed to fetch gaps by state');
  return res.json();
}
