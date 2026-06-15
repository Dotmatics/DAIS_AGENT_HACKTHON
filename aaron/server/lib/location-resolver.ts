import type { AnalyticsQueryFn } from './facility-lookup';

/**
 * A resolved (or candidate) geographic location derived from the India Post
 * pincode directory. `geoConfidence` is a 0..1 score describing how sure we
 * are that this candidate is the user's actual location, given the input.
 */
export interface LocationCandidate {
  pincode: string | null;
  officename: string | null;
  divisionname: string | null;
  district: string | null;
  state: string | null;
  lat: number;
  lon: number;
  /** Number of post-office rows that backed this candidate (granularity hint). */
  matchedRows: number;
  /** How the candidate was matched: 'pincode' | 'officename' | 'district' | 'state'. */
  matchLevel: LocationMatchLevel;
  geoConfidence: number;
}

export type LocationMatchLevel = 'pincode' | 'officename' | 'district' | 'state';

export interface LocationResolution {
  /** Ranked best-first candidates (highest geoConfidence first). */
  candidates: LocationCandidate[];
  /** True when the agent should ask a follow-up before committing to one location. */
  needsDisambiguation: boolean;
  /** Echoes the raw inputs so the bundle can record what evidence was used. */
  evidence: {
    pincode: string | null;
    descriptors: string | null;
  };
}

const PINCODE_RE = /\b(\d{6})\b/;

export function extractPincode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(PINCODE_RE);
  return m?.[1] ?? null;
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

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function pincodeConfidence(matchedRows: number): number {
  // A single post office for the pincode is the most precise; multiple offices
  // (a shared pincode) spread the centroid out a little.
  return matchedRows <= 1 ? 0.97 : 0.92;
}

function descriptorConfidence(level: LocationMatchLevel, score: number, matchedRows: number): number {
  // Base confidence by the finest column matched, modulated by how unique the
  // match is (fewer backing rows => a more specific place).
  const base =
    level === 'officename' ? 0.85 : level === 'district' ? 0.6 : 0.4;
  const uniqueness = matchedRows <= 2 ? 0.1 : matchedRows <= 10 ? 0.03 : -0.05;
  const scoreBoost = Math.min(score, 9) / 90; // up to +0.1
  return Math.max(0.2, Math.min(0.95, base + uniqueness + scoreBoost));
}

function classifyMatchLevel(score: number, hasOfficeHit: boolean, hasDistrictHit: boolean): LocationMatchLevel {
  if (hasOfficeHit) return 'officename';
  if (hasDistrictHit) return 'district';
  if (score > 0) return 'state';
  return 'state';
}

/**
 * Resolve a precise location from an exact 6-digit pincode. Returns a single
 * high-confidence candidate, or an empty resolution when the pincode is
 * unknown / has no geocoded post offices.
 */
export async function resolvePincode(
  analyticsQuery: AnalyticsQueryFn,
  pincode: string,
): Promise<LocationResolution> {
  const result = await analyticsQuery(PINCODE_LOOKUP_SQL, { pincode });
  const rows = result.rows ?? [];
  const candidates: LocationCandidate[] = rows
    .filter((r) => Number.isFinite(toNum(r.lat)) && Number.isFinite(toNum(r.lon)))
    .map((r) => {
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
        matchLevel: 'pincode' as const,
        geoConfidence: pincodeConfidence(matchedRows),
      };
    });

  return {
    candidates,
    needsDisambiguation: candidates.length === 0,
    evidence: { pincode, descriptors: null },
  };
}

export interface DescriptorHints {
  /** General free text (town / post office / landmark). */
  text?: string | null;
  /** Optional district hint if the user named one. */
  district?: string | null;
  /** Optional state hint if the user named one. */
  state?: string | null;
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
export async function resolveDescriptors(
  analyticsQuery: AnalyticsQueryFn,
  hints: DescriptorHints,
): Promise<LocationResolution> {
  const text = (hints.text ?? '').trim();
  const district = (hints.district ?? '').trim();
  const state = (hints.state ?? '').trim();

  const result = await analyticsQuery(DESCRIPTOR_LOOKUP_SQL, {
    q: text,
    district,
    state,
  });
  const rows = result.rows ?? [];

  const candidates: LocationCandidate[] = rows
    .filter((r) => Number.isFinite(toNum(r.lat)) && Number.isFinite(toNum(r.lon)))
    .map((r) => {
      const score = toNum(r.score) || 0;
      const matchedRows = toNum(r.matched_rows) || 1;
      const officeName = str(r.officename);
      const districtName = str(r.district);
      const hasOfficeHit =
        text !== '' &&
        ((officeName ?? '').toLowerCase().includes(text.toLowerCase()) ||
          (str(r.divisionname) ?? '').toLowerCase().includes(text.toLowerCase()));
      const hasDistrictHit =
        district !== '' && (districtName ?? '').toLowerCase().includes(district.toLowerCase());
      const level = classifyMatchLevel(score, hasOfficeHit, hasDistrictHit);
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
        geoConfidence: descriptorConfidence(level, score, matchedRows),
      };
    })
    .sort((a, b) => b.geoConfidence - a.geoConfidence);

  const needsDisambiguation = computeNeedsDisambiguation(candidates);

  return {
    candidates,
    needsDisambiguation,
    evidence: {
      pincode: null,
      descriptors: [text, district, state].filter(Boolean).join(' | ') || null,
    },
  };
}

function computeNeedsDisambiguation(candidates: LocationCandidate[]): boolean {
  if (candidates.length === 0) return true;
  const top = candidates[0];
  // High-confidence, clearly-dominant single match needs no follow-up.
  if (candidates.length === 1) return top.geoConfidence < 0.8;
  const second = candidates[1];
  const dominant = top.geoConfidence - second.geoConfidence >= 0.15;
  return !(dominant && top.geoConfidence >= 0.8);
}

/**
 * Combined entry point: prefer an exact pincode if present in the inputs,
 * otherwise fall back to descriptor matching.
 */
export async function resolveLocation(
  analyticsQuery: AnalyticsQueryFn,
  input: { pincode?: string | null; descriptors?: string | null; district?: string | null; state?: string | null },
): Promise<LocationResolution> {
  const pincode = input.pincode ?? extractPincode(input.descriptors);
  if (pincode) {
    const byPin = await resolvePincode(analyticsQuery, pincode);
    if (byPin.candidates.length > 0) return byPin;
  }
  return resolveDescriptors(analyticsQuery, {
    text: input.descriptors,
    district: input.district,
    state: input.state,
  });
}
