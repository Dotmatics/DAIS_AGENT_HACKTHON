import { GAP_THRESHOLD_KM, classifySymptoms, specialtyFilterForSymptoms } from "./symptom-mapping.js";

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
const NEARBY_FACILITIES_SQL = `
WITH user_loc AS (
  SELECT
    AVG(CAST(latitude AS DOUBLE)) AS lat,
    AVG(CAST(longitude AS DOUBLE)) AS lon
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
  WHERE pincode = :postal_code AND latitude != 'NA'
),
scored AS (
  SELECT
    f.name,
    f.address_city,
    f.address_stateOrRegion,
    f.officialPhone,
    f.specialties,
    f.capability,
    6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(f.latitude - u.lat) / 2), 2) +
      COS(RADIANS(u.lat)) * COS(RADIANS(f.latitude)) *
      POWER(SIN(RADIANS(f.longitude - u.lon) / 2), 2)
    )) AS dist_km
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  CROSS JOIN user_loc u
  WHERE f.latitude IS NOT NULL
    AND f.organization_type = 'facility'
    AND (
      :specialty_filter = ''
      OR f.specialties ILIKE concat('%', :specialty_filter, '%')
      OR f.capability ILIKE concat('%', :specialty_filter, '%')
    )
)
SELECT name, address_city, address_stateOrRegion, officialPhone, specialties, capability, dist_km
FROM scored
ORDER BY dist_km
LIMIT 5
`;
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
async function findNearbyFacilities(analyticsQuery, postalCode, symptoms) {
	const specialtyFilter = specialtyFilterForSymptoms(symptoms);
	const rows = ((await analyticsQuery(NEARBY_FACILITIES_SQL, {
		postal_code: postalCode,
		specialty_filter: specialtyFilter
	})).rows ?? []).map((r) => mapFacilityRow(r, specialtyFilter, .95));
	const nearest = rows[0]?.dist_km ?? null;
	return {
		facilities: rows,
		district: null,
		state: null,
		hasCoverageGap: nearest === null || nearest > GAP_THRESHOLD_KM,
		nearestDistanceKm: nearest
	};
}
/**
* Find facilities near an explicit lat/lon (resolved from a pincode or from
* descriptors). Computes a per-facility confidence that blends proximity,
* specialty match, contact availability, and the upstream geographic
* confidence so an uncertain location does not produce an overconfident pick.
*/
async function findFacilitiesByLatLon(analyticsQuery, lat, lon, symptoms, geoConfidence = .9) {
	const classification = classifySymptoms(symptoms);
	const rows = ((await analyticsQuery(NEARBY_FACILITIES_BY_LATLON_SQL, {
		lat,
		lon,
		specialty_filter: classification.specialty
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
function formatFacilitySmsReply(facilities, hasCoverageGap, nearestDistanceKm) {
	if (facilities.length === 0) return "No facilities found near your pincode. Please contact local emergency services if urgent.";
	let msg = `Nearest facilities:\n${facilities.slice(0, 3).map((f, i) => {
		const phone = f.officialPhone ?? "no phone listed";
		return `${i + 1}. ${f.name} (${Math.round(f.dist_km)}km) ${phone}`;
	}).join("\n")}`;
	if (hasCoverageGap && nearestDistanceKm !== null) msg += `\n\nCoverage gap: nearest facility is ${Math.round(nearestDistanceKm)}km away.`;
	return msg.slice(0, 480);
}

//#endregion
export { findFacilitiesByLatLon, findNearbyFacilities, formatFacilitySmsReply };