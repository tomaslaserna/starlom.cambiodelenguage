import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const path = new URL('../src/lib/customer-access.ts', import.meta.url);
const session = { companyId: 1, userId: 'mati', role: 'vendedor', username: 'Matias Ferrer', displayName: 'Matias Ferrer' };
let rows = [{ id: 'own' }];
let all = false;
function load(query = async()=>({rows})) {
  assert.ok(existsSync(path), 'Missing server-side customer access policy');
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  Function('require','module','exports',compiled)(s => ({
    '@/lib/auth': {normalizeRole:r=>r},
    '@/lib/route-auth': {isFullAccessRole:r=>r==='administrador'||r==='jefe',sessionAllows:async()=>all,CUSTOMERS_ALL_READ_PERMISSION:{}},
    '@/lib/db': {queryWithCompanyContext:(_company, sql, params)=>query(sql, params)},
    '@/lib/api-response': {ApiError:class extends Error {constructor(status,message){super(message);this.status=status;}}},
  }[s] ?? require(s)),module,module.exports);
  return module.exports;
}
test('seller only receives assigned clients, including an empty portfolio',async()=>{
  const access=load();
  assert.deepEqual(await access.customerAccessIds(session),['own']);
  rows=[];
  assert.deepEqual(await access.filterCustomerAccess(session,[{id:'other'}]),[]);
  await assert.rejects(access.assertCustomerAccess(session,'other'),e=>e.status===403);
  rows=[{id:'own'}];
  assert.deepEqual(await access.filterCustomerAccess(session,[{id:'own'},{id:'other'}]),[{id:'own'}]);
});
test('public quote visibility and origin seller never override assigned client',async()=>{
  const {quoteIsAccessible}=load();
  assert.equal(quoteIsAccessible({clientId:'other',sellerId:'mati',visibleToAll:true},['own'],'mati'),false);
  assert.equal(quoteIsAccessible({clientId:'own',sellerId:'lucas'},['own'],'mati'),true);
  assert.equal(quoteIsAccessible({clientId:'',sellerId:'mati'},[],'mati'),true);
  assert.equal(quoteIsAccessible({clientId:'',sellerId:'fran',visibleToAll:true},[],'mati'),false);
});
test('administrators and principal seller retain global access',async()=>{
  const {customerAccessIds}=load();
  assert.equal(await customerAccessIds({...session,role:'administrador'}),null);
  all=true;
  assert.equal(await customerAccessIds({...session,userId:'lucas'}),null);
  all=false;
});
test('SQL excludes origin-only matches and other companies',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE clients(id text, empresa_id int, assigned_seller text, seller_name text);
      INSERT INTO clients VALUES ('assigned',1,' Matias Ferrer ','Lucas'),
      ('origin-only',1,'Fran','Matias Ferrer'),('other-company',2,'Matias Ferrer',''),('unassigned',1,NULL,'');`);
    const access=load((sql,params)=>db.query(sql,params));
    assert.deepEqual(await access.customerAccessIds(session),['assigned']);
  } finally {await db.close();}
});
test('direct quote access denies an unrelated public quote and permits an assigned customer',async()=>{
  const own=load(async(sql)=>({rows: sql.includes('FROM quotes') ? [{clientId:'own',sellerId:'lucas'}] : [{id:'own'}]}));
  await own.assertQuoteAccess(session,'P-1');
  const other=load(async(sql)=>({rows: sql.includes('FROM quotes') ? [{clientId:'other',sellerId:'mati'}] : [{id:'own'}]}));
  await assert.rejects(other.assertQuoteAccess(session,'P-2'),e=>e.status===403);
});
