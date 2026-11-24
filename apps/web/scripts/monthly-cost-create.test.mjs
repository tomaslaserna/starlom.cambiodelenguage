import test from 'node:test';
import assert from 'node:assert/strict';
import {importMonthlyCostSource,applyMonthlyCostCommand,restoreErpCostState} from '../src/lib/monthly-cost-erp-domain.ts';
import {readCostMonth} from '../src/lib/monthly-costs.ts';
const source={companyId:1,capturedAt:'2026-11-24T12:00:00Z',baselineMonth:'2026-11',salaries:[],expenses:[],decisions:[]};
const input={intent:'create',source:'expense',name:'Internet',month:'2026-12',amountCents:10000,durationMonths:null,costType:'fijo',bonus:false,chargesPercent:0,expectedRevision:1};
function closed(){return applyMonthlyCostCommand(importMonthlyCostSource(source),{intent:'save',month:'2026-11',expectedRevision:0},'staff');}
test('new costs preserve saved snapshots byte for byte and survive server reload',()=>{
 const initial=closed(),saved=JSON.stringify(initial.snapshots);
 const s=applyMonthlyCostCommand(initial,input,'staff');
 assert.equal(JSON.stringify(s.snapshots),saved);
 const restored=restoreErpCostState(JSON.stringify(s));
 assert.equal(readCostMonth(restored,'2026-11').rows.length,0);
 assert.equal(readCostMonth(restored,'2026-12').totalCents,10000);
 assert.equal(readCostMonth(restored,'2027-01').pending,1);
 assert.equal(s.events.at(-1).actor,'staff');
});
test('new salary provisions and finite duration start only in selected month',()=>{
 const s=applyMonthlyCostCommand(closed(),{...input,source:'salary',name:'Empleado prueba',amountCents:120000,bonus:true,chargesPercent:10,durationMonths:2},'staff');
 assert.equal(readCostMonth(s,'2026-12').totalCents,142000);
 assert.equal(readCostMonth(s,'2027-01').totalCents,142000);
 assert.equal(readCostMonth(s,'2027-02').totalCents,0);
});
test('rejects backdating, invalid inputs, duplicate names and stale submissions',()=>{
 for(const change of [{month:'2026-11'},{month:'2026-13'},{name:' '},{amountCents:-1},{amountCents:1.2},{durationMonths:0},{durationMonths:1.5},{costType:'anything'},{source:'other'},{source:'expense',bonus:true},{source:'salary',chargesPercent:101},{costType:'unico',durationMonths:null}])assert.throws(()=>applyMonthlyCostCommand(closed(),{...input,...change},'staff'));
 const s=applyMonthlyCostCommand(closed(),input,'staff');
 assert.throws(()=>applyMonthlyCostCommand(s,input,'staff'),/Actualiz/);
 assert.throws(()=>applyMonthlyCostCommand(s,{...input,name:'  INTERNET ',expectedRevision:2},'staff'),/existe/);
});
