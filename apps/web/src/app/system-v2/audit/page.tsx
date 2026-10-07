import Link from "next/link";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_BALANCE_READ_PERMISSION } from "@/lib/route-auth";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";

const findings = [
  { priority: "P0", title: "Cobranzas con dos reglas", detail: "El flujo nuevo admite saldo a favor, el anterior limita el pago y una selección vacía todavía puede activar FIFO.", area: "Comercial" },
  { priority: "P0", title: "Borrado de hechos económicos", detail: "Ventas, compras y movimientos relacionados aún pueden eliminarse físicamente en rutas administrativas.", area: "Control" },
  { priority: "P0", title: "Permisos por rol maestro", detail: "Administrador y Jefe evitan controles granulares; el objetivo debe ser capacidad más alcance.", area: "Seguridad" },
  { priority: "P0", title: "Migraciones sin fuente única", detail: "Conviven dos directorios de migraciones y un SQL monolítico, con documentación contradictoria.", area: "Datos" },
  { priority: "P1", title: "Compras mezcla etapas", detail: "Orden, recepción, stock, costo, factura y pago no están separados de forma consistente.", area: "Abastecimiento" },
  { priority: "P1", title: "Fiscalidad sin outbox durable", detail: "La entrega confirma primero y la autorización externa queda fuera de la transacción, sin cola durable completa.", area: "Fiscal" },
  { priority: "P1", title: "RR.HH. acoplado a acceso", detail: "Legajo, usuario, permisos, horarios y remuneración necesitan ciclos de vida independientes.", area: "Personas" },
  { priority: "P1", title: "IA puede terminar sin texto", detail: "La herramienta obtiene resultados pero no garantiza una síntesis final para la persona usuaria.", area: "IA" },
] as const;

const decisions = [
  ["Autenticación y RLS", "Conservar y adaptar", "Buena base de identidad y aislamiento"],
  ["Clientes, CRM y presupuestos", "Fusionar", "Un maestro y un recorrido comercial"],
  ["Ventas y pedidos", "Rediseñar", "Un ciclo de vida operacional"],
  ["Cobranzas", "Reemplazar", "Un servicio, imputación explícita"],
  ["Compras y proveedores", "Rediseñar", "Separar orden, recepción, factura y pago"],
  ["Caja, balance y rentabilidad", "Consolidar", "Tesorería y cierres reproducibles"],
  ["Empleados y remuneraciones", "Rediseñar", "Persona, acceso y nómina separados"],
  ["Motor fiscal", "Conservar y endurecer", "Outbox, reintentos y reconciliación"],
] as const;

