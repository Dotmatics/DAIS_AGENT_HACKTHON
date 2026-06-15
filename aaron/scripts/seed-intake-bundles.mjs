// Seed mock intake bundles into intake_app.intake_bundles for demo/testing.
//
// USAGE:
//   node scripts/seed-intake-bundles.mjs           # skips if rows already exist
//   node scripts/seed-intake-bundles.mjs --force   # truncates and re-seeds
//   DRY_RUN=1 node scripts/seed-intake-bundles.mjs # print row count only
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const PROFILE = process.env.DATABRICKS_CONFIG_PROFILE ?? 'dais-2026-lakebase';
const HOST = 'ep-floral-sound-d8tq49r1.database.us-east-2.cloud.databricks.com';
const DATABASE = 'databricks_postgres';
const ENDPOINT = 'projects/dais-2026-app/branches/production/endpoints/primary';
const USER = 'aaron_dais_2026@icloud.com';
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.env.DRY_RUN === '1';

function getToken() {
  const out = execFileSync(
    'databricks',
    ['postgres', 'generate-database-credential', ENDPOINT, '--profile', PROFILE, '-o', 'json'],
    { encoding: 'utf-8' },
  );
  const token = JSON.parse(out).token;
  if (!token) throw new Error('No token returned from generate-database-credential');
  return token;
}

// Helpers
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function daysAgo(n) { return new Date(Date.now() - n * 86_400_000); }
function hoursAgo(n) { return new Date(Date.now() - n * 3_600_000); }

const STATES = [
  {
    state: 'Bihar', districts: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga'],
    pincodes: ['800001', '823001', '842001', '812001', '846001'],
    latRange: [24.5, 27.5], lonRange: [83.5, 88.0],
    gapRate: 0.65,
  },
  {
    state: 'Jharkhand', districts: ['Ranchi', 'Dhanbad', 'Jamshedpur', 'Bokaro', 'Hazaribagh'],
    pincodes: ['834001', '826001', '831001', '827001', '825301'],
    latRange: [21.9, 25.3], lonRange: [83.3, 87.9],
    gapRate: 0.60,
  },
  {
    state: 'Uttar Pradesh', districts: ['Lucknow', 'Varanasi', 'Agra', 'Kanpur', 'Allahabad'],
    pincodes: ['226001', '221001', '282001', '208001', '211001'],
    latRange: [23.8, 30.4], lonRange: [77.1, 84.6],
    gapRate: 0.50,
  },
  {
    state: 'Rajasthan', districts: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner'],
    pincodes: ['302001', '342001', '313001', '324001', '334001'],
    latRange: [23.0, 30.2], lonRange: [69.5, 78.3],
    gapRate: 0.45,
  },
  {
    state: 'Madhya Pradesh', districts: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Rewa'],
    pincodes: ['462001', '452001', '482001', '474001', '486001'],
    latRange: [21.1, 26.9], lonRange: [74.0, 82.8],
    gapRate: 0.42,
  },
  {
    state: 'Odisha', districts: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur'],
    pincodes: ['751001', '753001', '769001', '760001', '768001'],
    latRange: [17.8, 22.6], lonRange: [81.4, 87.5],
    gapRate: 0.38,
  },
  {
    state: 'West Bengal', districts: ['Kolkata', 'Howrah', 'Asansol', 'Siliguri', 'Durgapur'],
    pincodes: ['700001', '711101', '713301', '734001', '713201'],
    latRange: [21.4, 27.2], lonRange: [85.8, 89.9],
    gapRate: 0.30,
  },
  {
    state: 'Maharashtra', districts: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'],
    pincodes: ['400001', '411001', '440001', '422001', '431001'],
    latRange: [15.6, 22.0], lonRange: [72.6, 80.9],
    gapRate: 0.22,
  },
  {
    state: 'Karnataka', districts: ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi'],
    pincodes: ['560001', '570001', '580020', '575001', '590001'],
    latRange: [11.6, 18.5], lonRange: [74.0, 78.6],
    gapRate: 0.18,
  },
  {
    state: 'Gujarat', districts: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
    pincodes: ['380001', '395001', '390001', '360001', '364001'],
    latRange: [20.1, 24.7], lonRange: [68.2, 74.5],
    gapRate: 0.20,
  },
];

const SYMPTOMS = [
  'Persistent fever for 3 days, fatigue, and mild headache',
  'Prenatal checkup — 6 months pregnant, first visit to health facility',
  'Child with diarrhea and dehydration, 2 years old',
  'Chest pain and shortness of breath since yesterday',
  'Severe abdominal pain, vomiting, no bowel movement for 2 days',
  'Skin rash spreading across arms and torso, started 4 days ago',
  'High blood pressure follow-up, needs medication refill',
  'Cough with blood in sputum, night sweats, weight loss',
  'Eye infection, redness and discharge in both eyes',
  'Elderly patient with joint pain and difficulty walking',
  'Postpartum care — delivered 10 days ago, wound not healing',
  'Child vaccination — due for 9-month immunisation',
  'Dental pain, swollen jaw, unable to eat for 2 days',
  'Suspected malaria — high fever with chills, returning from forest area',
  'Burn injury on hand, needs wound dressing',
  'Mental health support — anxiety and sleep disturbance for 3 weeks',
  'Diabetes follow-up, blood sugar uncontrolled',
  'Suspected typhoid — sustained fever, rose spots on abdomen',
  'Snake bite — 2 hours ago, limb swelling',
  'Anaemia — extreme fatigue, pale conjunctiva, teenage girl',
];

