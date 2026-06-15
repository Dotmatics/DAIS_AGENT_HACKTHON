import { describe, it, expect } from 'vitest';
import { classifySymptoms } from './symptom-mapping';
import {
  facilityConfidence,
  findFacilitiesByLatLon,
  type AnalyticsQueryFn,
} from './facility-lookup';
import {
  resolveLocation,
  resolvePincode,
  resolveDescriptors,
} from './location-resolver';
import { buildIntakeBundle } from './intake-bundle';
import type { LocationCandidate } from './location-resolver';

function mockAnalytics(rowsByShape: (query: string, params?: Record<string, unknown>) => Record<string, unknown>[]): AnalyticsQueryFn {
  return (query, params) => Promise.resolve({ rows: rowsByShape(query, params) });
}

describe('classifySymptoms', () => {
  it('maps chest pain to cardiology with high confidence', () => {
    const c = classifySymptoms('I have bad chest pain and palpitations');
    expect(c.specialty).toBe('cardiology');
    expect(c.confidence).toBeGreaterThan(0.6);
    expect(c.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('falls back to general medicine with low confidence when nothing matches', () => {
    const c = classifySymptoms('something vague and unclear');
    expect(c.specialty).toBe('generalMedicine');
    expect(c.confidence).toBeLessThan(0.5);
  });

  it('returns empty for blank input', () => {
    expect(classifySymptoms('').specialty).toBe('');
  });
});

describe('facilityConfidence', () => {
  it('is high for a close, specialty-matched facility with phone and certain location', () => {
    const score = facilityConfidence({
      distKm: 2,
      specialtyFilter: 'cardiology',
      specialties: 'cardiology, emergencyMedicine',
      capability: null,
      hasPhone: true,
      geoConfidence: 0.95,
    });
    expect(score).toBeGreaterThan(0.85);
  });

  it('is penalized when the facility is past the coverage-gap threshold', () => {
    const near = facilityConfidence({ distKm: 3, specialtyFilter: '', specialties: null, capability: null, hasPhone: true, geoConfidence: 0.9 });
    const far = facilityConfidence({ distKm: 80, specialtyFilter: '', specialties: null, capability: null, hasPhone: true, geoConfidence: 0.9 });
    expect(far).toBeLessThan(near);
  });

  it('is capped by low geographic confidence', () => {
    const certain = facilityConfidence({ distKm: 2, specialtyFilter: 'cardiology', specialties: 'cardiology', capability: null, hasPhone: true, geoConfidence: 0.95 });
    const uncertain = facilityConfidence({ distKm: 2, specialtyFilter: 'cardiology', specialties: 'cardiology', capability: null, hasPhone: true, geoConfidence: 0.3 });
    expect(uncertain).toBeLessThan(certain);
  });
});

describe('resolvePincode', () => {
  it('returns a single high-confidence candidate for a known pincode', async () => {
    const analytics = mockAnalytics(() => [
      {
        pincode: '504273',
        officename: 'Test S.O',
        divisionname: 'Test Division',
        district: 'ADILABAD',
        state: 'TELANGANA',
        lat: 19.1,
        lon: 78.5,
        matched_rows: 1,
      },
    ]);
    const res = await resolvePincode(analytics, '504273');
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].matchLevel).toBe('pincode');
    expect(res.candidates[0].geoConfidence).toBeGreaterThan(0.9);
    expect(res.needsDisambiguation).toBe(false);
  });

  it('flags disambiguation when the pincode is unknown', async () => {
    const res = await resolvePincode(mockAnalytics(() => []), '000000');
    expect(res.candidates).toHaveLength(0);
    expect(res.needsDisambiguation).toBe(true);
  });
});

describe('resolveDescriptors', () => {
  it('does not need disambiguation when one candidate clearly dominates', async () => {
    const analytics = mockAnalytics(() => [
      { officename: 'Film Nagar S.O', divisionname: 'Hyderabad City Division', district: 'HYDERABAD', state: 'TELANGANA', pincode: '500096', lat: 17.41, lon: 78.41, matched_rows: 1, score: 9 },
      { officename: 'Other S.O', divisionname: 'X', district: 'HYDERABAD', state: 'TELANGANA', pincode: '500001', lat: 17.4, lon: 78.5, matched_rows: 40, score: 2 },
    ]);
    const res = await resolveDescriptors(analytics, { text: 'Film Nagar' });
    expect(res.candidates[0].officename).toBe('Film Nagar S.O');
    expect(res.needsDisambiguation).toBe(false);
  });

  it('needs disambiguation when only a coarse state match is available', async () => {
    const analytics = mockAnalytics(() => [
      { officename: 'A S.O', divisionname: 'D1', district: 'D1', state: 'TELANGANA', pincode: '500001', lat: 17.4, lon: 78.5, matched_rows: 500, score: 2 },
      { officename: 'B S.O', divisionname: 'D2', district: 'D2', state: 'TELANGANA', pincode: '500002', lat: 18.0, lon: 79.0, matched_rows: 480, score: 2 },
    ]);
    const res = await resolveDescriptors(analytics, { state: 'Telangana' });
    expect(res.needsDisambiguation).toBe(true);
  });
});

describe('resolveLocation', () => {
  it('prefers a pincode embedded in descriptors over text matching', async () => {
    const analytics = mockAnalytics((q) => {
      if (q.includes('WHERE pincode = :pincode')) {
        return [{ pincode: '504273', officename: 'Pin S.O', divisionname: 'Div', district: 'ADILABAD', state: 'TELANGANA', lat: 19.1, lon: 78.5, matched_rows: 1 }];
      }
      return [];
    });
    const res = await resolveLocation(analytics, { descriptors: 'I am near 504273 somewhere' });
    expect(res.candidates[0].pincode).toBe('504273');
    expect(res.candidates[0].matchLevel).toBe('pincode');
  });
});

describe('findFacilitiesByLatLon + coverage gap', () => {
  it('flags a coverage gap when the nearest facility is far', async () => {
    const analytics = mockAnalytics(() => [
      { name: 'Far Clinic', address_city: 'X', address_stateOrRegion: 'Y', officialPhone: '123', specialties: 'generalMedicine', capability: null, dist_km: 75 },
    ]);
    const res = await findFacilitiesByLatLon(analytics, 19.1, 78.5, 'fever', 0.95);
    expect(res.hasCoverageGap).toBe(true);
    expect(res.facilities[0].facilityConfidence).toBeLessThan(0.6);
  });

  it('no coverage gap for a nearby facility', async () => {
    const analytics = mockAnalytics(() => [
      { name: 'Near Clinic', address_city: 'X', address_stateOrRegion: 'Y', officialPhone: '123', specialties: 'cardiology', capability: null, dist_km: 4 },
    ]);
    const res = await findFacilitiesByLatLon(analytics, 19.1, 78.5, 'chest pain', 0.95);
    expect(res.hasCoverageGap).toBe(false);
    expect(res.facilities[0].facilityConfidence).toBeGreaterThan(0.8);
  });
});

describe('buildIntakeBundle', () => {
  it('assembles a bundle with chosen location, nearest facility, and confidences', () => {
    const chosen: LocationCandidate = {
      pincode: '504273', officename: 'Test S.O', divisionname: 'Div', district: 'ADILABAD', state: 'TELANGANA',
      lat: 19.1, lon: 78.5, matchedRows: 1, matchLevel: 'pincode', geoConfidence: 0.95,
    };
    const bundle = buildIntakeBundle({
      symptomSummary: 'fever and chest pain',
      rawPincode: '504273',
      rawDescriptors: null,
      candidatesConsidered: [chosen],
      chosen,
      facilities: [
        { name: 'Clinic A', address_city: null, address_stateOrRegion: null, officialPhone: '123', specialties: 'cardiology', capability: null, dist_km: 5, facilityConfidence: 0.9 },
      ],
      hasCoverageGap: false,
    });
    expect(bundle.chosenLocation?.pincode).toBe('504273');
    expect(bundle.geoConfidence).toBe(0.95);
    expect(bundle.nearestFacility?.name).toBe('Clinic A');
    expect(bundle.facilityConfidence).toBe(0.9);
    expect(bundle.locationEvidence.candidatesConsidered).toHaveLength(1);
  });
});
