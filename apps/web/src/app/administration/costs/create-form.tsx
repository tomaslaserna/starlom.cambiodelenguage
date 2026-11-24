'use client';
import {useState} from 'react';
import type {CostCommand} from '@/lib/monthly-cost-erp-domain';

const field='mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5';
export function CreateMonthlyCostForm({source,month,revision,pending,onSave,onCancel}:{source:'salary'|'expense';month:string;revision:number;pending:boolean;onSave:(command:CostCommand)=>Promise<boolean>;onCancel:()=>void}) {
 const [kind,setKind]=useState('fijo'),[duration,setDuration]=useState('indefinite'),[error,setError]=useState('');
 return <form className="grid gap-4 rounded-2xl border border-blue-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={async e=>{
  e.preventDefault();const data=new FormData(e.currentTarget);const raw=String(data.get('amount'));setError('');
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)){setError('Ingresá el importe como 800.000,00');return;}
  const ok=await onSave({intent:'create',source,name:String(data.get('name')),month:String(data.get('start')),amountCents:Math.round(Number(raw.replaceAll('.','').replace(',','.'))*100),costType:kind as 'fijo'|'variable'|'unico',durationMonths:kind==='unico'?1:duration==='indefinite'?null:Number(data.get('months')),bonus:source==='salary'&&data.get('bonus')==='on',chargesPercent:source==='salary'?Number(data.get('charges')):0,expectedRevision:revision});
  if(ok)onCancel();
 }}>
  <div className="sm:col-span-2 lg:col-span-3"><h2 className="text-lg font-bold">{source==='salary'?'Nuevo sueldo':'Nuevo costo'}</h2><p className="mt-1 text-sm text-slate-500">Se incorpora desde el mes elegido. Los meses anteriores conservan sus importes y detalle.</p></div>
  <label className="text-sm font-semibold">{source==='salary'?'Nombre del empleado':'Concepto'}<input className={field} name="name" required maxLength={150}/></label>
  <label className="text-sm font-semibold">{source==='salary'?'Sueldo base $':'Importe $'}<input className={field} name="amount" required inputMode="decimal" placeholder="800.000,00"/></label>
  <label className="text-sm font-semibold">Desde el mes<input className={field} name="start" type="month" required min={month} defaultValue={month} max="2099-12"/></label>
  {source==='expense'?<label className="text-sm font-semibold">Etiqueta<select className={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="fijo">Fijo</option><option value="variable">Variable</option><option value="unico">Único</option></select></label>:null}
  {kind!=='unico'?<label className="text-sm font-semibold">Duración<select className={field} value={duration} onChange={e=>setDuration(e.target.value)}><option value="indefinite">Indefinida</option><option value="limited">Cantidad de meses</option></select></label>:<p className="self-center text-sm text-slate-500">Se incluye solamente en el mes elegido.</p>}
  {kind!=='unico'&&duration==='limited'?<label className="text-sm font-semibold">Cantidad de meses<input className={field} name="months" type="number" min="1" max="600" step="1" defaultValue="1" required/></label>:null}
  {source==='salary'?<><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bonus"/>Provisionar aguinaldo (1/12)</label><label className="text-sm font-semibold">Cargas %<input className={field} type="number" min="0" max="100" step="0.01" name="charges" defaultValue="0" required/></label></>:null}
  <p className="text-sm text-slate-500 sm:col-span-2 lg:col-span-3">{source==='salary'?'Crea una previsión salarial, no un pago ni un usuario con acceso. Si el sueldo ya existe, usá «Cambiar desde…».':'Los gastos indefinidos se incluyen al dar el alta y requieren confirmación en los meses siguientes.'}</p>
  {error?<p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{error}</p>:null}
  <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><button disabled={pending} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{source==='salary'?'Guardar sueldo':'Guardar costo'}</button><button type="button" disabled={pending} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar alta</button></div>
 </form>;
}
