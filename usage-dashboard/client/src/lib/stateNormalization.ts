// Maps sms_sessions.state abbreviations → NFHS-5 state_ut canonical names (for state table joins)
export const NORMALIZATION_MAP: Record<string, string> = {
  'UP': 'Uttar Pradesh',
  'MP': 'Madhya Pradesh',
  'UK': 'Uttarakhand',
  'HP': 'Himachal Pradesh',
  'J&K': 'Jammu & Kashmir',
  'JK': 'Jammu & Kashmir',
  'TN': 'Tamil Nadu',
  'AP': 'Andhra Pradesh',
  'WB': 'West Bengal',
  'MH': 'Maharashtra',
  'KA': 'Karnataka',
  'KL': 'Kerala',
  'RJ': 'Rajasthan',
  'GJ': 'Gujarat',
  'PB': 'Punjab',
  'HR': 'Haryana',
  'BR': 'Bihar',
  'JH': 'Jharkhand',
  'OD': 'Odisha',
  'OR': 'Odisha',
  'AS': 'Assam',
  'CG': 'Chhattisgarh',
  'DL': 'Delhi',
  'TS': 'Telangana',
  'GA': 'Goa',
};

// Maps sms_sessions.state abbreviations → datamaps GeoJSON name strings (for choropleth fill)
// datamaps uses legacy spellings: Orissa, Uttaranchal, "Jammu and Kashmir"
export const GEO_NAME_MAP: Record<string, string> = {
  ...NORMALIZATION_MAP,
  'OD': 'Orissa',
  'OR': 'Orissa',
  'UK': 'Uttaranchal',
  'J&K': 'Jammu and Kashmir',
  'JK': 'Jammu and Kashmir',
  // Full modern names → datamaps legacy names (defensive: handles if sms_sessions.state stores full names)
  'Odisha': 'Orissa',
  'Uttarakhand': 'Uttaranchal',
  'Jammu & Kashmir': 'Jammu and Kashmir',
};

export function normalizeState(state: string): string {
  return NORMALIZATION_MAP[state.trim()] ?? state.trim();
}

// Converts sms_sessions.state to the name used in the bundled datamaps GeoJSON
export function toGeoName(state: string): string {
  return GEO_NAME_MAP[state.trim()] ?? state.trim();
}
