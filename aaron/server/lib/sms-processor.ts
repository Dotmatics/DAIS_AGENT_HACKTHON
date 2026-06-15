import { findNearbyFacilities, formatFacilitySmsReply, type AnalyticsQueryFn } from './facility-lookup';
import { GAP_THRESHOLD_KM } from './symptom-mapping';

export interface SmsSession {
  id: string;
  phone: string;
  status: string;
  postal_code: string | null;
  age: number | null;
  symptoms: string | null;
  district: string | null;
  state: string | null;
}

export type LakebaseQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

const PINCODE_RE = /\b(\d{6})\b/;
const AGE_RE = /\b(?:age|aged|i am|i'm)\s*(\d{1,3})\b/i;
const AGE_ONLY_RE = /^\s*(\d{1,3})\s*$/;

function extractPincode(text: string): string | null {
  const m = text.match(PINCODE_RE);
  return m?.[1] ?? null;
}

function extractAge(text: string): number | null {
  const m = text.match(AGE_RE) ?? text.match(AGE_ONLY_RE);
  if (!m) return null;
  const age = parseInt(m[1], 10);
  return age > 0 && age < 120 ? age : null;
}

function extractSymptoms(text: string, session: SmsSession): string | null {
  const lower = text.toLowerCase();
  const skip = ['pincode', 'postal', 'age', 'years old', 'hello', 'hi', 'help'];
  if (skip.some((s) => lower === s || lower.startsWith(s + ' '))) {
    return null;
  }
  if (extractPincode(text) || extractAge(text)) {
    return null;
  }
  if (text.trim().length >= 3) {
    return text.trim();
  }
  return session.symptoms;
}

function mapSessionRow(row: Record<string, unknown>): SmsSession {
  return {
    id: String(row.id),
    phone: String(row.phone),
    status: String(row.status),
    postal_code: row.postal_code == null ? null : String(row.postal_code),
    age: row.age == null ? null : Number(row.age),
    symptoms: row.symptoms == null ? null : String(row.symptoms),
    district: row.district == null ? null : String(row.district),
    state: row.state == null ? null : String(row.state),
  };
}

function mergeSession(session: SmsSession, text: string): Partial<SmsSession> {
  const updates: Partial<SmsSession> = {};
  const pin = extractPincode(text);
  const age = extractAge(text);
  const symptoms = extractSymptoms(text, session);

  if (pin) updates.postal_code = pin;
  if (age) updates.age = age;
  if (symptoms) updates.symptoms = symptoms;

  return updates;
}

function nextQuestion(session: SmsSession): string {
  if (!session.postal_code) {
    return 'What is your postal code (6-digit pincode)? This helps us find care near you.';
  }
  if (!session.age) {
    return 'How old are you? Please reply with your age in years.';
  }
  if (!session.symptoms) {
    return 'What symptoms are you experiencing? Describe how you feel.';
  }
  return '';
}

export async function processSmsMessage(
  lakebaseQuery: LakebaseQueryFn,
  analyticsQuery: AnalyticsQueryFn,
  phone: string,
  message: string,
): Promise<{ reply: string; session: SmsSession }> {
  const existing = await lakebaseQuery(
    `SELECT id, phone, status, postal_code, age, symptoms, district, state
     FROM app.sms_sessions WHERE phone = $1`,
    [phone],
  );

  let session: SmsSession;
  if (existing.rows.length === 0) {
    const created = await lakebaseQuery(
      `INSERT INTO app.sms_sessions (phone) VALUES ($1)
       RETURNING id, phone, status, postal_code, age, symptoms, district, state`,
      [phone],
    );
    session = mapSessionRow(created.rows[0]);
  } else {
    session = mapSessionRow(existing.rows[0]);
  }

  await lakebaseQuery(
    `INSERT INTO app.sms_messages (session_id, direction, body) VALUES ($1, 'inbound', $2)`,
    [session.id, message],
  );

  const updates = mergeSession(session, message);
  if (Object.keys(updates).length > 0) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(updates)) {
      sets.push(`${key} = $${idx++}`);
      params.push(val);
    }
    sets.push(`updated_at = now()`);
    params.push(session.id);
    const updated = await lakebaseQuery(
      `UPDATE app.sms_sessions SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, phone, status, postal_code, age, symptoms, district, state`,
      params,
    );
    session = mapSessionRow(updated.rows[0]);
  }

  const question = nextQuestion(session);
  if (question) {
    await lakebaseQuery(
      `INSERT INTO app.sms_messages (session_id, direction, body) VALUES ($1, 'outbound', $2)`,
      [session.id, question],
    );
    return { reply: question, session };
  }

  const { facilities, hasCoverageGap, nearestDistanceKm } = await findNearbyFacilities(
    analyticsQuery,
    session.postal_code!,
    session.symptoms!,
  );

  await lakebaseQuery(
    `DELETE FROM app.facility_recommendations WHERE session_id = $1`,
    [session.id],
  );

  for (let i = 0; i < facilities.length; i++) {
    const f = facilities[i];
    await lakebaseQuery(
      `INSERT INTO app.facility_recommendations
       (session_id, facility_name, facility_phone, distance_km, specialties, rank, is_nearest_appropriate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        f.name,
        f.officialPhone,
        f.dist_km,
        f.specialties,
        i + 1,
        i === 0,
      ],
    );
  }

  await lakebaseQuery(
    `INSERT INTO app.coverage_gaps (session_id, nearest_distance_km, gap_threshold_km, has_coverage_gap, symptoms, postal_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id) DO UPDATE SET
       nearest_distance_km = EXCLUDED.nearest_distance_km,
       has_coverage_gap = EXCLUDED.has_coverage_gap,
       symptoms = EXCLUDED.symptoms,
       postal_code = EXCLUDED.postal_code`,
    [
      session.id,
      nearestDistanceKm,
      GAP_THRESHOLD_KM,
      hasCoverageGap,
      session.symptoms,
      session.postal_code,
    ],
  );

  await lakebaseQuery(
    `UPDATE app.sms_sessions SET status = 'recommended', updated_at = now() WHERE id = $1`,
    [session.id],
  );
  session.status = 'recommended';

  const reply = formatFacilitySmsReply(facilities, hasCoverageGap, nearestDistanceKm);
  await lakebaseQuery(
    `INSERT INTO app.sms_messages (session_id, direction, body) VALUES ($1, 'outbound', $2)`,
    [session.id, reply],
  );

  return { reply, session };
}
