import { Application } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: { extend(fn: (app: Application) => void): void };
}

const TABLE_MISSING = '42P01';

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string }).code === TABLE_MISSING;
}

export async function setupIntakeRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/lakebase/intakes/stats', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            COUNT(*)::int AS total_sessions,
            COUNT(*) FILTER (WHERE has_coverage_gap)::int AS coverage_gap_count,
            ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
              / NULLIF(COUNT(*), 0), 1)::float8 AS coverage_gap_pct,
            ROUND(AVG((nearest_facility->>'distanceKm')::numeric)
              FILTER (WHERE has_coverage_gap), 1)::float8 AS avg_gap_distance_km,
            ROUND(AVG(facility_confidence)::numeric, 2)::float8 AS avg_facility_confidence
          FROM intake_app.intake_bundles
        `);
        res.json(result.rows[0] ?? {});
      } catch (err) {
        if (isMissingTable(err)) { res.json({ total_sessions: 0, coverage_gap_count: 0, coverage_gap_pct: 0, avg_gap_distance_km: null, avg_facility_confidence: null }); return; }
        console.error('intakes/stats failed:', err);
        res.status(500).json({ error: 'Failed to load stats' });
      }
    });

    app.get('/api/lakebase/intakes', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            id,
            symptom_summary AS symptoms,
            chosen_location->>'district' AS district,
            chosen_location->>'state'    AS state,
            has_coverage_gap,
            (nearest_facility->>'distanceKm')::float8 AS nearest_distance_km,
            nearest_facility->>'name'    AS facility_name,
            NULL::float8                 AS recommended_distance_km,
            geo_confidence,
            facility_confidence,
            created_at
          FROM intake_app.intake_bundles
          ORDER BY created_at DESC
          LIMIT 50
        `);
        res.json(result.rows);
      } catch (err) {
        if (isMissingTable(err)) { res.json([]); return; }
        console.error('intakes failed:', err);
        res.status(500).json({ error: 'Failed to load intakes' });
      }
    });

    app.get('/api/lakebase/gaps-by-state', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            chosen_location->>'state'                              AS state,
            COUNT(*)::int                                          AS session_count,
            COUNT(*) FILTER (WHERE has_coverage_gap)::int          AS gap_count,
            ROUND(100.0 * COUNT(*) FILTER (WHERE has_coverage_gap)
              / NULLIF(COUNT(*), 0), 1)::float8                   AS gap_pct
          FROM intake_app.intake_bundles
          WHERE chosen_location->>'state' IS NOT NULL
          GROUP BY chosen_location->>'state'
          ORDER BY gap_pct DESC
        `);
        res.json(result.rows);
      } catch (err) {
        if (isMissingTable(err)) { res.json([]); return; }
        console.error('gaps-by-state failed:', err);
        res.status(500).json({ error: 'Failed to load gap data' });
      }
    });
  });
}
