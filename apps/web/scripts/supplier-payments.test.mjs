import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {obligationFixtureSql} from '../src/lib/cost-obligations-fixture.ts';
import {supplierFixtureSql} from '../src/lib/supplier-payments-fixture.ts';
import {writeSupplierPayment} from '../src/lib/supplier-payments-core.ts';
const actor='11111111-1111-4111-8111-111111111111',purchaseId='44444444-4444-4444-8444-444444444444';
async function setup(){const db=new PGlite();await db.exec(obligationFixtureSql);await db.exec(supplierFixtureSql);await db.exec(readFileSync('../../supabase/migrations/20261125180000_unified_supplier_payments.sql','utf8'));return db;}
const input={intent:'pay',purchaseId,requestId:'55555555-5555-4555-8555-555555555555',accountId:'1',date:'2026-11-24',amountCents:9937080,expectedPaidCents:9937080};
test('schedule changes no money; payment and retry produce one debit without changing old records',async()=>{const db=await setup();try{
 const original=(await db.query('select * from admin_treasury_movements order by id')).rows;
 await db.transaction(tx=>writeSupplierPayment(tx,1,actor,{...input,intent:'schedule',requestId:'66666666-6666-4666-8666-666666666666',date:'2026-11-28'},'2026-11-24'));
 assert.deepEqual((await db.query('select * from admin_treasury_movements order by id')).rows,original);
 await db.transaction(tx=>writeSupplierPayment(tx,1,actor,input,'2026-11-24'));
 await db.transaction(tx=>writeSupplierPayment(tx,1,actor,input,'2026-11-24'));
 assert.equal((await db.query('select count(*)::int n from payments')).rows[0].n,1);
 assert.equal((await db.query('select paid_amount::text n from purchases')).rows[0].n,'198741.60');
 assert.equal((await db.query("select count(*)::int n from admin_treasury_movements where source_type='supplier_payment'")).rows[0].n,1);
 assert.deepEqual((await db.query('select * from admin_treasury_movements where id=10')).rows,original);
 await assert.rejects(db.transaction(tx=>writeSupplierPayment(tx,1,actor,{...input,amountCents:1},'2026-11-24')),/otros datos/);
 }finally{await db.close()}});
test('stale balances, other company accounts, future payment dates and closed months are rejected',async()=>{const db=await setup();try{
 for(const patch of [{expectedPaidCents:0},{accountId:'2'},{date:'2026-12-01'},{amountCents:9937081}]) await assert.rejects(db.transaction(tx=>writeSupplierPayment(tx,1,actor,{...input,...patch},'2026-11-24')));
 await db.exec("insert into admin_finance_monthly_closures(empresa_id,month,status) values(1,'2026-11-01','closed')");
 await assert.rejects(db.transaction(tx=>writeSupplierPayment(tx,1,actor,input,'2026-11-24')),/cerrado/);
 assert.equal((await db.query('select count(*)::int n from payments')).rows[0].n,0);
 }finally{await db.close()}});

test('projection schedules remaining supplier debt once and keeps the scheduled date',async()=>{
 const db=await setup();try{
 const plan={...input,intent:'schedule',requestId:'66666666-6666-4666-8666-666666666666',date:'2026-11-28'};
 await db.transaction(tx=>writeSupplierPayment(tx,1,actor,plan,'2026-11-24'));
 await db.transaction(tx=>writeSupplierPayment(tx,1,actor,{...input,amountCents:4000000},'2026-11-24'));
 const source=readFileSync('src/lib/cashflow-read.ts','utf8');
 const fragment=source.split('), scheduled AS (')[1].split('), flows AS (')[0];
 const sql=Function('process','return `'+fragment+'`')({env:{UNIFIED_PAYMENTS_ENABLED:'true'}});
 const result=await db.query('WITH scheduled AS ('+sql+') SELECT amount::float8 amount,date::text date FROM scheduled',[1]);
 assert.deepEqual(result.rows,[{amount:59370.8,date:'2026-11-28'}]);
 const before=(await db.query('select count(*)::int n from payments')).rows;
 await assert.rejects(db.transaction(tx=>writeSupplierPayment(tx,1,actor,{...plan,requestId:'77777777-7777-4777-8777-777777777777',expectedPaidCents:13937080,amountCents:5937080},'2026-11-24')),/programado/);
 assert.deepEqual((await db.query('select count(*)::int n from payments')).rows,before);
 }finally{await db.close()}
});
