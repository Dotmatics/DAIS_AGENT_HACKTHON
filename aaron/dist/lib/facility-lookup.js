import { GAP_THRESHOLD_KM, specialtyFilterForSymptoms } from "./symptom-mapping.js";

//#region server/lib/facility-lookup.ts
function mapFacilityRow(row) {
	return {
		name: String(row.name ?? ""),
		address_city: row.address_city == null ? null : String(row.address_city),
		address_stateOrRegion: row.address_stateOrRegion == null ? null : String(row.address_stateOrRegion),
		officialPhone: row.officialPhone == null ? null : String(row.officialPhone),
		specialties: row.specialties == null ? null : String(row.specialties),
		dist_km: Number(row.dist_km)
	};
}
const NEARBY_FACILITIES_SQL = `
WITH user_loc AS (
  SELECT
    AVG(CAST(latitude AS DOUBLE)) AS lat,
    AVG(CAST(longitude AS DOUBLE)) AS lon,
    MAX(district) AS district,
    MAX(statename) AS state
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
SELECT name, address_city, address_stateOrRegion, officialPhone, specialties, dist_km
FROM scored
ORDER BY dist_km
LIMIT 5
`;
async function findNearbyFacilities(analyticsQuery, postalCode, symptoms) {
	const rows = ((await analyticsQuery(NEARBY_FACILITIES_SQL, {
		postal_code: postalCode,
		specialty_filter: specialtyFilterForSymptoms(symptoms)
	})).rows ?? []).map(mapFacilityRow);
	const nearest = rows[0]?.dist_km ?? null;
	return {
		facilities: rows,
		district: null,
		state: null,
		hasCoverageGap: nearest === null || nearest > GAP_THRESHOLD_KM,
		nearestDistanceKm: nearest
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
export { findNearbyFacilities, formatFacilitySmsReply };