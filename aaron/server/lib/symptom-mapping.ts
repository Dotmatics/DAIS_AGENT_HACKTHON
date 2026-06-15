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
  return classifySymptoms(symptoms).specialty;
}

export interface SymptomClassification {
  /** Best-matching facility specialty filter, or '' when nothing matched. */
  specialty: string;
  /** 0..1 confidence that the chosen specialty is the right one. */
  confidence: number;
  /** Keyword hits that drove the match (for transparency in the bundle). */
  matchedKeywords: string[];
}

/**
 * Map free-text symptoms to a facility specialty and a confidence score.
 * Confidence reflects how many keywords matched and whether a single specialty
 * dominated. Designed to be swapped for an LLM/Genie classifier later without
 * changing callers.
 */
export function classifySymptoms(symptoms: string): SymptomClassification {
  const lower = (symptoms ?? '').toLowerCase();
  if (!lower.trim()) {
    return { specialty: '', confidence: 0, matchedKeywords: [] };
  }

  let best: { specialty: string; hits: string[] } | null = null;
  let totalHits = 0;
  for (const [specialty, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    const hits = keywords.filter((kw) => lower.includes(kw));
    totalHits += hits.length;
    if (hits.length > 0 && (!best || hits.length > best.hits.length)) {
      best = { specialty, hits };
    }
  }

  if (!best) {
    // No specialty keywords; fall back to general medicine with low confidence.
    return { specialty: 'generalMedicine', confidence: 0.3, matchedKeywords: [] };
  }

  // Dominance: a clean single-specialty hit is more confident than a spread of
  // hits across several specialties.
  const dominance = best.hits.length / Math.max(totalHits, 1);
  const confidence = Math.max(
    0.4,
    Math.min(0.95, 0.5 + 0.15 * Math.min(best.hits.length, 3) + 0.15 * dominance),
  );
  return { specialty: best.specialty, confidence, matchedKeywords: best.hits };
}

export const GAP_THRESHOLD_KM = 50;