const FACILITIES = [
  { name: 'Primary Health Centre Rampur', phone: '06112-234567', specialties: ['general', 'maternal'] },
  { name: 'District Hospital Patna', phone: '0612-2297631', specialties: ['general', 'emergency', 'surgery'] },
  { name: 'Community Health Centre Koderma', phone: '06534-222001', specialties: ['general', 'maternal', 'paediatrics'] },
  { name: 'Sub-District Hospital Gaya', phone: '0631-2221543', specialties: ['general', 'surgery'] },
  { name: 'PHC Nalanda Rural', phone: '06112-242100', specialties: ['general', 'maternal'] },
  { name: 'Jan Aushadhi Kendra Varanasi', phone: '0542-2502345', specialties: ['pharmacy', 'general'] },
  { name: 'AIIMS Patna OPD', phone: '0612-2451070', specialties: ['general', 'emergency', 'surgery', 'cardiology'] },
  { name: 'Urban PHC Jamshedpur', phone: '0657-2426011', specialties: ['general', 'maternal', 'paediatrics'] },
  { name: 'Zila Parishad Hospital Ranchi', phone: '0651-2331011', specialties: ['general', 'surgery', 'emergency'] },
  { name: 'Mobile Health Unit Block 4', phone: null, specialties: ['general', 'maternal'] },
];

function buildRow(stateConfig, createdAt) {
  const idx = Math.floor(Math.random() * stateConfig.districts.length);
  const district = stateConfig.districts[idx];
  const pincode = stateConfig.pincodes[idx];
  const lat = rand(...stateConfig.latRange);
  const lon = rand(...stateConfig.lonRange);
  const hasCoverageGap = Math.random() < stateConfig.gapRate;
  const distanceKm = hasCoverageGap ? rand(52, 180) : rand(2, 48);
  const facility = pick(FACILITIES);

  return {
    symptom_summary: pick(SYMPTOMS),
    location_evidence: JSON.stringify({
      pincode,
      matchLevel: pick(['exact', 'district', 'state']),
      rawInput: `${district}, ${stateConfig.state}`,
    }),
    chosen_location: JSON.stringify({
      pincode,
      officename: `${district} HO`,
      district,
      state: stateConfig.state,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      matchLevel: 'exact',
    }),
    geo_confidence: +rand(0.55, 0.98).toFixed(2),
    nearest_facility: JSON.stringify({
      name: facility.name,
      phone: facility.phone,
      distanceKm: +distanceKm.toFixed(1),
      specialties: facility.specialties,
    }),
    facility_confidence: +rand(0.50, 0.96).toFixed(2),
    has_coverage_gap: hasCoverageGap,
    created_at: createdAt.toISOString(),
  };
}

function generateRows() {
  const rows = [];
  // Spread ~50 rows over the last 7 days
  for (let i = 0; i < 50; i++) {
    const stateConfig = pick(STATES);
    const hoursBack = rand(0, 168); // up to 7 days
    const createdAt = hoursAgo(hoursBack);
    rows.push(buildRow(stateConfig, createdAt));
  }
  return rows;
}

async function main() {
  if (DRY_RUN) {
    const rows = generateRows();
    console.log(`DRY_RUN: would insert ${rows.length} rows`);
    const byState = {};
    rows.forEach(r => {
      const s = JSON.parse(r.chosen_location).state;
      byState[s] = (byState[s] ?? 0) + 1;
    });
    console.table(byState);
    return;
  }

  const client = new pg.Client({
    host: HOST,
    port: 5432,
    database: DATABASE,
    user: USER,
    password: getToken(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Connected to ${HOST}/${DATABASE} as ${USER}`);

  const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM intake_app.intake_bundles');
  const existingCount = existing[0].n;
  console.log(`Existing rows: ${existingCount}`);

  if (existingCount > 0 && !FORCE) {
    console.log('Rows already present. Use --force to truncate and re-seed.');
    await client.end();
    return;
  }

  if (FORCE && existingCount > 0) {
    await client.query('TRUNCATE intake_app.intake_bundles');
    console.log('Truncated existing rows.');
  }

  const rows = generateRows();
  console.log(`Inserting ${rows.length} rows...`);

  for (const row of rows) {
    await client.query(
      `INSERT INTO intake_app.intake_bundles
        (symptom_summary, location_evidence, chosen_location, geo_confidence,
         nearest_facility, facility_confidence, has_coverage_gap, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.symptom_summary,
        row.location_evidence,
        row.chosen_location,
        row.geo_confidence,
        row.nearest_facility,
        row.facility_confidence,
        row.has_coverage_gap,
        row.created_at,
      ],
    );
  }

  const { rows: after } = await client.query('SELECT COUNT(*)::int AS n FROM intake_app.intake_bundles');
  console.log(`Done. Total rows now: ${after[0].n}`);

  await client.end();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
