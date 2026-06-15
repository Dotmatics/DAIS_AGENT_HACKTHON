//#region server/lib/intake-bundle.ts
function candidateLabel(c) {
	return [
		c.officename,
		c.district,
		c.state
	].filter(Boolean).join(", ") || "Unknown";
}
function buildIntakeBundle(input) {
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
				geoConfidence: c.geoConfidence
			}))
		},
		chosenLocation: input.chosen ? {
			pincode: input.chosen.pincode,
			officename: input.chosen.officename,
			district: input.chosen.district,
			state: input.chosen.state,
			lat: input.chosen.lat,
			lon: input.chosen.lon,
			matchLevel: input.chosen.matchLevel
		} : null,
		geoConfidence: input.chosen?.geoConfidence ?? 0,
		nearestFacility: nearest ? {
			name: nearest.name,
			phone: nearest.officialPhone,
			distanceKm: nearest.dist_km,
			specialties: nearest.specialties
		} : null,
		facilityConfidence: nearest?.facilityConfidence ?? 0,
		hasCoverageGap: input.hasCoverageGap
	};
}
const CREATE_INTAKE_BUNDLES_SQL = `CREATE TABLE IF NOT EXISTS app.intake_bundles (
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
async function persistIntakeBundle(lakebaseQuery, bundle, sessionId = null) {
	const id = (await lakebaseQuery(`INSERT INTO app.intake_bundles
       (session_id, symptom_summary, location_evidence, chosen_location,
        geo_confidence, nearest_facility, facility_confidence, has_coverage_gap)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`, [
		sessionId,
		bundle.symptomSummary,
		JSON.stringify(bundle.locationEvidence),
		bundle.chosenLocation ? JSON.stringify(bundle.chosenLocation) : null,
		bundle.geoConfidence,
		bundle.nearestFacility ? JSON.stringify(bundle.nearestFacility) : null,
		bundle.facilityConfidence,
		bundle.hasCoverageGap
	])).rows[0]?.id;
	return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

//#endregion
export { CREATE_INTAKE_BUNDLES_SQL, buildIntakeBundle, persistIntakeBundle };