import { createAgent, tool, type AgentTool } from '@databricks/appkit/beta';
import { z } from 'zod';
import {
  findFacilitiesByLatLon,
  type AnalyticsQueryFn,
  type FacilityResult,
} from '../lib/facility-lookup';
import {
  resolveLocation,
  type LocationCandidate,
} from '../lib/location-resolver';
import {
  buildIntakeBundle,
  persistIntakeBundle,
  type IntakeBundle,
} from '../lib/intake-bundle';
import type { LakebaseQueryFn } from '../lib/sms-processor';

export interface HealthToolDeps {
  analyticsQuery: AnalyticsQueryFn;
  lakebaseQuery: LakebaseQueryFn;
}

function candidateSummary(c: LocationCandidate) {
  return {
    pincode: c.pincode,
    place: c.officename,
    district: c.district,
    state: c.state,
    lat: Number(c.lat.toFixed(5)),
    lon: Number(c.lon.toFixed(5)),
    matchLevel: c.matchLevel,
    geoConfidence: Number(c.geoConfidence.toFixed(2)),
  };
}

function facilitySummary(f: FacilityResult) {
  return {
    name: f.name,
    phone: f.officialPhone,
    distanceKm: Number(f.dist_km.toFixed(1)),
    specialties: f.specialties,
    facilityConfidence: f.facilityConfidence,
  };
}

/**
 * Build the three custom intake tools. They are returned as a keyed record so
 * they can be (a) registered as ambient tools on the agents plugin and
 * referenced from markdown frontmatter, and (b) attached to a code agent.
 */
