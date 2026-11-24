import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api-response';
import { requireApiSession, requireSessionPermission, ADMIN_METRICS_READ_PERMISSION, ADMIN_SALARIES_READ_PERMISSION, ADMIN_METRICS_WRITE_PERMISSION, ADMIN_SALARIES_WRITE_PERMISSION } from '@/lib/route-auth';
import { readMonthlyCostLedger, readMonthlyCostSource, initializeMonthlyCostLedger, mutateMonthlyCostLedger } from '@/lib/monthly-cost-ledger';
import { importMonthlyCostSource, type CostCommand } from '@/lib/monthly-cost-erp-domain';
import { currentMonth } from '@/lib/month-range';
export const dynamic='force-dynamic';
async function authorized(write=false) {
 const s=await requireApiSession([ADMIN_METRICS_READ_PERMISSION]);
 await requireSessionPermission(s,[ADMIN_SALARIES_READ_PERMISSION]);
 if(write){await requireSessionPermission(s,[ADMIN_METRICS_WRITE_PERMISSION]);await requireSessionPermission(s,[ADMIN_SALARIES_WRITE_PERMISSION]);}
 return s;
}
function failure(e:unknown) {return NextResponse.json({error:e instanceof ApiError?e.message:'No se pudo completar la operación; no se confirmó ningún cambio.'},{status:e instanceof ApiError?e.status:500});}
export async function GET() {
 try {const s=await authorized();const ledger=await readMonthlyCostLedger(s.companyId);const state=ledger?.state??importMonthlyCostSource(await readMonthlyCostSource(s.companyId,currentMonth()));return NextResponse.json({state,initialized:!!ledger,local:false},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Origen inválido');
  const s=await authorized(true);const body=await request.json();
  const state=body.intent==='initialize'?await initializeMonthlyCostLedger(s.companyId,s.userId,currentMonth()):await mutateMonthlyCostLedger(s.companyId,s.userId,body as CostCommand);
  return NextResponse.json({state,initialized:true,local:false},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
