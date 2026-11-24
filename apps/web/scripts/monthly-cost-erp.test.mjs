import test from 'node:test';
import assert from 'node:assert/strict';
import { importMonthlyCostSource, applyMonthlyCostCommand } from '../src/lib/monthly-cost-erp-domain.ts';
import { readCostMonth } from '../src/lib/monthly-costs.ts';
const source=()=>({companyId:1,capturedAt:'2026-11-24T12:00:00Z',baselineMonth:'2026-11',salaries:[{id:'1',name:'Ana Prueba',monthly:1000,active:true,bonus:true,chargesPercent:0}],expenses:[{id:'1',name:'Sueldo Ana',amount:1000,active:true,start:'2026-10',durationMonths:null},{id:'2',name:'Alquiler',amount:500,active:true,start:'2026-10',durationMonths:null}],decisions:[{costId:'2',month:'2026-11',included:true}]});
test('real import matches source costs, keeps IDs and excludes duplicate by stable link',()=>{
 const s=importMonthlyCostSource(source());
 assert.equal(readCostMonth(s,'2026-11').totalCents,158333);
 assert.equal(s.excluded[0].salaryId,'salary:1');
 const n=applyMonthlyCostCommand(s,{intent:'edit',id:'salary:1',month:'2026-12',amountCents:200000,active:true,expectedRevision:s.revision},'actor');
 assert.equal(n.costs.length,2);assert.equal(readCostMonth(n,'2026-11').totalCents,158333);
 assert.throws(()=>readCostMonth(n,'2026-10'),/histórico/i);
});
test('requires current revision and server-owned actor; duplicate submit is not applied twice',()=>{
 const s=importMonthlyCostSource(source()); const command={intent:'save',month:'2026-11',expectedRevision:s.revision};
 const n=applyMonthlyCostCommand(s,command,'user-1');
 assert.equal(n.events.at(-1).actor,'user-1');
 assert.throws(()=>applyMonthlyCostCommand(n,command,'user-1'),/actualiz/i);
 assert.throws(()=>applyMonthlyCostCommand(n,{intent:'edit',id:'salary:1',month:'2026-11',amountCents:9,active:true,expectedRevision:n.revision},'user-1'),/guardado/);
});
test('ambiguous names never discard costs and first saved month must be baseline',()=>{
 const input=source();input.salaries.push({...input.salaries[0],id:'2',name:'Ana Otra'});
 const s=importMonthlyCostSource(input);assert.equal(s.excluded.length,0);
 assert.throws(()=>applyMonthlyCostCommand(s,{intent:'save',month:'2026-12',expectedRevision:s.revision},'actor'),/inicio|primero/);
});
test('invalid source cents or company and invalid commands rejected',()=>{
 const bad=source();bad.companyId=0;assert.throws(()=>importMonthlyCostSource(bad));
 const s=importMonthlyCostSource(source());
 assert.throws(()=>applyMonthlyCostCommand(s,{intent:'erase',expectedRevision:0},'actor'));
 assert.throws(()=>applyMonthlyCostCommand(s,{intent:'edit',id:'salary:1',month:'2026-12',amountCents:12.3,active:true,expectedRevision:0},'actor'));
});
