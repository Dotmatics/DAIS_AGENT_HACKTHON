import { sql } from "@databricks/appkit";

//#region server/lib/location-resolver.ts
const PINCODE_RE = /\b(\d{6})\b/;
function extractPincode(text) {
	if (!text) return null;
	return text.match(PINCODE_RE)?.[1] ?? null;
}
const PINCODE_LOOKUP_SQL = `
SELECT
  CAST(pincode AS STRING) AS pincode,
  MAX(officename) AS officename,
  MAX(divisionname) AS divisionname,
  MAX(district) AS district,
  MAX(statename) AS state,
  AVG(CAST(latitude AS DOUBLE)) AS lat,
  AVG(CAST(longitude AS DOUBLE)) AS lon,
  COUNT(*) AS matched_rows
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
WHERE pincode = :pincode
  AND latitude != 'NA' AND longitude != 'NA'
GROUP BY pincode
`;
/**
* Descriptor search: rank rows by how strongly free text matches the
* directory columns, then collapse to distinct (officename, district, state)
* locations. Centroid lat/lon per group; coarser matches get lower confidence.
*/
const DESCRIPTOR_LOOKUP_SQL = `
WITH scored AS (
  SELECT
    CAST(pincode AS STRING) AS pincode,
    officename,
    divisionname,
    district,
    statename AS state,
    CAST(latitude AS DOUBLE) AS lat,
    CAST(longitude AS DOUBLE) AS lon,
    (
      CASE WHEN :q != '' AND officename ILIKE concat('%', :q, '%') THEN 4 ELSE 0 END +
      CASE WHEN :q != '' AND divisionname ILIKE concat('%', :q, '%') THEN 3 ELSE 0 END +
      CASE WHEN :district != '' AND district ILIKE concat('%', :district, '%') THEN 5 ELSE 0 END +
      CASE WHEN :state != '' AND statename ILIKE concat('%', :state, '%') THEN 2 ELSE 0 END
    ) AS score
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
  WHERE latitude != 'NA' AND longitude != 'NA'
),
matched AS (
  SELECT * FROM scored WHERE score > 0
),
grouped AS (
  SELECT
    officename,
    MAX(divisionname) AS divisionname,
    district,
    state,
    MIN(pincode) AS pincode,
    AVG(lat) AS lat,
    AVG(lon) AS lon,
    COUNT(*) AS matched_rows,
    MAX(score) AS score
  FROM matched
  GROUP BY officename, district, state
)
SELECT officename, divisionname, district, state, pincode, lat, lon, matched_rows, score
FROM grouped
ORDER BY score DESC, matched_rows ASC
LIMIT 8
`;
function toNum(v) {
	return typeof v === "number" ? v : Number(v);
}
function str(v) {
	if (v == null) return null;
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return null;
}
function pincodeConfidence(matchedRows) {
	return matchedRows <= 1 ? .97 : .92;
}
function descriptorConfidence(level, score, matchedRows) {
	const base = level === "officename" ? .85 : level === "district" ? .6 : .4;
	const uniqueness = matchedRows <= 2 ? .1 : matchedRows <= 10 ? .03 : -.05;
	const scoreBoost = Math.min(score, 9) / 90;
	return Math.max(.2, Math.min(.95, base + uniqueness + scoreBoost));
}
function classifyMatchLevel(score, hasOfficeHit, hasDistrictHit) {
	if (hasOfficeHit) return "officename";
	if (hasDistrictHit) return "district";
	if (score > 0) return "state";
	return "state";
}
/**
* Resolve a precise location from an exact 6-digit pincode. Returns a single
* high-confidence candidate, or an empty resolution when the pincode is
* unknown / has no geocoded post offices.
*/
async function resolvePincode(analyticsQuery, pincode) {
	const candidates = ((await analyticsQuery(PINCODE_LOOKUP_SQL, { pincode: sql.string(pincode) })).rows ?? []).filter((r) => Number.isFinite(toNum(r.lat)) && Number.isFinite(toNum(r.lon))).map((r) => {
		const matchedRows = toNum(r.matched_rows) || 1;
		return {
			pincode: str(r.pincode),
			officename: str(r.officename),
			divisionname: str(r.divisionname),
			district: str(r.district),
			state: str(r.state),
			lat: toNum(r.lat),
			lon: toNum(r.lon),
			matchedRows,
			matchLevel: "pincode",
			geoConfidence: pincodeConfidence(matchedRows)
		};
	});
	return {
		candidates,
		needsDisambiguation: candidates.length === 0,
		evidence: {
			pincode,
			descriptors: null
		}
	};
}
/**
* Resolve candidate locations from free-text descriptors when the user has no
* pincode. Ranks directory rows by column match strength and returns the most
* plausible distinct places, each with its own geographic confidence.
*
* `needsDisambiguation` is true when no single candidate clearly dominates
* (multiple plausible candidates of similar confidence, or only coarse matches),
* signalling the agent to ask a clarifying follow-up.
*/
async function resolveDescriptors(analyticsQuery, hints) {
	const text = (hints.text ?? "").trim();
	const district = (hints.district ?? "").trim();
	const state = (hints.state ?? "").trim();
	const candidates = ((await analyticsQuery(DESCRIPTOR_LOOKUP_SQL, {
		q: sql.string(text),
		district: sql.string(district),
		state: sql.string(state)
	})).rows ?? []).filter((r) => Number.isFinite(toNum(r.lat)) && Number.isFinite(toNum(r.lon))).map((r) => {
		const score = toNum(r.score) || 0;
		const matchedRows = toNum(r.matched_rows) || 1;
		const officeName = str(r.officename);
		const districtName = str(r.district);
		const level = classifyMatchLevel(score, text !== "" && ((officeName ?? "").toLowerCase().includes(text.toLowerCase()) || (str(r.divisionname) ?? "").toLowerCase().includes(text.toLowerCase())), district !== "" && (districtName ?? "").toLowerCase().includes(district.toLowerCase()));
		return {
			pincode: str(r.pincode),
			officename: officeName,
			divisionname: str(r.divisionname),
			district: districtName,
			state: str(r.state),
			lat: toNum(r.lat),
			lon: toNum(r.lon),
			matchedRows,
			matchLevel: level,
			geoConfidence: descriptorConfidence(level, score, matchedRows)
		};
	}).sort((a, b) => b.geoConfidence - a.geoConfidence);
	return {
		candidates,
		needsDisambiguation: computeNeedsDisambiguation(candidates),
		evidence: {
			pincode: null,
			descriptors: [
				text,
				district,
				state
			].filter(Boolean).join(" | ") || null
		}
	};
}
function computeNeedsDisambiguation(candidates) {
	if (candidates.length === 0) return true;
	const top = candidates[0];
	if (candidates.length === 1) return top.geoConfidence < .8;
	const second = candidates[1];
	return !(top.geoConfidence - second.geoConfidence >= .15 && top.geoConfidence >= .8);
}
/**
* Combined entry point: prefer an exact pincode if present in the inputs,
* otherwise fall back to descriptor matching.
*/
async function resolveLocation(analyticsQuery, input) {
	const pincode = input.pincode ?? extractPincode(input.descriptors);
	if (pincode) {
		const byPin = await resolvePincode(analyticsQuery, pincode);
		if (byPin.candidates.length > 0) return byPin;
	}
	return resolveDescriptors(analyticsQuery, {
		text: input.descriptors,
		district: input.district,
		state: input.state
	});
}

//#endregion
export { resolveLocation };