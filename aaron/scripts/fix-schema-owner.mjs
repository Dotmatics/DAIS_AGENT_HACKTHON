// One-off: grant the Luma app service-principal Postgres role full access to the
// `intake_app` schema. After the aaron -> luma app rename the app runs under a
// NEW service principal whose Postgres role is the bare client-id UUID
// (e59a6a60-...). That SP could not read/write the intake_app schema, which is
// owned by the current user (s.coronado.c@gmail.com), so the app logged
// "permission denied for schema intake_app" on startup.
//
// We cannot ALTER ... OWNER (that needs membership in the target role, and we
// have none) nor touch the `appkit` cache schema (owned by the project owner).
// But we DO own intake_app, so GRANT + ALTER DEFAULT PRIVILEGES is sufficient
// for the SP to USE the schema and read/write current and future tables.
//
// Auth: short-lived Lakebase OAuth credential via the Databricks CLI (works
// despite enable_pg_native_login=false because this is OAuth, not native login).
//
// Usage:
//   node scripts/fix-schema-owner.mjs
//   DRY_RUN=1 node scripts/fix-schema-owner.mjs
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const PROFILE = process.env.DATABRICKS_CONFIG_PROFILE ?? 'hackdais';
const HOST =
  process.env.PGHOST ?? 'ep-floral-sound-d8tq49r1.database.us-east-2.cloud.databricks.com';
const DATABASE = process.env.PGDATABASE ?? 'databricks_postgres';
const USER = process.env.PGUSER ?? 's.coronado.c@gmail.com';
const ENDPOINT =
  process.env.PG_ENDPOINT ?? 'projects/dais-2026-app/branches/production/endpoints/primary';
// New Luma app SP Postgres role == bare client id (no dbrx-apps- prefix in pg).
const TARGET_ROLE = process.env.TARGET_ROLE ?? 'e59a6a60-3246-473f-98d0-ebdde917cc42';
const SCHEMA = process.env.SCHEMA ?? 'intake_app';
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

async function main() {
  const password = getToken();
  const client = new pg.Client({
    host: HOST,
    port: 5432,
    database: DATABASE,
    user: USER,
    password,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Connected to ${HOST}/${DATABASE} as ${USER}`);

  const target = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [TARGET_ROLE]);
  if (target.rowCount === 0) {
    throw new Error(`Target role "${TARGET_ROLE}" does not exist on this branch`);
  }

  const owner = await client.query(
    `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1`,
    [SCHEMA],
  );
  console.log(`Schema "${SCHEMA}" owner: ${owner.rows[0]?.owner ?? '(missing)'}`);

  const statements = [
    `GRANT USAGE, CREATE ON SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
    `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
    // Future objects the SP (or we) create in this schema.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${SCHEMA}" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO "${TARGET_ROLE}"`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${SCHEMA}" GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${TARGET_ROLE}"`,
  ];

  if (DRY_RUN) {
    console.log('DRY_RUN=1 -> statements that WOULD run:');
    statements.forEach((s) => console.log('  ' + s));
    await client.end();
    return;
  }

  for (const stmt of statements) {
    console.log('RUN ' + stmt);
    await client.query(stmt);
  }

  console.log('Grants applied. Verifying SP can see the schema...');
  const check = await client.query(
    `SELECT has_schema_privilege($1, $2, 'USAGE')  AS usage,
            has_schema_privilege($1, $2, 'CREATE') AS create
       FROM (SELECT 1) x`,
    [TARGET_ROLE, SCHEMA],
  );
  console.table(check.rows);

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
