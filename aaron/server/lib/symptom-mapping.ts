const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  cardiology: ['chest pain', 'heart', 'palpitation', 'cardiac', 'breathless', 'breathlessness'],
  emergencyMedicine: ['emergency', 'accident', 'injury', 'bleeding', 'unconscious', 'severe'],
  pediatrics: ['child', 'baby', 'infant', 'pediatric', 'newborn'],
  gynecologyAndObstetrics: ['pregnant', 'pregnancy', 'labor', 'menstrual', 'gynec'],
  pulmonology: ['cough', 'asthma', 'breathing', 'respiratory', 'lung'],
  neurology: ['headache', 'seizure', 'stroke', 'dizzy', 'dizziness', 'numbness'],
  gastroenterology: ['stomach', 'vomit', 'vomiting', 'diarrhea', 'diarrhoea', 'abdominal', 'nausea'],
  orthopedics: ['bone', 'fracture', 'joint', 'sprain', 'back pain'],
  generalMedicine: ['fever', 'weak', 'fatigue', 'sick', 'ill'],
};

export function specialtyFilterForSymptoms(symptoms: string): string {
  const lower = symptoms.toLowerCase();
  for (const [specialty, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return specialty;
    }
  }
  return '';
}

export const GAP_THRESHOLD_KM = 50;
