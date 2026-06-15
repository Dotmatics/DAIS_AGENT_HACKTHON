import { sql } from '@databricks/appkit';
import { classifySymptoms, GAP_THRESHOLD_KM } from './symptom-mapping';

/** A SQL type marker produced by the appkit `sql.*` helpers. */
export type SqlParam = { __sql_type: string; value: string };

export interface FacilityResult {
  name: string;
  address_city: string | null;
  address_stateOrRegion: string | null;
  officialPhone: string | null;
  specialties: string | null;
  capability: string | null;
  dist_km: number;
  /** 0..1 confidence that this facility can address the user's symptoms nearby. */
  facilityConfidence: number;
}

export type AnalyticsQueryFn = (
  query: string,
  parameters?: Record<string, SqlParam>,
) => Promise<{ rows?: Record<string, unknown>[] }>;

function toStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function mapFacilityRow(
  row: Record<string, unknown>,
  specialtyFilter: string,
  geoConfidence: number,
): FacilityResult {
  const distKm = Number(row.dist_km);
  const specialties = toStr(row.specialties);
  const capability = toStr(row.capability);
  const officialPhone = toStr(row.officialPhone);
  return {
    name: toStr(row.name) ?? '',
    address_city: toStr(row.address_city),
    address_stateOrRegion: toStr(row.address_stateOrRegion),
    officialPhone,
    specialties,
    capability,
    dist_km: distKm,
    facilityConfidence: facilityConfidence({
      distKm,
      specialtyFilter,
      specialties,
      capability,
      hasPhone: officialPhone != null && officialPhone.trim() !== '',
      geoConfidence,
    }),
  };
}

/**
 * Confidence that a facility is the right place to treat the user's symptoms.
 * Combines proximity (closer is better, hard penalty past the coverage gap),
 * specialty/capability match, presence of a contact number, and the upstream
 * geographic confidence (an uncertain location caps facility confidence).
 */
export function facilityConfidence(args: {
  distKm: number;
  specialtyFilter: string;
  specialties: string | null;
  capability: string | null;
  hasPhone: boolean;
  geoConfidence: number;
}): number {
  const { distKm, specialtyFilter, specialties, capability, hasPhone, geoConfidence } = args;

  // Proximity: ~1.0 at 0 km, decaying to ~0 around the gap threshold and beyond.
  const proximity =
    distKm <= 5
      ? 1
      : distKm >= GAP_THRESHOLD_KM
        ? 0.15
        : Math.max(0.15, 1 - distKm / GAP_THRESHOLD_KM);

  // Specialty/capability alignment.
  let specialtyScore = 0.5; // neutral when we couldn't classify symptoms
  if (specialtyFilter) {
    const hay = `${specialties ?? ''} ${capability ?? ''}`.toLowerCase();
    specialtyScore = hay.includes(specialtyFilter.toLowerCase()) ? 1 : 0.35;
  }

  const phoneScore = hasPhone ? 1 : 0.7;

  // Weighted blend, then capped by geographic certainty.
  const raw = 0.5 * proximity + 0.3 * specialtyScore + 0.2 * phoneScore;
  const capped = raw * (0.6 + 0.4 * clamp01(geoConfidence));
  return Number(clamp01(capped).toFixed(3));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const NEARBY_FACILITIES_BY_LATLON_SQL = `
SELECT
  f.name,
  f.address_city,
  f.address_stateOrRegion,
  f.officialPhone,
  f.specialties,
  f.capability,
  6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(f.latitude - :lat) / 2), 2) +
    COS(RADIANS(:lat)) * COS(RADIANS(f.latitude)) *
    POWER(SIN(RADIANS(f.longitude - :lon) / 2), 2)
  )) AS dist_km
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
WHERE f.latitude IS NOT NULL
  AND f.organization_type = 'facility'
  AND (
    :specialty_filter = ''
    OR f.specialties ILIKE concat('%', :specialty_filter, '%')
    OR f.capability ILIKE concat('%', :specialty_filter, '%')
  )
ORDER BY dist_km
LIMIT 5
`;

export interface FacilityMatchResult {
  facilities: FacilityResult[];
  hasCoverageGap: boolean;
  nearestDistanceKm: number | null;
  /** The specialty filter derived from the symptoms (for transparency). */
  specialty: string;
  /** 0..1 confidence that the symptoms were mapped to the right specialty. */
  symptomConfidence: number;
}

/**
 * Find facilities near an explicit lat/lon (resolved from a pincode or from
 * descriptors). Computes a per-facility confidence that blends proximity,
 * specialty match, contact availability, and the upstream geographic
 * confidence so an uncertain location does not produce an overconfident pick.
 */
export async function findFacilitiesByLatLon(
  analyticsQuery: AnalyticsQueryFn,
  lat: number,
  lon: number,
  symptoms: string,
  geoConfidence = 0.9,
): Promise<FacilityMatchResult> {
  const classification = classifySymptoms(symptoms);

  const result = await analyticsQuery(NEARBY_FACILITIES_BY_LATLON_SQL, {
    lat: sql.double(lat),
    lon: sql.double(lon),
    specialty_filter: sql.string(classification.specialty),
  });

  const rows = (result.rows ?? []).map((r) =>
    mapFacilityRow(r, classification.specialty, geoConfidence),
  );
  const nearest = rows[0]?.dist_km ?? null;
  const hasCoverageGap = nearest === null || nearest > GAP_THRESHOLD_KM;

  return {
    facilities: rows,
    hasCoverageGap,
    nearestDistanceKm: nearest,
    specialty: classification.specialty,
    symptomConfidence: classification.confidence,
  };
}

