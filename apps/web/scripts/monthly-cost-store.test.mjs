import test from 'node:test'; import assert from 'node:assert/strict'; import {mkdtempSync,rmSync} from 'node:fs'; import {tmpdir} from 'node:os'; import {join} from 'node:path';
import { LocalMonthlyCostStore } from '../src/lib/monthly-cost-local-store.ts';
const source={companyId:1,capturedAt:'2026-11-24T12:00:00Z',baselineMonth:'2026-11',salaries:[{id:'1',name:'Prueba',monthly:1000,active:true,bonus:false,chargesPercent:0}],expenses:[],decisions:[]};
test('server store persists across connections, scopes company and rejects stale write',()=>{
 const dir=mkdtempSync(join(tmpdir(),'starlim-costs-')); const file=join(dir,'test.sqlite');
 const a=new LocalMonthlyCostStore(file),b=new LocalMonthlyCostStore(file);
 try {
  a.initialize(source);assert.equal(a.read(1).revision,0);assert.equal(a.read(2),null);
  a.mutate(1,{intent:'save',month:'2026-11',expectedRevision:0},'staff');
  assert.equal(b.read(1).snapshots['2026-11'].totalCents,100000);
  assert.throws(()=>b.mutate(1,{intent:'save',month:'2026-11',expectedRevision:0},'staff'),/Actualiz/);
  assert.throws(()=>b.mutate(2,{intent:'save',month:'2026-11',expectedRevision:0},'staff'));
  assert.equal(b.read(1).revision,1);
  assert.throws(()=>a.mutate(1,{intent:'edit',id:'salary:1',month:'2026-11',amountCents:500000,active:true,expectedRevision:1},'staff'),/guardado/);
  a.mutate(1,{intent:'edit',id:'salary:1',month:'2026-12',amountCents:200000,active:true,expectedRevision:1},'staff');
  assert.equal(b.read(1).snapshots['2026-11'].totalCents,100000);
  a.mutate(1,{intent:'create',source:'salary',name:'Nuevo empleado',month:'2026-12',amountCents:30000,durationMonths:null,costType:'fijo',bonus:false,chargesPercent:0,expectedRevision:2},'staff');
  assert.equal(b.read(1).costs.length,2);
  assert.equal(b.read(1).snapshots['2026-11'].rows.length,1);
  assert.throws(()=>b.mutate(1,{intent:'create',source:'expense',name:'Duplicado envío',month:'2026-12',amountCents:100,durationMonths:1,costType:'unico',bonus:false,chargesPercent:0,expectedRevision:2},'staff'),/Actualiz/);
 } finally {a.close();b.close();rmSync(dir,{recursive:true});}
});
