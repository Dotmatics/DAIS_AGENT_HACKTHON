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
            COUNT(DISTINCT s.id) AS total_sessions,
            COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true) AS coverage_gap_count,
            ROUND(100.0 * COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true)
              / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS coverage_gap_pct,
            ROUND(AVG(cg.nearest_distance_km) FILTER (WHERE cg.has_coverage_gap = true), 1) AS avg_gap_distance_km
          FROM app.sms_sessions s
          LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
        `);
        res.json(result.rows[0] ?? {});
      } catch (err) {
        if (isMissingTable(err)) { res.json({ total_sessions: 0, coverage_gap_count: 0, coverage_gap_pct: 0, avg_gap_distance_km: null }); return; }
        console.error('intakes/stats failed:', err);
        res.status(500).json({ error: 'Failed to load stats' });
      }
    });

    app.get('/api/lakebase/intakes', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT DISTINCT ON (s.id)
            s.id, s.symptoms, s.district, s.state, s.status, s.created_at,
            cg.has_coverage_gap, cg.nearest_distance_km,
            fr.facility_name, fr.distance_km AS recommended_distance_km
          FROM app.sms_sessions s
          LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
          LEFT JOIN app.facility_recommendations fr ON fr.session_id = s.id AND fr.rank = 1
          ORDER BY s.id, s.created_at DESC
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
            s.state,
            COUNT(DISTINCT s.id) AS session_count,
            COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true) AS gap_count,
            ROUND(100.0 * COUNT(DISTINCT cg.id) FILTER (WHERE cg.has_coverage_gap = true)
              / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS gap_pct
          FROM app.sms_sessions s
          LEFT JOIN app.coverage_gaps cg ON cg.session_id = s.id
          WHERE s.state IS NOT NULL
          GROUP BY s.state
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
