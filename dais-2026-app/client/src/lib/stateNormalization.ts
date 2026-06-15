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

export function normalizeState(state: string): string {
  return NORMALIZATION_MAP[state.trim()] ?? state.trim();
}
