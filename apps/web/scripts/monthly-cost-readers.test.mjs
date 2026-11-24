import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as domain from '../src/lib/monthly-cost-erp-domain.ts';
import * as costs from '../src/lib/monthly-costs.ts';

test('ERP readers use month versions, existing payments and unchanged baseline without writing',async()=>{
 const source={companyId:1,capturedAt:'2026-11-24T12:00:00Z',baselineMonth:'2026-11',salaries:[{id:'1',name:'Employee',monthly:800,active:true,bonus:false,chargesPercent:0}],expenses:[],decisions:[]};
 let state=domain.importMonthlyCostSource(source);
 state=domain.applyMonthlyCostCommand(state,{intent:'save',month:'2026-11',expectedRevision:0},'staff');
 state=domain.applyMonthlyCostCommand(state,{intent:'edit',id:'salary:1',month:'2026-12',amountCents:90000,active:true,expectedRevision:1},'staff');
 const queries=[];
 const aliases={
  '@/lib/db':{queryWithCompanyContext:async(company,sql,values)=>{assert.equal(company,1);assert.match(sql.trim(),/^SELECT/);queries.push(values);
   if(sql.includes('to_regclass'))return{rows:[{available:true}]};
   if(sql.includes('source_snapshot'))return{rows:[{state,source_snapshot:source}]};
   return{rows:[{id:'1',paid:'100'}]};}},
  '@/lib/api-response':{ApiError:Error},'./monthly-cost-erp-domain':domain,'./monthly-cost-source-sql':{},'./monthly-costs':costs,
 };
 const js=ts.transpileModule(readFileSync('src/lib/monthly-cost-ledger.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};Function('require','module','exports',js)(name=>{assert.ok(aliases[name],name);return aliases[name]},mod,mod.exports);
 assert.equal(await mod.exports.monthlyCostTotals(1,'2026-10'),null);
 assert.equal((await mod.exports.monthlyCostTotals(1,'2026-11')).total,800);
 assert.equal((await mod.exports.monthlyCostTotals(1,'2026-12')).total,900);
 assert.equal((await mod.exports.monthlyPayrollPayables(1,'2026-12'))[0].balance,800);
 assert.deepEqual(await mod.exports.monthlyCostAdjustment(1,'2026-10-01','2027-01-01'),{total:100,salaries:100,expenses:0});
 state=domain.applyMonthlyCostCommand(state,{intent:'create',source:'salary',name:'New staff',month:'2026-12',amountCents:10000,durationMonths:1,costType:'fijo',bonus:false,chargesPercent:0,expectedRevision:2},'staff');
 assert.equal((await mod.exports.monthlyCostTotals(1,'2026-11')).total,800);
 assert.equal((await mod.exports.monthlyCostTotals(1,'2026-12')).total,1000);
 const newPayable=(await mod.exports.monthlyPayrollPayables(1,'2026-12')).find(r=>r.employee==='New staff');
 assert.equal(newPayable.balance,100);assert.equal(newPayable.paid,0);
 assert.equal((await mod.exports.monthlyPayrollPayables(1,'2027-01')).find(r=>r.employee==='New staff').balance,0);
 assert.ok(queries.some(v=>v[1]==='2026-12'));
});
