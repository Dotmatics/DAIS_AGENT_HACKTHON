//#region server/lib/symptom-mapping.ts
const SYMPTOM_KEYWORDS = {
	cardiology: [
		"chest pain",
		"heart",
		"palpitation",
		"cardiac",
		"breathless",
		"breathlessness"
	],
	emergencyMedicine: [
		"emergency",
		"accident",
		"injury",
		"bleeding",
		"unconscious",
		"severe"
	],
	pediatrics: [
		"child",
		"baby",
		"infant",
		"pediatric",
		"newborn"
	],
	gynecologyAndObstetrics: [
		"pregnant",
		"pregnancy",
		"labor",
		"menstrual",
		"gynec"
	],
	pulmonology: [
		"cough",
		"asthma",
		"breathing",
		"respiratory",
		"lung"
	],
	neurology: [
		"headache",
		"seizure",
		"stroke",
		"dizzy",
		"dizziness",
		"numbness"
	],
	gastroenterology: [
		"stomach",
		"vomit",
		"vomiting",
		"diarrhea",
		"diarrhoea",
		"abdominal",
		"nausea"
	],
	orthopedics: [
		"bone",
		"fracture",
		"joint",
		"sprain",
		"back pain"
	],
	generalMedicine: [
		"fever",
		"weak",
		"fatigue",
		"sick",
		"ill"
	]
};
/**
* Map free-text symptoms to a facility specialty and a confidence score.
* Confidence reflects how many keywords matched and whether a single specialty
* dominated. Designed to be swapped for an LLM/Genie classifier later without
* changing callers.
*/
function classifySymptoms(symptoms) {
	const lower = (symptoms ?? "").toLowerCase();
	if (!lower.trim()) return {
		specialty: "",
		confidence: 0,
		matchedKeywords: []
	};
	let best = null;
	let totalHits = 0;
	for (const [specialty, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
		const hits = keywords.filter((kw) => lower.includes(kw));
		totalHits += hits.length;
		if (hits.length > 0 && (!best || hits.length > best.hits.length)) best = {
			specialty,
			hits
		};
	}
	if (!best) return {
		specialty: "generalMedicine",
		confidence: .3,
		matchedKeywords: []
	};
	const dominance = best.hits.length / Math.max(totalHits, 1);
	const confidence = Math.max(.4, Math.min(.95, .5 + .15 * Math.min(best.hits.length, 3) + .15 * dominance));
	return {
		specialty: best.specialty,
		confidence,
		matchedKeywords: best.hits
	};
}
const GAP_THRESHOLD_KM = 50;

//#endregion
export { GAP_THRESHOLD_KM, classifySymptoms };