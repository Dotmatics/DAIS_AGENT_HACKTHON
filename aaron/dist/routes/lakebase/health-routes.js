import { CREATE_INTAKE_BUNDLES_SQL } from "../../lib/intake-bundle.js";

//#region server/routes/lakebase/health-routes.ts
const SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS intake_app`;
const CREATE_TABLES_SQL = [CREATE_INTAKE_BUNDLES_SQL];
async function setupHealthRoutes(appkit) {
	try {
		await appkit.lakebase.query(SCHEMA_SQL);
		for (const sql of CREATE_TABLES_SQL) await appkit.lakebase.query(sql);
		console.log("[lakebase] intake_app schema ready");
	} catch (err) {
		console.warn("[lakebase] intake schema setup failed:", err.message);
	}
	appkit.server.extend((app) => {
		app.get("/api/intake/bundles", async (_req, res) => {
			try {
				const bundles = await appkit.lakebase.query(`
          SELECT id, symptom_summary, location_evidence, chosen_location,
                 geo_confidence, nearest_facility, facility_confidence,
                 has_coverage_gap, created_at
          FROM intake_app.intake_bundles
          ORDER BY created_at DESC
          LIMIT 20
        `);
				res.json({ bundles: bundles.rows });
			} catch (err) {
				console.error("Intake bundles fetch failed:", err);
				res.status(500).json({ error: "Failed to load intake bundles" });
			}
		});
		app.get("/api/intake/stats", async (_req, res) => {
			try {
				const stats = await appkit.lakebase.query(`
          SELECT
            COUNT(*) AS total_bundles,
            COUNT(*) FILTER (WHERE has_coverage_gap) AS coverage_gaps,
            COUNT(*) FILTER (WHERE geo_confidence >= 0.8) AS high_confidence_locations
          FROM intake_app.intake_bundles
        `);
				const recent = await appkit.lakebase.query(`
          SELECT symptom_summary, chosen_location, geo_confidence,
                 nearest_facility, facility_confidence, has_coverage_gap, created_at
          FROM intake_app.intake_bundles
          ORDER BY created_at DESC
          LIMIT 20
        `);
				res.json({
					stats: stats.rows[0],
					recent: recent.rows
				});
			} catch (err) {
				console.error("Intake stats failed:", err);
				res.status(500).json({ error: "Failed to load intake stats" });
			}
		});
	});
}

//#endregion
export { setupHealthRoutes };