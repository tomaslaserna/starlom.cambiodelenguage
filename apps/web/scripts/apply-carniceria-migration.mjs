// Explicit, one-off deployment gate. Normal builds never connect to the database.
import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (process.env.STARLIM_APPLY_CARNICERIA_MIGRATION === '1') {
  if (process.env.VERCEL_ENV !== 'production') throw new Error('This deployment migration requires the production environment.');
  let connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    const {SUPABASE_DB_HOST:host,SUPABASE_DB_USER:user,SUPABASE_DB_PASS:password}=process.env;
    if (!host || !user || !password) throw new Error('Database configuration missing for segment migration.');
    connectionString=`postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${process.env.SUPABASE_DB_PORT||'6543'}/${process.env.SUPABASE_DB_NAME||'postgres'}`;
  }
  const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED!=='false'}});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('starlim:carniceria-category'))");
    const sql=await readFile(new URL('../../../supabase/migrations/20261127164458_add_carniceria_business_segment.sql',import.meta.url),'utf8');
    await client.query(sql);
    const verified=await client.query(`SELECT conname FROM pg_constraint
      WHERE conrelid IN ('public.clients'::regclass,'public.crm_leads'::regclass)
        AND conname IN ('clients_business_segment_check','clients_business_segment_suggested_check','crm_leads_business_segment_check')
        AND pg_get_constraintdef(oid) LIKE '%Carnicería%' AND convalidated`);
    if(verified.rowCount!==3) throw new Error('Segment migration verification failed.');
    const history=await client.query("SELECT to_regclass('supabase_migrations.schema_migrations') AS table_name");
    if(history.rows[0]?.table_name) await client.query(`INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
      VALUES ($1,$2,$3::text[]) ON CONFLICT (version) DO NOTHING`,['20261127164458','add_carniceria_business_segment',[sql]]);
    await client.query('COMMIT');
    console.log('Carnicería migration applied and verified: 3 validated constraints; no customer classifications changed.');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();await pool.end();}
}
