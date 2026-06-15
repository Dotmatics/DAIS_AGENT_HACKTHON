import { GAP_THRESHOLD_KM, classifySymptoms } from "./symptom-mapping.js";
import { sql } from "@databricks/appkit";

//#region server/lib/facility-lookup.ts
function toStr(v) {
	if (v == null) return null;
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return null;
}
function mapFacilityRow(row, specialtyFilter, geoConfidence) {
	const distKm = Number(row.dist_km);
	const specialties = toStr(row.specialties);
	const capability = toStr(row.capability);
	const officialPhone = toStr(row.officialPhone);
	return {
		name: toStr(row.name) ?? "",
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
			hasPhone: officialPhone != null && officialPhone.trim() !== "",
			geoConfidence
		})
	};
}
/**
* Confidence that a facility is the right place to treat the user's symptoms.
* Combines proximity (closer is better, hard penalty past the coverage gap),
* specialty/capability match, presence of a contact number, and the upstream
* geographic confidence (an uncertain location caps facility confidence).
*/
function facilityConfidence(args) {
	const { distKm, specialtyFilter, specialties, capability, hasPhone, geoConfidence } = args;
	const proximity = distKm <= 5 ? 1 : distKm >= GAP_THRESHOLD_KM ? .15 : Math.max(.15, 1 - distKm / GAP_THRESHOLD_KM);
	let specialtyScore = .5;
	if (specialtyFilter) specialtyScore = `${specialties ?? ""} ${capability ?? ""}`.toLowerCase().includes(specialtyFilter.toLowerCase()) ? 1 : .35;
	const phoneScore = hasPhone ? 1 : .7;
	const capped = (.5 * proximity + .3 * specialtyScore + .2 * phoneScore) * (.6 + .4 * clamp01(geoConfidence));
	return Number(clamp01(capped).toFixed(3));
}
function clamp01(v) {
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
/**
* Find facilities near an explicit lat/lon (resolved from a pincode or from
* descriptors). Computes a per-facility confidence that blends proximity,
* specialty match, contact availability, and the upstream geographic
* confidence so an uncertain location does not produce an overconfident pick.
*/
async function findFacilitiesByLatLon(analyticsQuery, lat, lon, symptoms, geoConfidence = .9) {
	const classification = classifySymptoms(symptoms);
	const rows = ((await analyticsQuery(NEARBY_FACILITIES_BY_LATLON_SQL, {
		lat: sql.double(lat),
		lon: sql.double(lon),
		specialty_filter: sql.string(classification.specialty)
	})).rows ?? []).map((r) => mapFacilityRow(r, classification.specialty, geoConfidence));
	const nearest = rows[0]?.dist_km ?? null;
	return {
		facilities: rows,
		hasCoverageGap: nearest === null || nearest > GAP_THRESHOLD_KM,
		nearestDistanceKm: nearest,
		specialty: classification.specialty,
		symptomConfidence: classification.confidence
	};
}

//#endregion
export { findFacilitiesByLatLon };