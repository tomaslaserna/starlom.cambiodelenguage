import type { Reputation } from "@/lib/customer-reputation";

export function CustomerReputation({ value, detail = false }: { value?: Reputation; detail?: boolean }) {
  const score = value?.score;
  const color = score == null ? "#64748b" : score >= 80 ? "#167044" : score >= 55 ? "#a34d00" : "#b42332";
  const reasons = [
    value?.paymentDays == null ? "Pago sin datos" : "Atraso promedio ponderado: "+value.paymentDays.toFixed(1)+" días",
    value?.repeatDelay == null ? "Recompra sin evaluar" : value.repeatDelay > 0 ? "Recompra demorada "+value.repeatDelay+" días" : "Recompra dentro de plazo",
    value?.margin == null ? "Margen sin datos suficientes" : "Margen del mes anterior: "+value.margin.toFixed(1)+"%",
  ].join(" · ");
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs" title={reasons}>
    <span className="inline-flex items-center gap-1 font-semibold" style={{color}}>
      <svg width="26" height="15" viewBox="0 0 30 17" aria-hidden="true"><path d="M2 15a13 13 0 0 1 26 0" fill="none" stroke="#cbd5e1" strokeWidth="4" />
      {score != null && <path d="M2 15a13 13 0 0 1 26 0" fill="none" stroke="currentColor" strokeWidth="4" pathLength="100" strokeDasharray={score+" 100"}/>}</svg>
      {score == null ? "Sin historial suficiente" : "Reputación "+score+"/100"}
    </span>{detail && <span className="text-slate-600">{reasons}</span>}
  </span>;
}
