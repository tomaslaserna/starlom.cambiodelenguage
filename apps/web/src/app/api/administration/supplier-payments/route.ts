import {NextResponse} from 'next/server';
import {requireApiSession,requireSessionPermission,ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION,ADMIN_TREASURY_READ_PERMISSION,ADMIN_TREASURY_WRITE_PERMISSION} from '@/lib/route-auth';
import {withCompanyContext} from '@/lib/db';
import {readSupplierPayments,writeSupplierPayment} from '@/lib/supplier-payments-core';
import {localDateIso} from '@/lib/timezone';
import {ApiError} from '@/lib/api-response';
export const dynamic='force-dynamic';
function fail(e:unknown){return NextResponse.json({error:e instanceof ApiError?e.message:'No se confirmó la operación. Actualizá antes de reintentar.'},{status:e instanceof ApiError?e.status:409});}
async function auth(){if(process.env.UNIFIED_PAYMENTS_ENABLED!=='true')throw new ApiError(404,'Circuito no habilitado');const s=await requireApiSession([ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION]);await requireSessionPermission(s,[ADMIN_TREASURY_READ_PERMISSION]);return s;}
export async function GET(){try{const s=await auth();return NextResponse.json(await withCompanyContext(s.companyId,async tx=>({rows:await readSupplierPayments(tx,s.companyId),accounts:(await tx.query("SELECT id::text,name FROM admin_treasury_accounts WHERE empresa_id=$1 AND active AND currency='ARS' ORDER BY name",[s.companyId])).rows,today:localDateIso()})),{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e)}}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ApiError(403,'Origen inválido');const s=await auth();await requireSessionPermission(s,[ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION]);const b=await r.json();if(b.intent==='pay')await requireSessionPermission(s,[ADMIN_TREASURY_WRITE_PERMISSION]);return NextResponse.json(await withCompanyContext(s.companyId,async tx=>{try{return await writeSupplierPayment(tx,s.companyId,s.userId,b,localDateIso())}catch(e){throw new ApiError(409,e instanceof Error?e.message:'No se confirmó el pago')}}));}catch(e){return fail(e)}}
