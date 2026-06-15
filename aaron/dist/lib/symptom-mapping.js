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
function specialtyFilterForSymptoms(symptoms) {
	const lower = symptoms.toLowerCase();
	for (const [specialty, keywords] of Object.entries(SYMPTOM_KEYWORDS)) if (keywords.some((kw) => lower.includes(kw))) return specialty;
	return "";
}
const GAP_THRESHOLD_KM = 50;

//#endregion
export { GAP_THRESHOLD_KM, specialtyFilterForSymptoms };