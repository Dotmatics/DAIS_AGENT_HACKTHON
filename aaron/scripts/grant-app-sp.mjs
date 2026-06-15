// Grant the Luma app's service-principal Postgres role access to a schema.
//
// WHO RUNS THIS: the *owner* of the target schema. For the `appkit` cache schema
// that owner is aaron_dais_2026@icloud.com (also the Lakebase project owner), so
// Aaron must run this while his Databricks CLI is logged in as that identity.
// (s.coronado.c@gmail.com already owns intake_app and granted it separately.)
//
// WHY OAUTH: the Lakebase project has enable_pg_native_login=false, so there is
// no password login. `databricks postgres generate-database-credential` mints a
// short-lived OAuth token for whoever is logged into the CLI profile, and Postgres
// authenticates that user as their own role. Running as the schema owner means the
// GRANT/ALTER statements below are permitted.
//
// PREREQ (one time): npm i  (this script uses the `pg` package already in
// node_modules) and a CLI login as the owner:
//   databricks auth login --host https://dbc-61784abb-0041.cloud.databricks.com --profile aaron
//
// USAGE:
//   DATABRICKS_CONFIG_PROFILE=aaron node scripts/grant-app-sp.mjs            # grants appkit
//   DATABRICKS_CONFIG_PROFILE=aaron SCHEMA=appkit node scripts/grant-app-sp.mjs
//   DRY_RUN=1 DATABRICKS_CONFIG_PROFILE=aaron node scripts/grant-app-sp.mjs   # print only
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const PROFILE = process.env.DATABRICKS_CONFIG_PROFILE ?? process.env.DATABRICKS_PROFILE ?? 'aaron';
const HOST =
  process.env.PGHOST ?? 'ep-floral-sound-d8tq49r1.database.us-east-2.cloud.databricks.com';
const DATABASE = process.env.PGDATABASE ?? 'databricks_postgres';
const ENDPOINT =
  process.env.PG_ENDPOINT ?? 'projects/dais-2026-app/branches/production/endpoints/primary';
// PGUSER must match the CLI-logged-in identity (the schema owner). Defaults to
// the appkit owner; override if a different owner runs this.
const USER = process.env.PGUSER ?? 'aaron_dais_2026@icloud.com';
// Luma app service-principal Postgres role == bare client id (no dbrx-apps- prefix).
const TARGET_ROLE = process.env.TARGET_ROLE ?? 'e59a6a60-3246-473f-98d0-ebdde917cc42';
const SCHEMA = process.env.SCHEMA ?? 'appkit';
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

const STATEMENTS = [
  `GRANT USAGE, CREATE ON SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
  `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
  `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "${SCHEMA}" TO "${TARGET_ROLE}"`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA "${SCHEMA}" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO "${TARGET_ROLE}"`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA "${SCHEMA}" GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${TARGET_ROLE}"`,
];

async function main() {
  if (DRY_RUN) {
    console.log(`DRY_RUN: statements for schema "${SCHEMA}" -> role "${TARGET_ROLE}":`);
    STATEMENTS.forEach((s) => console.log('  ' + s));
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

  const target = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [TARGET_ROLE]);
  if (target.rowCount === 0) throw new Error(`Target role "${TARGET_ROLE}" not found on this branch`);

  const owner = await client.query(
    `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1`,
    [SCHEMA],
  );
  const ownerName = owner.rows[0]?.owner;
  console.log(`Schema "${SCHEMA}" owner: ${ownerName ?? '(missing)'}`);
  if (ownerName && ownerName !== USER) {
    console.warn(
      `WARNING: you are connected as ${USER} but the schema owner is ${ownerName}. ` +
        `GRANT will fail unless you are the owner or a superuser. Re-run with that identity.`,
    );
  }

  for (const stmt of STATEMENTS) {
    console.log('RUN ' + stmt);
    await client.query(stmt);
  }

  const check = await client.query(
    `SELECT has_schema_privilege($1,$2,'USAGE') AS usage,
            has_schema_privilege($1,$2,'CREATE') AS create`,
    [TARGET_ROLE, SCHEMA],
  );
  console.log(`Luma SP privileges on "${SCHEMA}" after grant:`);
  console.table(check.rows);

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
