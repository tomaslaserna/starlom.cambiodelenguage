import type {CostSql} from './cost-obligations-core.ts';
export type SupplierInput={intent:'schedule'|'pay';purchaseId:string;requestId:string;accountId?:string;date:string;amountCents:number;expectedPaidCents:number};
const uuid=(v:string)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export async function writeSupplierPayment(tx:CostSql,companyId:number,actor:string,b:SupplierInput,today:string){
 if(!Number.isSafeInteger(companyId)||companyId<=0||!uuid(actor)||!uuid(b.purchaseId)||!uuid(b.requestId)) throw Error('Identificación inválida');
 if(!['schedule','pay'].includes(b.intent)||!Number.isSafeInteger(b.amountCents)||b.amountCents<=0||!Number.isSafeInteger(b.expectedPaidCents)||b.expectedPaidCents<0) throw Error('Importe inválido');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date) throw Error('Fecha inválida');
 if(b.intent==='pay'&&b.date>today) throw Error('Para una fecha futura usá Programar');
 if(b.intent==='schedule'&&b.date<today) throw Error('La programación debe ser de hoy en adelante');
 const ledger=await tx.query<{state:{baselineMonth:string}}>('SELECT state FROM admin_monthly_cost_ledger WHERE empresa_id=$1 FOR UPDATE',[companyId]);
 if(!ledger.rows[0]||b.date.slice(0,7)<ledger.rows[0].state.baselineMonth) throw Error('No se modifica el histórico anterior al inicio');
 const payload={intent:b.intent,purchaseId:b.purchaseId,accountId:b.intent==='pay'?b.accountId:null,date:b.date,amountCents:b.amountCents,expectedPaidCents:b.expectedPaidCents};
 const prior=await tx.query<{id:string;request_payload:typeof payload}>('SELECT id,request_payload FROM admin_supplier_payment_operations WHERE id=$1 AND empresa_id=$2',[b.requestId,companyId]);
 if(prior.rows[0]){if(Object.keys(payload).some(k=>prior.rows[0].request_payload[k as keyof typeof payload]!==payload[k as keyof typeof payload])) throw Error('Este intento ya se registró con otros datos');return {id:prior.rows[0].id};}
 if((await tx.query("SELECT id FROM admin_finance_monthly_closures WHERE empresa_id=$1 AND status='closed' AND month IN (($2||'-01')::date,($3||'-01')::date)",[companyId,b.date.slice(0,7),today.slice(0,7)])).rows.length) throw Error('Período cerrado');
 const p=(await tx.query<{total:string;paid:string;status:string;name:string}>(`SELECT (p.total_amount*100)::bigint::text total,(coalesce(p.paid_amount,0)*100)::bigint::text paid,p.status,coalesce(s.display_name,'Proveedor') name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.empresa_id=p.empresa_id WHERE p.empresa_id=$1 AND p.id=$2 FOR UPDATE OF p`,[companyId,b.purchaseId])).rows[0];
 if(!p||p.status==='cancelada') throw Error('Compra no disponible');
 if(Number(p.paid)!==b.expectedPaidCents) throw Error('El saldo cambió: actualizá antes de pagar');
 if(b.amountCents>Number(p.total)-Number(p.paid)) throw Error('El importe supera el pendiente');
 if((await tx.query("SELECT id FROM app_solicitudes WHERE empresa_id=$1 AND estado='pendiente' AND metadata->>'action'='supplier_payment' AND metadata->>'purchaseId'=$2",[companyId,b.purchaseId])).rows.length) throw Error('Hay una solicitud anterior pendiente: revisala antes de crear otro pago');
 let paymentId:string|null=null,movementId:string|null=null;
 if(b.intent==='schedule'){
 if((await tx.query("SELECT id FROM admin_supplier_payment_operations WHERE empresa_id=$1 AND purchase_id=$2 AND intent='schedule' AND paid_cents<amount_cents",[companyId,b.purchaseId])).rows.length) throw Error('Esta compra ya tiene un pago programado');
 }else{
 if(!/^\d+$/.test(b.accountId??'')||!(await tx.query("SELECT id FROM admin_treasury_accounts WHERE empresa_id=$1 AND id=$2 AND active AND currency='ARS' FOR SHARE",[companyId,b.accountId])).rows.length) throw Error('Seleccioná una cuenta de origen activa');
 const amount=(b.amountCents/100).toFixed(2);
 paymentId=(await tx.query<{id:string}>(`INSERT INTO payments(purchase_id,payment_date,amount,method,reference,status,registered_by,entity_type,entity_name,concept,notes,empresa_id) VALUES($1,$2,$3,'pago_proveedor',$4,'registrado',$5,'pago',$6,'Pago proveedor','Registrado desde Pagos',$7) RETURNING id`,[b.purchaseId,b.date,amount,b.requestId,actor,p.name,companyId])).rows[0].id;
 await tx.query('UPDATE purchases SET paid_amount=coalesce(paid_amount,0)+$1,updated_at=now() WHERE id=$2 AND empresa_id=$3',[amount,b.purchaseId,companyId]);
 await tx.query(`INSERT INTO current_account_movements(purchase_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id) VALUES($1,$2,$3,$4,0,'Pago proveedor · circuito unificado','proveedor',$5,$6)`,[b.purchaseId,paymentId,b.date,amount,p.name,companyId]);
 movementId=(await tx.query<{id:string}>(`INSERT INTO admin_treasury_movements(empresa_id,account_id,movement_date,direction,amount,concept,source_type,source_id,reference,notes,created_by) VALUES($1,$2,$3,'outflow',$4,$5,'supplier_payment',$6,$7,'Pago de compra existente',$8) RETURNING id::text`,[companyId,b.accountId,b.date,amount,`Pago a ${p.name}`,paymentId,b.requestId,actor])).rows[0].id;
 await tx.query("UPDATE admin_supplier_payment_operations SET paid_cents=LEAST(amount_cents,paid_cents+$1) WHERE empresa_id=$2 AND purchase_id=$3 AND intent='schedule' AND paid_cents<amount_cents",[b.amountCents,companyId,b.purchaseId]);
 }
 await tx.query(`INSERT INTO admin_supplier_payment_operations(id,empresa_id,purchase_id,intent,request_payload,amount_cents,due_date,payment_id,movement_id,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,[b.requestId,companyId,b.purchaseId,b.intent,JSON.stringify(payload),b.amountCents,b.date,paymentId,movementId,actor]);
 return {id:b.requestId};
}
export async function readSupplierPayments(tx:CostSql,companyId:number){
 const rows=await tx.query<{id:string;name:string;number:string;balanceCents:string;paidCents:string;scheduledDate:string|null;scheduledCents:string;legacy:boolean}>(`SELECT p.id,coalesce(s.display_name,'Proveedor') name,coalesce(p.purchase_number,p.id::text) number,((p.total_amount-coalesce(p.paid_amount,0))*100)::bigint::text "balanceCents",(coalesce(p.paid_amount,0)*100)::bigint::text "paidCents",o.due_date::text "scheduledDate",coalesce(o.amount_cents-o.paid_cents,0)::text "scheduledCents",EXISTS(SELECT 1 FROM app_solicitudes r WHERE r.empresa_id=p.empresa_id AND r.estado='pendiente' AND r.metadata->>'action'='supplier_payment' AND r.metadata->>'purchaseId'=p.id::text) legacy FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.empresa_id=p.empresa_id LEFT JOIN admin_supplier_payment_operations o ON o.empresa_id=p.empresa_id AND o.purchase_id=p.id AND o.intent='schedule' AND o.paid_cents<o.amount_cents WHERE p.empresa_id=$1 AND p.status<>'cancelada' AND p.total_amount-coalesce(p.paid_amount,0)>0.005 ORDER BY p.due_date NULLS LAST,p.id`,[companyId]);
 return rows.rows.map(r=>({...r,balanceCents:Number(r.balanceCents),paidCents:Number(r.paidCents),scheduledCents:Number(r.scheduledCents)}));
}
export type SupplierRow=Awaited<ReturnType<typeof readSupplierPayments>>[number];
