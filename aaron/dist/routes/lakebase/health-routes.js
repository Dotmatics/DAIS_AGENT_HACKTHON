import { processSmsMessage } from "../../lib/sms-processor.js";
import { CREATE_INTAKE_BUNDLES_SQL } from "../../lib/intake-bundle.js";
import { z } from "zod";

//#region server/routes/lakebase/health-routes.ts
const SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS app`;
const CREATE_TABLES_SQL = [
	`CREATE TABLE IF NOT EXISTS app.sms_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'collecting',
    postal_code TEXT,
    age INT,
    symptoms TEXT,
    district TEXT,
    state TEXT,
    user_lat DOUBLE PRECISION,
    user_lon DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
	`CREATE TABLE IF NOT EXISTS app.sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES app.sms_sessions(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
	`CREATE TABLE IF NOT EXISTS app.facility_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES app.sms_sessions(id) ON DELETE CASCADE,
    facility_name TEXT,
    facility_phone TEXT,
    distance_km DOUBLE PRECISION,
    specialties TEXT,
    rank INT,
    is_nearest_appropriate BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
	`CREATE TABLE IF NOT EXISTS app.coverage_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES app.sms_sessions(id) ON DELETE CASCADE,
    nearest_distance_km DOUBLE PRECISION,
    gap_threshold_km DOUBLE PRECISION DEFAULT 50,
    has_coverage_gap BOOLEAN,
    symptoms TEXT,
    postal_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
	CREATE_INTAKE_BUNDLES_SQL
];
const InboundSmsBody = z.object({
	phone: z.string().min(5),
	message: z.string().min(1)
});
function bindAnalyticsQuery(analytics) {
	return (query, parameters) => analytics.query(query, parameters).then((result) => ({ rows: result.rows }));
}
async function setupHealthRoutes(appkit) {
	try {
		await appkit.lakebase.query(SCHEMA_SQL);
		for (const sql of CREATE_TABLES_SQL) await appkit.lakebase.query(sql);
		console.log("[lakebase] Health SMS schema ready");
	} catch (err) {
		console.warn("[lakebase] Health schema setup failed:", err.message);
	}
	const analyticsQuery = bindAnalyticsQuery(appkit.analytics);
	appkit.server.extend((app) => {
		app.post("/api/sms/inbound", async (req, res) => {
			try {
				const parsed = InboundSmsBody.safeParse(req.body);
				if (!parsed.success) {
					res.status(400).json({ error: "phone and message are required" });
					return;
				}
				const { reply, session } = await processSmsMessage(appkit.lakebase.query.bind(appkit.lakebase), analyticsQuery, parsed.data.phone, parsed.data.message);
				res.json({
					reply,
					session
				});
			} catch (err) {
				console.error("SMS inbound failed:", err);
				res.status(500).json({ error: "Failed to process SMS message" });
			}
		});
		app.get("/api/sms/thread/:phone", async (req, res) => {
			try {
				const phone = req.params.phone;
				const sessions = await appkit.lakebase.query(`SELECT id, phone, status, postal_code, age, symptoms, district, state, created_at, updated_at
           FROM app.sms_sessions WHERE phone = $1`, [phone]);
				if (sessions.rows.length === 0) {
					res.json({
						session: null,
						messages: [],
						recommendations: [],
						coverageGap: null
					});
					return;
				}
				const session = sessions.rows[0];
				const messages = await appkit.lakebase.query(`SELECT direction, body, created_at FROM app.sms_messages
           WHERE session_id = $1 ORDER BY created_at ASC`, [session.id]);
				const recommendations = await appkit.lakebase.query(`SELECT facility_name, facility_phone, distance_km, specialties, rank
           FROM app.facility_recommendations WHERE session_id = $1 ORDER BY rank ASC`, [session.id]);
				const gaps = await appkit.lakebase.query(`SELECT nearest_distance_km, gap_threshold_km, has_coverage_gap, symptoms, postal_code
           FROM app.coverage_gaps WHERE session_id = $1`, [session.id]);
				res.json({
					session,
					messages: messages.rows,
					recommendations: recommendations.rows,
					coverageGap: gaps.rows[0] ?? null
				});
			} catch (err) {
				console.error("SMS thread fetch failed:", err);
				res.status(500).json({ error: "Failed to load SMS thread" });
			}
		});
		app.get("/api/sms/stats", async (_req, res) => {
			try {
				const stats = await appkit.lakebase.query(`
          SELECT
            (SELECT COUNT(*) FROM app.sms_sessions) AS total_sessions,
            (SELECT COUNT(*) FROM app.sms_sessions WHERE status = 'recommended') AS completed_sessions,
            (SELECT COUNT(*) FROM app.coverage_gaps WHERE has_coverage_gap = true) AS coverage_gaps
        `);
				const recentGaps = await appkit.lakebase.query(`
          SELECT cg.postal_code, cg.symptoms, cg.nearest_distance_km, cg.has_coverage_gap, s.phone
          FROM app.coverage_gaps cg
          JOIN app.sms_sessions s ON s.id = cg.session_id
          ORDER BY cg.created_at DESC
          LIMIT 20
        `);
				res.json({
					stats: stats.rows[0],
					recentGaps: recentGaps.rows
				});
			} catch (err) {
				console.error("SMS stats failed:", err);
				res.status(500).json({ error: "Failed to load stats" });
			}
		});
		app.get("/api/intake/bundles", async (_req, res) => {
			try {
				const bundles = await appkit.lakebase.query(`
          SELECT id, symptom_summary, location_evidence, chosen_location,
                 geo_confidence, nearest_facility, facility_confidence,
                 has_coverage_gap, created_at
          FROM app.intake_bundles
          ORDER BY created_at DESC
          LIMIT 20
        `);
				res.json({ bundles: bundles.rows });
			} catch (err) {
				console.error("Intake bundles fetch failed:", err);
				res.status(500).json({ error: "Failed to load intake bundles" });
			}
		});
	});
}

//#endregion
export { setupHealthRoutes };