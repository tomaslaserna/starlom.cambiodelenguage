import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {importMonthlyCostSource,applyMonthlyCostCommand} from '../src/lib/monthly-cost-erp-domain.ts';
test('Postgres migration protects saved snapshots, tenant scope and original sources',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE starlim_app; ALTER DEFAULT PRIVILEGES GRANT DELETE ON TABLES TO starlim_app;
   CREATE TABLE costos_operativos(empresa_id bigint,monto numeric);CREATE TABLE admin_sueldos_config(empresa_id bigint);CREATE TABLE admin_operating_cost_month_status(empresa_id bigint);
   GRANT SELECT,INSERT,UPDATE,DELETE ON costos_operativos TO starlim_app;`);
  await db.exec(readFileSync('../../supabase/migrations/20261124182449_monthly_cost_ledger.sql','utf8'));
  await db.exec(readFileSync('../../supabase/migrations/20261124182811_monthly_cost_least_privilege.sql','utf8'));
  assert.equal((await db.query("SELECT has_table_privilege('starlim_app','admin_monthly_cost_ledger','DELETE') AS allowed")).rows[0].allowed,false);
  await db.exec("SET ROLE starlim_app; SELECT set_config('app.current_empresa_id','1',false)");
  await db.exec('INSERT INTO costos_operativos VALUES(1,10)');
  const source={companyId:1,capturedAt:'2026-11-24T12:00:00Z',baselineMonth:'2026-11',salaries:[],expenses:[],decisions:[]};
  let state=importMonthlyCostSource(source);
  await db.query('INSERT INTO admin_monthly_cost_ledger(empresa_id,state,source_snapshot) VALUES(1,$1,$2)',[JSON.stringify(state),JSON.stringify(source)]);
  state=applyMonthlyCostCommand(state,{intent:'save',month:'2026-11',expectedRevision:0},'staff');
  await db.query('UPDATE admin_monthly_cost_ledger SET state=$1 WHERE empresa_id=1',[JSON.stringify(state)]);
  state=applyMonthlyCostCommand(state,{intent:'create',source:'expense',name:'Internet',month:'2026-12',amountCents:50000,costType:'fijo',durationMonths:null,bonus:false,chargesPercent:0,expectedRevision:1},'staff');
  await db.query('UPDATE admin_monthly_cost_ledger SET state=$1 WHERE empresa_id=1',[JSON.stringify(state)]);
  assert.deepEqual((await db.query('SELECT state FROM admin_monthly_cost_ledger')).rows[0].state.snapshots['2026-11'].rows,[]);
  const altered=structuredClone(state);altered.revision++;altered.snapshots['2026-11'].totalCents=1;
  await assert.rejects(db.query('UPDATE admin_monthly_cost_ledger SET state=$1 WHERE empresa_id=1',[JSON.stringify(altered)]),/immutable/);
  await assert.rejects(db.exec('UPDATE costos_operativos SET monto=20 WHERE empresa_id=1'),/protected/);
  await db.exec("SELECT set_config('app.current_empresa_id','2',false)");
  assert.equal((await db.query('SELECT * FROM admin_monthly_cost_ledger')).rows.length,0);
 }finally{await db.close();}
});
