import type { Reputation } from "@/lib/customer-reputation";

export function reputationBand(score: number | null | undefined) {
  return score == null ? "sin-datos" : score >= 80 ? "alta" : score >= 55 ? "media" : "baja";
}

export function CustomerReputation({ value, detail = false, compact = false, featured = false }: { value?: Reputation; detail?: boolean; compact?: boolean; featured?: boolean }) {
  const score = value?.score;
  const color = { "sin-datos": "#64748b", alta: "#167044", media: "#a34d00", baja: "#b42332" }[reputationBand(score)];
  const reasons = [
    value?.paymentDays == null ? "Pago sin datos" : "Atraso promedio ponderado: "+value.paymentDays.toFixed(1)+" días",
    value?.repeatDelay == null ? "Recompra sin evaluar" : value.repeatDelay > 0 ? "Recompra demorada "+value.repeatDelay+" días" : "Recompra dentro de plazo",
    value?.margin == null ? "Margen sin datos suficientes" : "Margen del mes anterior: "+value.margin.toFixed(1)+"%",
  ].join(" · ");
  const gauge = <svg width={featured ? 64 : 26} height={featured ? 37 : 15} viewBox="0 0 30 17" aria-hidden="true"><path d="M2 15a13 13 0 0 1 26 0" fill="none" stroke="#cbd5e1" strokeWidth="4" />
    {score != null && <path d="M2 15a13 13 0 0 1 26 0" fill="none" stroke="currentColor" strokeWidth="4" pathLength="100" strokeDasharray={score+" 100"}/>}</svg>;
  if (featured) {
    return <section aria-label="Reputación del cliente" className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div>
        <h2 className="mb-2 text-sm font-bold">Reputación del cliente</h2>
        <div className="flex items-center gap-3 font-bold" style={{color}}>
          {gauge}
          {score == null ? <span>Sin historial suficiente</span> : <>
            <span className="text-3xl tabular-nums">{score}<span className="text-sm">/100</span></span>
            <span className="capitalize">{reputationBand(score)}</span>
          </>}
        </div>
      </div>
      <p className="text-sm text-slate-600">{reasons}</p>
    </section>;
  }
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs" title={reasons}>
    <span className="inline-flex items-center gap-1 font-semibold" style={{color}}>
      {gauge}
      {score == null ? (compact ? "Sin datos" : "Sin historial suficiente") : (compact ? "" : "Reputación ")+score+"/100"}
    </span>{detail && <span className="text-slate-600">{reasons}</span>}
  </span>;
}
