"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon, Button, StatusBadge, cn } from "@/components/ui";
import { type SystemView } from "./model";
import { usePrototypeStore } from "./use-prototype-store";
import {
  AdministrationView,
  CommercialView,
  ControlView,
  HomeView,
  OperationsView,
  PeopleView,
  SupplyView,
} from "./views";

const navigation: Array<{ key: SystemView; label: string; description: string; icon: "chart" | "user" | "cart" | "package" | "wallet" | "receipt" | "warning" }> = [
  { key: "home", label: "Inicio", description: "Qué requiere atención", icon: "chart" },
  { key: "commercial", label: "Comercial", description: "Clientes y oportunidades", icon: "user" },
  { key: "operations", label: "Operaciones", description: "Pedidos y entregas", icon: "cart" },
  { key: "supply", label: "Abastecimiento", description: "Compras, proveedores y stock", icon: "package" },
  { key: "people", label: "Personas", description: "Equipo, asistencia y sueldos", icon: "user" },
  { key: "administration", label: "Administración", description: "Caja, deuda y patrimonio", icon: "wallet" },
  { key: "control", label: "Control", description: "Fiscal, documentos y auditoría", icon: "warning" },
];

export type PrototypeStore = ReturnType<typeof usePrototypeStore>;

export function SystemPrototype() {
  const [view, setView] = useState<SystemView>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const store = usePrototypeStore();
  const current = navigation.find((item) => item.key === view) || navigation[0];

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="grid min-h-screen xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className={cn("border-r border-[#dbe3ec] bg-[#0a1730] text-white xl:block", menuOpen ? "block" : "hidden")}>
          <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-4">
            <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-5 pt-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#1473e6] text-lg font-black">S</span>
              <div><strong className="block text-lg tracking-[-0.03em]">Starlim</strong><small className="text-white/55">Sistema V2 · prototipo</small></div>
            </div>
            <nav aria-label="Sistema V2" className="mt-5 grid gap-1.5">
              {navigation.map((item) => <button className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition", view === item.key ? "bg-[#1473e6] shadow-[0_10px_24px_rgba(20,115,230,0.28)]" : "text-white/75 hover:bg-white/8 hover:text-white")} key={item.key} onClick={() => { setView(item.key); setMenuOpen(false); }} type="button"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", view === item.key ? "bg-white/15" : "bg-white/6")}><AppIcon className="h-5 w-5" name={item.icon} /></span><span><strong className="block text-sm">{item.label}</strong><small className={cn("mt-0.5 block", view === item.key ? "text-white/75" : "text-white/45")}>{item.description}</small></span></button>)}
            </nav>
            <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><strong className="text-sm">Entorno local seguro</strong></div><p className="mt-2 text-xs leading-5 text-white/55">Los cambios viven sólo en este navegador y no afectan producción.</p></div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#dbe3ec] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3"><button aria-label="Abrir menú" className="grid h-10 w-10 place-items-center rounded-lg border border-[#dbe3ec] xl:hidden" onClick={() => setMenuOpen((value) => !value)} type="button">☰</button><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-lg font-extrabold tracking-[-0.025em]">{current.label}</h1><StatusBadge tone="accent">V2</StatusBadge></div><p className="truncate text-xs text-[#64748b]">{current.description}</p></div></div>
            <div className="flex items-center gap-3"><Link className="hidden rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-xs font-bold text-[#1e40af] transition hover:bg-[#dbeafe] sm:inline-flex" href="/system-v2/audit">Ver auditoría</Link><div className="hidden text-right md:block"><strong className="block text-sm">Augusto Finocchietti</strong><small className="text-[#64748b]">Administrador · Starlim</small></div><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e8f1ff] font-black text-[#0b63d8]">AF</span></div>
          </header>

          <div className="mx-auto grid w-full max-w-[1540px] gap-5 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm text-[#1e40af]"><span><strong>Prototipo integral.</strong> Podés operar todos los circuitos ficticios y ver sus impactos conectados.</span><Button onClick={store.reset} size="sm" type="button" variant="secondary">Restaurar demo</Button></div>
            {store.notice ? <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"><span>{store.notice}</span><button aria-label="Cerrar aviso" onClick={() => store.setNotice("")} type="button">×</button></div> : null}
            {view === "home" ? <HomeView changeView={setView} store={store} /> : null}
            {view === "commercial" ? <CommercialView store={store} /> : null}
            {view === "operations" ? <OperationsView store={store} /> : null}
            {view === "supply" ? <SupplyView store={store} /> : null}
            {view === "people" ? <PeopleView store={store} /> : null}
            {view === "administration" ? <AdministrationView store={store} /> : null}
            {view === "control" ? <ControlView store={store} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
