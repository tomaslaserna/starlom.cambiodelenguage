import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMonthlyCosts, readCostMonth, editCostFromMonth, decideCostMonth, saveCostMonth, restoreMonthlyCosts } from '../src/lib/monthly-costs.ts';

function ready(month='2026-11') {
  let s=demoMonthlyCosts();
  for (const id of ['rent','marketing']) s=decideCostMonth(s,id,month,true);
  return s;
}
test('saving preserves salary and expenses across a future increase and reload',()=>{
  const saved=saveCostMonth(ready(),'2026-11');
  const before=JSON.stringify(saved.snapshots);
  const changed=editCostFromMonth(saved,'salary','2026-12',90000000,true);
  assert.equal(JSON.stringify(changed.snapshots),before);
  assert.equal(readCostMonth(changed,'2026-11').totalCents,178500000);
  assert.equal(readCostMonth(restoreMonthlyCosts(JSON.stringify(changed)),'2026-12').rows.find(r=>r.id==='salary').amountCents,90000000);
  assert.equal(readCostMonth(changed,'2026-10').totalCents,178500000);
});
test('saved periods reject retroactive edits and inclusion changes',()=>{
  const s=saveCostMonth(ready(),'2026-11');
  assert.throws(()=>editCostFromMonth(s,'salary','2026-11',90000000,true),/guardado/);
  assert.throws(()=>decideCostMonth(s,'rent','2026-10',false),/guardado/);
  assert.throws(()=>saveCostMonth(s,'2026-11'),/guardado/);
});
test('pending indefinite expenses cannot silently close as zero',()=>{
  const s=demoMonthlyCosts();
  assert.equal(readCostMonth(s,'2026-11').pending,2);
  assert.throws(()=>saveCostMonth(s,'2026-11'),/confirmar/);
  const decided=decideCostMonth(decideCostMonth(s,'rent','2026-11',true),'marketing','2026-11',false);
  assert.equal(saveCostMonth(decided,'2026-11').snapshots['2026-11'].totalCents,160000000);
});
test('edits do not change earlier drafts or remove later planned versions',()=>{
  let s=editCostFromMonth(demoMonthlyCosts(),'salary','2027-01',110000000,true);
  s=editCostFromMonth(s,'salary','2026-12',90000000,true);
  assert.equal(readCostMonth(s,'2026-11').rows[0].amountCents,80000000);
  assert.equal(readCostMonth(s,'2026-12').rows[0].amountCents,90000000);
  assert.equal(readCostMonth(s,'2027-01').rows[0].amountCents,110000000);
});
test('deactivation applies from the chosen month only',()=>{
  const s=editCostFromMonth(demoMonthlyCosts(),'salary','2026-12',80000000,false);
  assert.equal(readCostMonth(s,'2026-11').rows[0].status,'included');
  assert.equal(readCostMonth(s,'2026-12').rows[0].status,'inactive');
});
test('finite expiry is not extended by an amount edit or confirmation',()=>{
  let s=demoMonthlyCosts(); s.costs[1].durationMonths=2;
  s=editCostFromMonth(s,'rent','2026-11',85000000,true);
  assert.equal(readCostMonth(s,'2026-11').rows.find(r=>r.id==='rent').status,'included');
  assert.equal(readCostMonth(s,'2026-12').rows.find(r=>r.id==='rent').status,'expired');
  assert.throws(()=>decideCostMonth(s,'rent','2026-12',true),/vigencia/);
});
test('money and months are validated strictly',()=>{
  for(const m of ['2026-13','2026-1','2026-11-extra']) assert.throws(()=>readCostMonth(demoMonthlyCosts(),m));
  for(const amount of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>editCostFromMonth(demoMonthlyCosts(),'salary','2026-12',amount,true));
  assert.throws(()=>editCostFromMonth(demoMonthlyCosts(),'missing','2026-12',100,true));
});
test('snapshots are independent values and preserve rounded provisions',()=>{
  const s=ready(); s.costs[0].versions[0].bonus=true;
  const saved=saveCostMonth(s,'2026-11');
  assert.equal(saved.snapshots['2026-11'].rows[0].provisionCents,6666667);
  s.costs[0].versions[0].amountCents=1;
  assert.equal(saved.snapshots['2026-11'].rows[0].amountCents,80000000);
  assert.deepEqual(restoreMonthlyCosts(JSON.stringify(saved)),saved);
});
test('invalid persistence never silently resets to demo or accepts corrupt totals',()=>{
  for(const value of ['{}','null','not json',JSON.stringify({schema:2})]) assert.throws(()=>restoreMonthlyCosts(value));
  const s=demoMonthlyCosts(); s.snapshots['2026-10'].totalCents=1;
  assert.throws(()=>restoreMonthlyCosts(JSON.stringify(s)),/datos/i);
});
test('saving a later month cannot lock an unreviewed gap in history',()=>{
  assert.throws(()=>saveCostMonth(ready('2026-12'),'2026-12'),/primero/);
});
