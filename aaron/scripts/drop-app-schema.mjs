import pg from 'pg';
import { execSync } from 'node:child_process';

const host = 'ep-floral-sound-d8tq49r1.database.us-east-2.cloud.databricks.com';
const user = process.env.PGUSER || 's.coronado.c@gmail.com';
const database = process.env.PGDATABASE || 'databricks_postgres';

const tokenJson = execSync(
  'databricks postgres generate-database-credential projects/dais-2026-app/branches/production/endpoints/primary -p hackdais',
  { encoding: 'utf8' },
);
const password = JSON.parse(tokenJson).token;

const client = new pg.Client({
  host,
  port: 5432,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
});

const sql = process.argv[2] ?? 'SELECT current_user';

const main = async () => {
  await client.connect();
  const res = await client.query(sql);
  console.log(JSON.stringify({ command: res.command, rowCount: res.rowCount, rows: res.rows }, null, 1));
  await client.end();
};

main().catch((err) => {
  console.error('PG_ERROR:', err.message);
  process.exit(1);
});
