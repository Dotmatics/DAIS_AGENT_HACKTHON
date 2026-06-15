import type { LakebaseQueryFn } from './sms-processor';
import type { FacilityResult } from './facility-lookup';
import type { LocationCandidate } from './location-resolver';

/**
 * The deliverable of an intake conversation: a self-contained summary of the
 * user's symptoms, the evidence used to resolve their location, the location
 * finally chosen, the recommended facility, and confidence scores for both the
 * geographic match and the facility recommendation.
 */
export interface IntakeBundle {
  symptomSummary: string;
  locationEvidence: {
    rawPincode: string | null;
    rawDescriptors: string | null;
    candidatesConsidered: Array<{
      label: string;
      district: string | null;
      state: string | null;
      matchLevel: string;
      geoConfidence: number;
    }>;
  };
  chosenLocation: {
    pincode: string | null;
    officename: string | null;
    district: string | null;
    state: string | null;
    lat: number;
    lon: number;
    matchLevel: string;
  } | null;
  geoConfidence: number;
  nearestFacility: {
    name: string;
    phone: string | null;
    distanceKm: number | null;
    specialties: string | null;
  } | null;
  facilityConfidence: number;
  hasCoverageGap: boolean;
}

export interface BuildBundleInput {
  symptomSummary: string;
  rawPincode?: string | null;
  rawDescriptors?: string | null;
  candidatesConsidered?: LocationCandidate[];
  chosen: LocationCandidate | null;
  facilities: FacilityResult[];
  hasCoverageGap: boolean;
}

function candidateLabel(c: { officename: string | null; district: string | null; state: string | null }): string {
  return [c.officename, c.district, c.state].filter(Boolean).join(', ') || 'Unknown';
}

export function buildIntakeBundle(input: BuildBundleInput): IntakeBundle {
  const nearest = input.facilities[0] ?? null;
  return {
    symptomSummary: input.symptomSummary,
    locationEvidence: {
      rawPincode: input.rawPincode ?? null,
      rawDescriptors: input.rawDescriptors ?? null,
      candidatesConsidered: (input.candidatesConsidered ?? []).map((c) => ({
        label: candidateLabel(c),
        district: c.district,
        state: c.state,
        matchLevel: c.matchLevel,
        geoConfidence: c.geoConfidence,
      })),
    },
    chosenLocation: input.chosen
      ? {
          pincode: input.chosen.pincode,
          officename: input.chosen.officename,
          district: input.chosen.district,
          state: input.chosen.state,
          lat: input.chosen.lat,
          lon: input.chosen.lon,
          matchLevel: input.chosen.matchLevel,
        }
      : null,
    geoConfidence: input.chosen?.geoConfidence ?? 0,
    nearestFacility: nearest
      ? {
          name: nearest.name,
          phone: nearest.officialPhone,
          distanceKm: nearest.dist_km,
          specialties: nearest.specialties,
        }
      : null,
    facilityConfidence: nearest?.facilityConfidence ?? 0,
    hasCoverageGap: input.hasCoverageGap,
  };
}

export const CREATE_INTAKE_BUNDLES_SQL = `CREATE TABLE IF NOT EXISTS app.intake_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES app.sms_sessions(id) ON DELETE CASCADE,
  symptom_summary TEXT,
  location_evidence JSONB,
  chosen_location JSONB,
  geo_confidence DOUBLE PRECISION,
  nearest_facility JSONB,
  facility_confidence DOUBLE PRECISION,
  has_coverage_gap BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

/**
 * Persist a bundle to Lakebase. `sessionId` is optional so the chat agent can
 * record bundles even when there is no SMS session row.
 */
export async function persistIntakeBundle(
  lakebaseQuery: LakebaseQueryFn,
  bundle: IntakeBundle,
  sessionId: string | null = null,
): Promise<string> {
  const result = await lakebaseQuery(
    `INSERT INTO app.intake_bundles
       (session_id, symptom_summary, location_evidence, chosen_location,
        geo_confidence, nearest_facility, facility_confidence, has_coverage_gap)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      sessionId,
      bundle.symptomSummary,
      JSON.stringify(bundle.locationEvidence),
      bundle.chosenLocation ? JSON.stringify(bundle.chosenLocation) : null,
      bundle.geoConfidence,
      bundle.nearestFacility ? JSON.stringify(bundle.nearestFacility) : null,
      bundle.facilityConfidence,
      bundle.hasCoverageGap,
    ],
  );
  const id = result.rows[0]?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}
