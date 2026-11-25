import {NextResponse} from 'next/server';
import {localObligationDb} from '@/lib/cost-obligations-local';
import {readSupplierPayments,writeSupplierPayment} from '@/lib/supplier-payments-core';
const today='2026-11-25',actor='11111111-1111-4111-8111-111111111111';
const allowed=(r:Request)=>process.env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(new URL(r.url).hostname);
export async function GET(r:Request){if(!allowed(r))return new NextResponse(null,{status:404});const db=await localObligationDb();return NextResponse.json({rows:await readSupplierPayments(db,1),accounts:(await db.query("SELECT id::text,name FROM admin_treasury_accounts WHERE empresa_id=1 AND active AND currency='ARS'")).rows,today});}
export async function POST(r:Request){if(!allowed(r))return new NextResponse(null,{status:404});if(r.headers.get('origin')!==new URL(r.url).origin)return new NextResponse(null,{status:403});try{const b=await r.json();return NextResponse.json(await(await localObligationDb()).transaction(tx=>writeSupplierPayment(tx,1,actor,b,today)));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Error local'},{status:409})}}
