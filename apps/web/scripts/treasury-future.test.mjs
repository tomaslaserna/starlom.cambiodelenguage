import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {afterReconciliationSql} from '../src/lib/treasury-cutoff.ts';
test('future movement survives earlier reconciliation, enters balance once, then is absorbed',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create table m(created_at timestamptz,movement_date date,amount numeric);insert into m values('2026-11-14','2026-12-11',485918.29),('2026-11-24','2026-11-24',100),('2026-11-26','2026-11-26',50);create table r(reconciled_at timestamptz,statement_date date);insert into r values('2026-11-25','2026-11-25');`);
 for(const [day,balance,future] of [['2026-11-25',0,485968.29],['2026-12-10',50,485918.29],['2026-12-11',485968.29,0]]) {
 const q=await db.query(`select coalesce(sum(amount) filter(where movement_date<=$1::date),0)::float8 balance,coalesce(sum(amount) filter(where movement_date>$1::date),0)::float8 future from m cross join r where ${afterReconciliationSql('m','r')}`,[day]);
 assert.deepEqual(q.rows[0],{balance,future});
 }
 await db.exec(`update r set reconciled_at='2026-12-12',statement_date='2026-12-12'`);
 assert.equal((await db.query(`select count(*)::int n from m cross join r where ${afterReconciliationSql('m','r')}`)).rows[0].n,0);
 }finally{await db.close()}
});
