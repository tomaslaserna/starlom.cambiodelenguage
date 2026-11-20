import type { getCashflowSnapshot } from '@/lib/cashflow-read';
import { formatCurrency, formatDate } from '@/lib/format';

export function ProjectionSummary({ cashflow }: { cashflow: Awaited<ReturnType<typeof getCashflowSnapshot>> }) {
  const { meta } = cashflow;
  return <div className="space-y-4">
    <p className="text-sm text-slate-500">Desde el saldo registrado de <strong className="text-slate-800">{formatCurrency(meta.openingBalance)}</strong> al {formatDate(meta.asOf)}. Escenario según vencimientos, sin incluir atrasados ni importes sin fecha. Sujeto a cobro y pago efectivo.</p>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3">
      {meta.horizons.map(horizon=><div key={horizon.days} className="min-w-0 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">A {horizon.days} días</h3>
        <p className="mt-1 text-xs text-slate-500">Saldo proyectado · {formatDate(horizon.through)}</p>
        <p className={`mt-2 break-words text-2xl font-bold tabular-nums ${horizon.projectedBalance>=0?'text-slate-950':'text-red-700'}`}>{formatCurrency(horizon.projectedBalance)}</p>
        <dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt>Ingresos previstos</dt><dd className="tabular-nums text-emerald-700">+ {formatCurrency(horizon.inflow)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Egresos previstos</dt><dd className="tabular-nums text-red-700">− {formatCurrency(horizon.outflow)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2"><dt>Variación</dt><dd className="font-semibold tabular-nums">{formatCurrency(horizon.net)}</dd></div></dl>
      </div>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><strong>Vencidos · requieren gestión</strong><p className="mt-2">Por cobrar {formatCurrency(meta.overdue.inflow)} · Por pagar {formatCurrency(meta.overdue.outflow)}</p></div>
      <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700"><strong>Sin fecha confirmada</strong><p className="mt-2">Por cobrar {formatCurrency(meta.undated.inflow)} · Por pagar {formatCurrency(meta.undated.outflow)}</p></div>
    </div>
    <p className="text-xs leading-relaxed text-slate-500">Vencidos e importes sin fecha se muestran aparte y no se suman a los próximos días. {meta.unallocatedAccounts>0?`${meta.unallocatedAccounts} cuentas requieren revisar imputaciones antes de proyectar sus remitos. `:''}Los sueldos son una estimación mensual pendiente, incluidas provisiones, con fecha orientativa al inicio del mes siguiente. Los costos operativos sin obligación de pago registrada no se proyectan automáticamente.</p>
    <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer p-3 text-sm font-semibold text-slate-700">Ver composición de la proyección</summary>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">Fecha</th><th className="p-3">Concepto</th><th className="p-3 text-right">Ingreso</th><th className="p-3 text-right">Egreso</th></tr></thead><tbody>{cashflow.data.map(item=><tr key={item.id} className="border-t border-slate-100"><td className="whitespace-nowrap p-3">{item.date?formatDate(item.date):'Sin fecha'}</td><td className="p-3">{item.label}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{item.kind==='inflow'?formatCurrency(item.amount):'—'}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{item.kind==='outflow'?formatCurrency(item.amount):'—'}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}