const phases = [
  { number: "0", title: "Preparar", text: "Mapa de dependencias, migraciones canónicas, respaldo, datos base y banderas." },
  { number: "1", title: "Administración y Finanzas", text: "Primer reemplazo: uso actual nulo y bajo impacto operativo directo." },
  { number: "2", title: "Compras y Proveedores", text: "Nuevo circuito con migración histórica de stock, costos, facturas y deudas." },
  { number: "3", title: "RR.HH. y CRM", text: "Rediseñar preservando login, sesiones y permisos; integrar CRM en Comercial." },
  { number: "4", title: "Datos", text: "Migrar íntegramente clientes, productos, precios y stock hacia maestros canónicos." },
  { number: "5", title: "Operaciones y Cobros", text: "Últimos por criticidad: evolución gradual, ejecución paralela y conciliación." },
  { number: "6", title: "Estética unificada", text: "Homogeneizar todo el sistema cuando los circuitos ya estén estabilizados." },
] as const;

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "red" | "amber" | "green" | "blue" | "slate" }) {
  const colors = { red: "bg-red-50 text-red-700 ring-red-200", amber: "bg-amber-50 text-amber-700 ring-amber-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200", blue: "bg-blue-50 text-blue-700 ring-blue-200", slate: "bg-slate-100 text-slate-700 ring-slate-200" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${colors[tone]}`}>{children}</span>;
}

export default async function SystemAuditPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_BALANCE_READ_PERMISSION]);

  return (
    <main className="min-h-screen bg-[#f3f6fa] text-[#172033]">
      <header className="border-b border-slate-200 bg-[#0a1730] text-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#1473e6] text-lg font-black">S</span><div><p className="text-lg font-black">Auditoría Sistema V2</p><p className="text-sm text-white/60">Corte 06/10/2026 · evidencia local · sin cambios productivos</p></div></div>
          <Link className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold transition hover:bg-white/15" href="/system-v2">Volver al prototipo</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 lg:px-8">
        <section className="grid gap-5 xl:grid-cols-[1.5fr_0.9fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
            <div className="flex flex-wrap gap-2"><Pill tone="red">NO-GO big bang</Pill><Pill tone="green">GO migración por dominios</Pill></div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-[-0.04em] lg:text-5xl">Starlim debe evolucionar: conservar su experiencia y simplificar sus caminos.</h1>
            <p className="mt-5 max-w-4xl text-base leading-7 text-slate-600">El sistema actual contiene años de reglas y aprendizajes reales. La V2 no parte de cero: conserva ese núcleo, unifica las reglas que hoy se contradicen y mejora la forma de operar, controlar y comprender cada movimiento.</p>
          </article>
          <aside className="rounded-2xl bg-[#1473e6] p-6 text-white shadow-sm lg:p-8">
            <p className="text-sm font-bold text-white/70">Recomendación</p>
            <p className="mt-3 text-2xl font-black tracking-tight">Sustitución progresiva por menús, según uso real.</p>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-white/85"><li>• Administración y Finanzas pueden reemplazarse primero.</li><li>• Compras es el segundo bloque de evolución.</li><li>• Proteger login y permisos durante el cambio de RR.HH.</li><li>• Operaciones y Cobros/Pagos se migran al final.</li></ul>
          </aside>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[["77", "pantallas"], ["124", "endpoints"], ["129", "módulos de dominio"], ["69", "archivos de prueba"], ["9", "pruebas fallidas"]].map(([value, label], index) => <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={label}><p className={`text-3xl font-black ${index === 4 ? "text-red-600" : "text-[#0b63d8]"}`}>{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></article>)}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0b63d8]">Hallazgos</p><h2 className="mt-1 text-2xl font-black tracking-tight">Lo que bloquea una migración segura</h2></div><Pill tone="amber">4 P0 · 4 P1</Pill></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{findings.map((finding) => <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={finding.title}><div className="flex items-center justify-between gap-2"><Pill tone={finding.priority === "P0" ? "red" : "amber"}>{finding.priority}</Pill><span className="text-xs font-bold text-slate-400">{finding.area}</span></div><h3 className="mt-4 font-black">{finding.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{finding.detail}</p></article>)}</div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5"><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0b63d8]">Decisiones</p><h2 className="mt-1 text-2xl font-black">Matriz funcional</h2></div>
            <DataTable caption="Decisiones de evolución por dominio" className="rounded-none border-0 shadow-none" minWidth="760px" tableLabel="Matriz funcional">
              <DataTableHeader><DataTableRow><DataTableHead>Dominio</DataTableHead><DataTableHead>Decisión</DataTableHead><DataTableHead>Fundamento</DataTableHead></DataTableRow></DataTableHeader>
              <DataTableBody>{decisions.map(([domain, decision, reason]) => <DataTableRow key={domain}><DataTableCell className="font-bold">{domain}</DataTableCell><DataTableCell className="text-[#0b63d8]">{decision}</DataTableCell><DataTableCell className="text-slate-600">{reason}</DataTableCell></DataTableRow>)}</DataTableBody>
            </DataTable>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0b63d8]">Arquitectura</p><h2 className="mt-1 text-2xl font-black">Monolito modular + ledgers + outbox</h2>
            <div className="mt-6 grid gap-3">{["Interfaz por rol", "Comandos y casos de uso", "Servicios de dominio", "PostgreSQL: ledgers inmutables", "Outbox: ARCA, pagos y notificaciones"].map((item, index) => <div className="flex items-center gap-3" key={item}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-black text-[#0b63d8]">{index + 1}</span><div className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold">{item}</div></div>)}</div>
            <p className="mt-5 text-sm leading-6 text-slate-600">No se recomiendan microservicios. El salto de calidad proviene de límites claros, transacciones y una sola regla por operación.</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0b63d8]">Implementación</p><h2 className="mt-1 text-2xl font-black">Secuencia de migración</h2></div><Pill tone="blue">Aditiva y reversible</Pill></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{phases.map((phase) => <article className="rounded-xl border border-slate-200 bg-slate-50 p-5" key={phase.number}><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0a1730] font-black text-white">{phase.number}</span><h3 className="font-black">{phase.title}</h3></div><p className="mt-3 text-sm leading-6 text-slate-600">{phase.text}</p></article>)}</div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><Pill tone="green">Pasa</Pill><h3 className="mt-4 text-lg font-black">Lint, TypeScript y seguridad local</h3><p className="mt-2 text-sm leading-6 text-emerald-900/70">La base compila y supera los controles estáticos configurados.</p></article>
          <article className="rounded-2xl border border-red-200 bg-red-50 p-6"><Pill tone="red">No pasa</Pill><h3 className="mt-4 text-lg font-black">Suite funcional</h3><p className="mt-2 text-sm leading-6 text-red-900/70">Nueve pruebas fallan y gran parte de la suite valida texto, no comportamiento.</p></article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><Pill tone="amber">Pendiente</Pill><h3 className="mt-4 text-lg font-black">Prueba productiva punta a punta</h3><p className="mt-2 text-sm leading-6 text-amber-900/70">Sin base de integración ni credenciales no corresponde afirmar que todas las mutaciones funcionan.</p></article>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-sm text-slate-500"><span>Auditoría local · no se modificaron datos productivos.</span><span>Documentación completa en <code className="rounded bg-slate-200 px-1.5 py-1">docs/system-v2-audit</code></span></footer>
      </div>
    </main>
  );
}
