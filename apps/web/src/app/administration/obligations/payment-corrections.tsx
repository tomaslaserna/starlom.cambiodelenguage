"use client";
import { useState } from "react";
import type { CostPaymentWorkspace } from "@/lib/cost-obligations-read";
import type { CostObligation } from "@/lib/cost-obligations-core";
const money=(n:number)=>(n/100).toLocaleString("es-AR",{style:"currency",currency:"ARS"});
const button="rounded-xl border px-4 py-2 text-sm disabled:opacity-40";
export function PaymentCorrections({data,rows,busy,send}:{data:CostPaymentWorkspace;rows:CostObligation[];busy:boolean;send:(body:unknown)=>Promise<boolean>}){
 const [selection,setSelection]=useState<{intent:"cancel"|"reverse";id:string;label:string;manual?:boolean}|null>(null);
 const [reason,setReason]=useState(""),[date,setDate]=useState(data.today);
 return <details className="rounded-2xl border border-slate-200 bg-white p-5">
  <summary className="cursor-pointer font-semibold">Pagos y correcciones</summary>
  <p className="mt-2 text-sm text-slate-500">Los registros originales se conservan. Corregí sólo errores de carga; estas acciones no transfieren dinero en el banco.</p>
  {rows.filter(o=>!o.cancelled&&o.paidCents===0).map(o=><div key={o.id} className="mt-3 flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"><span>{o.concept} · sin pagos</span><button className={button} disabled={busy} onClick={()=>{setSelection({intent:"cancel",id:o.id,label:o.concept});setReason("");}}>Anular obligación</button></div>)}
  {data.payments.map(p=><div key={p.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><div><strong>{p.concept} · {money(p.amountCents)}</strong><p>{p.account} · {p.date}</p>{p.reversed?<p>Corregido el {p.reversalDate}: {p.reason}</p>:null}</div>{!p.reversed?<button className={button} disabled={busy} onClick={()=>{setSelection({intent:"reverse",id:p.id,label:p.concept,manual:p.manual});setReason("");setDate(data.today);}}>Corregir pago</button>:null}</div>)}
  {selection?<div className="mt-4 rounded-xl bg-amber-50 p-4 space-y-3">
    <h3 className="font-bold">{selection.intent==="cancel"?"Anular obligación":"Corregir pago"} · {selection.label}</h3>
    <p className="text-sm">{selection.intent==="cancel"?"Se conservará la obligación anulada. Podrás programarla de nuevo; no se moverá dinero.":selection.manual?"Se deshará el vínculo con el egreso manual, sin modificar Tesorería.":"Se registrará una entrada de corrección por el importe original en la misma cuenta y se reabrirá el pendiente. El egreso original se conserva."}</p>
    {selection.intent==="reverse"?<label className="block text-sm">Fecha de corrección<input type="date" className="ml-3 rounded border p-2" value={date} min={data.baselineMonth+"-01"} max={data.today} onChange={e=>setDate(e.target.value)}/></label>:null}
    <label className="block text-sm">Motivo obligatorio<textarea className="mt-1 block w-full rounded border p-2" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>
    <div className="flex gap-3"><button className={button+" bg-blue-600 text-white"} disabled={busy||reason.trim().length<5||!date} onClick={async()=>{if(await send({intent:selection.intent,reason,...(selection.intent==="cancel"?{obligationId:selection.id}:{paymentId:selection.id,date})}))setSelection(null);}}>Confirmar corrección</button><button className={button} disabled={busy} onClick={()=>setSelection(null)}>Volver</button></div>
  </div>:null}
 </details>;
}