export function createHealthTools(deps: HealthToolDeps): Record<string, AgentTool> {
  const resolveLocationTool = tool({
    description:
      'Resolve an Indian user location from a 6-digit pincode OR free-text descriptors ' +
      '(town / post office name, division, district, state). Pass `pincode` when the user ' +
      'gave one; otherwise pass `descriptors` (and optionally `district`/`state`) with ' +
      'whatever the user said about where they are. Returns a best-first list of candidate ' +
      'locations, each with lat/lon and a geoConfidence (0..1), plus `needsDisambiguation`: ' +
      'when true, ASK the user a clarifying question (e.g. which district, nearest town) ' +
      'and call this tool again with the added detail before proceeding. When false, the ' +
      'top candidate is a confident match. Read-only.',
    schema: z.object({
      pincode: z.string().optional().describe('6-digit Indian pincode, if the user provided one'),
      descriptors: z
        .string()
        .optional()
        .describe('Free text describing the location: town, post office, landmark, area'),
      district: z.string().optional().describe('District name if the user named one'),
      state: z.string().optional().describe('State name if the user named one'),
    }),
    annotations: { effect: 'read' },
    execute: async (args) => {
      const resolution = await resolveLocation(deps.analyticsQuery, {
        pincode: args.pincode ?? null,
        descriptors: args.descriptors ?? null,
        district: args.district ?? null,
        state: args.state ?? null,
      });
      return {
        needsDisambiguation: resolution.needsDisambiguation,
        evidence: resolution.evidence,
        candidates: resolution.candidates.map(candidateSummary),
      };
    },
  });

  const matchFacilitiesTool = tool({
    description:
      'Find the nearest health facilities able to treat the user, given their resolved ' +
      'location (lat/lon from resolve_location) and their symptoms. Symptoms are mapped to ' +
      'a medical specialty internally. Pass `geoConfidence` from the chosen location so the ' +
      "result's facilityConfidence reflects location certainty. Returns ranked facilities " +
      '(name, phone, distanceKm, specialties, facilityConfidence 0..1), the derived ' +
      'specialty, a symptomConfidence (0..1), and `hasCoverageGap` (true when the nearest ' +
      'facility is >50 km away). Read-only.',
    schema: z.object({
      lat: z.number().describe('Latitude of the chosen location'),
      lon: z.number().describe('Longitude of the chosen location'),
      symptoms: z.string().describe("The user's described symptoms"),
      geoConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Geographic confidence of the chosen location (0..1), from resolve_location'),
    }),
    annotations: { effect: 'read' },
    execute: async (args) => {
      const match = await findFacilitiesByLatLon(
        deps.analyticsQuery,
        args.lat,
        args.lon,
        args.symptoms,
        args.geoConfidence ?? 0.9,
      );
      return {
        specialty: match.specialty,
        symptomConfidence: Number(match.symptomConfidence.toFixed(2)),
        hasCoverageGap: match.hasCoverageGap,
        nearestDistanceKm:
          match.nearestDistanceKm == null ? null : Number(match.nearestDistanceKm.toFixed(1)),
        facilities: match.facilities.map(facilitySummary),
      };
    },
  });

  const buildBundleTool = tool({
    description:
      'Assemble and persist the final intake bundle once a location is confidently chosen ' +
      'and facilities have been matched. Provide the symptom summary, the raw inputs used, ' +
      'the candidates considered, the chosen location, and the matched facilities (use the ' +
      'objects returned by resolve_location and match_facilities). Persists to Lakebase and ' +
      'returns the stored bundle (with a bundleId) including geoConfidence and ' +
      'facilityConfidence. Call this LAST, exactly once, before giving the user the summary.',
    schema: z.object({
      symptomSummary: z.string().describe('Concise summary of the user symptoms'),
      rawPincode: z.string().nullable().optional(),
      rawDescriptors: z.string().nullable().optional(),
      candidatesConsidered: z
        .array(
          z.object({
            pincode: z.string().nullable().optional(),
            place: z.string().nullable().optional(),
            district: z.string().nullable().optional(),
            state: z.string().nullable().optional(),
            lat: z.number(),
            lon: z.number(),
            matchLevel: z.string(),
            geoConfidence: z.number(),
          }),
        )
        .optional(),
      chosenLocation: z
        .object({
          pincode: z.string().nullable().optional(),
          place: z.string().nullable().optional(),
          district: z.string().nullable().optional(),
          state: z.string().nullable().optional(),
          lat: z.number(),
          lon: z.number(),
          matchLevel: z.string(),
          geoConfidence: z.number(),
        })
        .nullable(),
      facilities: z
        .array(
          z.object({
            name: z.string(),
            phone: z.string().nullable().optional(),
            distanceKm: z.number(),
            specialties: z.string().nullable().optional(),
            facilityConfidence: z.number(),
          }),
        )
        .default([]),
      hasCoverageGap: z.boolean().default(false),
    }),
    annotations: { effect: 'read' },
    execute: async (args) => {
      const toCandidate = (c: {
        pincode?: string | null;
        place?: string | null;
        district?: string | null;
        state?: string | null;
        lat: number;
        lon: number;
        matchLevel: string;
        geoConfidence: number;
      }): LocationCandidate => ({
        pincode: c.pincode ?? null,
        officename: c.place ?? null,
        divisionname: null,
        district: c.district ?? null,
        state: c.state ?? null,
        lat: c.lat,
        lon: c.lon,
        matchedRows: 1,
        matchLevel: (c.matchLevel as LocationCandidate['matchLevel']) ?? 'state',
        geoConfidence: c.geoConfidence,
      });

      const facilities: FacilityResult[] = args.facilities.map((f) => ({
        name: f.name,
        address_city: null,
        address_stateOrRegion: null,
        officialPhone: f.phone ?? null,
        specialties: f.specialties ?? null,
        capability: null,
        dist_km: f.distanceKm,
        facilityConfidence: f.facilityConfidence,
      }));

      const bundle: IntakeBundle = buildIntakeBundle({
        symptomSummary: args.symptomSummary,
        rawPincode: args.rawPincode ?? null,
        rawDescriptors: args.rawDescriptors ?? null,
        candidatesConsidered: (args.candidatesConsidered ?? []).map(toCandidate),
        chosen: args.chosenLocation ? toCandidate(args.chosenLocation) : null,
        facilities,
        hasCoverageGap: args.hasCoverageGap,
      });

      let bundleId = '';
      try {
        bundleId = await persistIntakeBundle(deps.lakebaseQuery, bundle, null);
      } catch (err) {
        console.warn('[intake] Failed to persist bundle:', (err as Error).message);
      }

      return { bundleId, bundle };
    },
  });

  return {
    resolve_location: resolveLocationTool,
    match_facilities: matchFacilitiesTool,
    build_intake_bundle: buildBundleTool,
  };
}

/**
 * Code-defined sub-agent that bundles the three intake tools. Registered so the
 * tools are reachable as a delegate (`agent-health-helper`) and so the tool
 * record can be reused as the ambient tool library for the markdown `intake`
 * agent.
 */
export function createHealthHelperAgent(deps: HealthToolDeps) {
  const tools = createHealthTools(deps);
  return createAgent({
    instructions:
      'You execute health-intake actions: resolve a location, match facilities, and build ' +
      'the intake bundle. Use the tools precisely and return their structured results.',
    tools,
  });
}
