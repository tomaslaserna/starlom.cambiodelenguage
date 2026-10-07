"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AppIcon,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Input,
  Select,
  StatCard,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { periodLabel, type Period } from "@/lib/period-range";

type DemoView = "control" | "results" | "treasury" | "obligations" | "equity";

const demoViews: Array<{
  key: DemoView;
  label: string;
  icon: "chart" | "trend" | "wallet" | "receipt" | "money";
}> = [
  { key: "control", label: "Control", icon: "chart" },
  { key: "results", label: "Resultados", icon: "trend" },
  { key: "treasury", label: "Tesorería", icon: "wallet" },
  { key: "obligations", label: "Obligaciones", icon: "receipt" },
  { key: "equity", label: "Patrimonio", icon: "money" },
];

const demo = {
  cash: 8_240_000,
  receivables: 3_780_500,
  stock: 28_120_583,
  payables: 5_986_360,
  grossSales: 12_450_000,
  netSales: 10_289_256,
  cogs: 5_840_000,
  operatingCosts: 2_150_000,
  result: 2_299_256,
};

type DemoObligation = {
  id: string;
  due: string;
  type: string;
  beneficiary: string;
  concept: string;
  originalAmount: number;
  paidAmount: number;
  scheduledAmount?: number;
  scheduledDate?: string;
  account?: string;
};

type ObligationFilter = "open" | "all" | "overdue" | "upcoming" | "paid";

type DemoAccount = {
  name: string;
  kind: "Banco" | "Efectivo" | "Billetera" | "Otra";
  balance: number;
  statementBalance: number;
  reconciledAt?: string;
};

type DemoTreasuryMovement = {
  id: string;
  date: string;
  type: "Ingreso" | "Egreso";
  account: string;
  concept: string;
  amount: number;
};

type DemoCost = {
  id: string;
  name: string;
  category: "Fijo" | "Variable" | "Único";
  amount: number;
  startMonth: string;
  durationMonths: number | null;
  monthOverrides: Record<string, boolean>;
};

type DemoClosure = {
  version: number;
  status: "closed" | "reopened";
  closedAt: string;
  result: number;
  treasury: number;
  equity: number;
  notes: string;
  reopenReason?: string;
};

const initialObligations: DemoObligation[] = [
  { id: "obl-1", due: "2026-10-05", type: "Proveedor", beneficiary: "MARALIMM SAS", concept: "Factura 9975", originalAmount: 1_548_060, paidAmount: 0 },
  { id: "obl-2", due: "2026-10-10", type: "Proveedor", beneficiary: "POLIDES SRL", concept: "Factura 10140", originalAmount: 668_432, paidAmount: 0, scheduledAmount: 668_432, scheduledDate: "2026-10-09", account: "Santander" },
  { id: "obl-3", due: "2026-10-15", type: "Sueldo", beneficiary: "Equipo operativo", concept: "Liquidación mensual", originalAmount: 1_420_000, paidAmount: 520_000 },
  { id: "obl-4", due: "2026-10-18", type: "Costo operativo", beneficiary: "Servicios", concept: "Alquiler y servicios", originalAmount: 890_000, paidAmount: 0 },
];

const initialAccounts: DemoAccount[] = [
  { name: "Santander", kind: "Banco", balance: 6_450_000, statementBalance: 6_420_000 },
  { name: "Efectivo", kind: "Efectivo", balance: 1_240_000, statementBalance: 1_240_000 },
  { name: "Mercado Pago", kind: "Billetera", balance: 550_000, statementBalance: 550_000 },
  { name: "Otra cuenta", kind: "Otra", balance: 0, statementBalance: 0 },
];

const initialTreasuryMovements: DemoTreasuryMovement[] = [
  { id: "mov-1", date: "2026-10-06", type: "Ingreso", account: "Santander", concept: "Cobros de cuentas corrientes", amount: 925_400 },
  { id: "mov-2", date: "2026-10-05", type: "Egreso", account: "Efectivo", concept: "Gastos operativos", amount: 86_500 },
];

const initialCosts: DemoCost[] = [
  { id: "cost-1", name: "Sueldos del equipo", category: "Fijo", amount: 1_420_000, startMonth: "2026-10", durationMonths: null, monthOverrides: { "2026-10": true } },
  { id: "cost-2", name: "Alquiler y servicios", category: "Fijo", amount: 690_000, startMonth: "2026-10", durationMonths: null, monthOverrides: { "2026-10": true } },
  { id: "cost-3", name: "Logística y combustible", category: "Variable", amount: 220_000, startMonth: "2026-10", durationMonths: 3, monthOverrides: {} },
  { id: "cost-4", name: "Campaña institucional", category: "Único", amount: 180_000, startMonth: "2026-10", durationMonths: 1, monthOverrides: {} },
];

const historicalResults = [
  { month: "2026-07", sales: 8_920_000, result: 1_080_000 },
  { month: "2026-08", sales: 9_780_000, result: 1_420_000 },
  { month: "2026-09", sales: 9_491_934, result: 1_710_000 },
];

const DEMO_STORAGE_KEY = "starlim-administration-prototype-v2";

const horizons = [
  { days: 7, inflow: 1_820_000, outflow: 2_216_492 },
  { days: 15, inflow: 4_150_000, outflow: 3_726_492 },
  { days: 30, inflow: 7_930_000, outflow: 5_986_360 },
];

function localDateKey() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dayDistance(from: string, to: string) {
  const day = 86_400_000;
  return Math.ceil((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / day);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function remainingAmount(item: DemoObligation) {
  return Math.max(0, item.originalAmount - item.paidAmount);
}

function statusForObligation(item: DemoObligation, today: string) {
  const remaining = remainingAmount(item);
  if (remaining <= 0.005) return "Pagada";
  const distance = dayDistance(today, item.due);
  if (distance < 0) return item.paidAmount > 0 ? "Vencida parcial" : "Vencida";
  if (item.paidAmount > 0) return "Parcial";
  if (distance <= 7) return "Próxima";
  return "Pendiente";
}

function toneForStatus(status: string) {
  if (status.startsWith("Vencida")) return "danger" as const;
  if (status === "Próxima" || status === "Parcial") return "warning" as const;
  if (status === "Pagada") return "success" as const;
  return "neutral" as const;
}

function monthDistance(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

function costAppliesToMonth(cost: DemoCost, month: string) {
  if (typeof cost.monthOverrides[month] === "boolean") return cost.monthOverrides[month];
  const distance = monthDistance(cost.startMonth, month);
  if (distance < 0) return false;
  if (cost.durationMonths === null) return distance === 0;
  return distance < cost.durationMonths;
}

function displayMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function AdministrationDemo({ month, view }: { month: string; view: DemoView }) {
  const [demoObligations, setDemoObligations] = useState(initialObligations);
  const [treasuryAccounts, setTreasuryAccounts] = useState(initialAccounts);
  const [treasuryMovements, setTreasuryMovements] = useState(initialTreasuryMovements);
  const [showTreasuryMovement, setShowTreasuryMovement] = useState(false);
  const [reconcileAccountName, setReconcileAccountName] = useState<string | null>(null);
  const [treasuryNotice, setTreasuryNotice] = useState("");
  const [obligationFilter, setObligationFilter] = useState<ObligationFilter>("open");
  const [showNewObligation, setShowNewObligation] = useState(false);
  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(null);
  const [obligationNotice, setObligationNotice] = useState("");
  const [demoCosts, setDemoCosts] = useState(initialCosts);
  const [showCostEditor, setShowCostEditor] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [resultsNotice, setResultsNotice] = useState("");
  const [closures, setClosures] = useState<Record<string, DemoClosure[]>>({});
  const [storageReady, setStorageReady] = useState(false);
  const period: Period = { kind: "month", key: month };
  const today = localDateKey();
  const obligationSummary = useMemo(() => {
    return demoObligations.reduce(
      (summary, item) => {
        const remaining = remainingAmount(item);
        const distance = dayDistance(today, item.due);
        summary.pending += remaining;
        if (remaining > 0 && distance < 0) summary.overdue += remaining;
        if (remaining > 0 && distance >= 0 && distance <= 7) summary.upcoming += remaining;
        if (item.scheduledAmount && remaining > 0) summary.scheduled += Math.min(item.scheduledAmount, remaining);
        return summary;
      },
      { pending: 0, overdue: 0, upcoming: 0, scheduled: 0 },
    );
  }, [demoObligations, today]);
  const filteredObligations = useMemo(() => demoObligations.filter((item) => {
    const status = statusForObligation(item, today);
    const distance = dayDistance(today, item.due);
    if (obligationFilter === "all") return true;
    if (obligationFilter === "open") return status !== "Pagada";
    if (obligationFilter === "overdue") return status !== "Pagada" && distance < 0;
    if (obligationFilter === "upcoming") return status !== "Pagada" && distance >= 0 && distance <= 7;
    return status === "Pagada";
  }), [demoObligations, obligationFilter, today]);
  const selectedObligation = demoObligations.find((item) => item.id === selectedObligationId);
  const treasuryTotal = treasuryAccounts.reduce((total, account) => total + account.balance, 0);
  const treasuryDifference = treasuryAccounts.reduce((total, account) => total + account.statementBalance - account.balance, 0);
  const currentCosts = demoCosts.filter((cost) => costAppliesToMonth(cost, month));
  const operatingCosts = currentCosts.reduce((total, cost) => total + cost.amount, 0);
  const grossMargin = demo.netSales - demo.cogs;
  const operatingResult = grossMargin - operatingCosts;
  const assets = treasuryTotal + demo.receivables + demo.stock;
  const equity = assets - obligationSummary.pending;
  const accumulatedResult = historicalResults.reduce((total, item) => total + item.result, 0) + operatingResult;
  const editingCost = demoCosts.find((cost) => cost.id === editingCostId);
  const suspendedIndefiniteCosts = demoCosts.filter((cost) => cost.durationMonths === null && !costAppliesToMonth(cost, month));
  const currentClosure = closures[month]?.find((closure) => closure.status === "closed") ?? null;
  const closeChecks = [
    { label: "Costos de ventas completos", ready: true, detail: "La demo considera completa la integración de ventas y stock" },
    { label: "Cuentas conciliadas", ready: Math.abs(treasuryDifference) < 0.005, detail: Math.abs(treasuryDifference) < 0.005 ? "Los saldos informados coinciden" : `Diferencia de ${formatCurrency(treasuryDifference)}` },
    { label: "Costos fijos confirmados", ready: suspendedIndefiniteCosts.length === 0, detail: suspendedIndefiniteCosts.length === 0 ? "No quedan costos indefinidos suspendidos" : `${suspendedIndefiniteCosts.length} costos requieren decisión` },
  ];
  const closeReady = closeChecks.every((check) => check.ready);
  const treasuryForecast = horizons.map((horizon) => {
    const outflow = demoObligations.reduce((total, item) => {
      const remaining = remainingAmount(item);
      if (remaining <= 0) return total;
      const effectiveDate = item.scheduledDate || item.due;
      return dayDistance(today, effectiveDate) <= horizon.days ? total + remaining : total;
    }, 0);
    return { ...horizon, outflow, projectedBalance: treasuryTotal + horizon.inflow - outflow };
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { obligations?: DemoObligation[]; accounts?: DemoAccount[]; movements?: DemoTreasuryMovement[]; costs?: DemoCost[]; closures?: Record<string, DemoClosure[]> };
          if (Array.isArray(parsed.obligations)) setDemoObligations(parsed.obligations);
          if (Array.isArray(parsed.accounts)) setTreasuryAccounts(parsed.accounts);
          if (Array.isArray(parsed.movements)) setTreasuryMovements(parsed.movements);
          if (Array.isArray(parsed.costs)) setDemoCosts(parsed.costs);
          if (parsed.closures && typeof parsed.closures === "object") setClosures(parsed.closures);
        }
      } catch {
        window.localStorage.removeItem(DEMO_STORAGE_KEY);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ obligations: demoObligations, accounts: treasuryAccounts, movements: treasuryMovements, costs: demoCosts, closures }));
  }, [closures, demoObligations, demoCosts, storageReady, treasuryAccounts, treasuryMovements]);

  function resetDemo() {
    setDemoObligations(initialObligations);
    setTreasuryAccounts(initialAccounts);
    setTreasuryMovements(initialTreasuryMovements);
    setDemoCosts(initialCosts);
    setClosures({});
    setObligationNotice("");
    setTreasuryNotice("");
    setResultsNotice("Se restauraron los datos iniciales de la demostración.");
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  }

  function handleCreateObligation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setDemoObligations((current) => [
      {
        id: crypto.randomUUID(),
        due: String(values.get("due")),
        type: String(values.get("type")),
        beneficiary: String(values.get("beneficiary")).trim(),
        concept: String(values.get("concept")).trim(),
        originalAmount: amount,
        paidAmount: 0,
      },
      ...current,
    ]);
    form.reset();
    setShowNewObligation(false);
    setObligationNotice("La obligación se agregó a la agenda local.");
  }

  function handleManageObligation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedObligation) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("paymentAmount"));
    const mode = String(values.get("paymentMode"));
    const balance = remainingAmount(selectedObligation);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return;
    const actionDate = String(values.get("actionDate"));
    const account = String(values.get("account"));
    const sourceAccount = treasuryAccounts.find((item) => item.name === account);
    if (mode === "pay" && (!sourceAccount || sourceAccount.balance < amount)) {
      setObligationNotice(`No hay saldo suficiente en ${account}. Elegí otra cuenta o registrá fondos antes de pagar.`);
      return;
    }
    setDemoObligations((current) => current.map((item) => {
      if (item.id !== selectedObligation.id) return item;
      if (mode === "schedule") {
        return { ...item, scheduledAmount: amount, scheduledDate: actionDate, account };
      }
      const paidAmount = Math.min(item.originalAmount, item.paidAmount + amount);
      return { ...item, paidAmount, scheduledAmount: undefined, scheduledDate: undefined, account };
    }));
    if (mode === "pay") {
      setTreasuryAccounts((current) => current.map((item) => item.name === account ? { ...item, balance: item.balance - amount } : item));
      setTreasuryMovements((current) => [{
        id: crypto.randomUUID(), date: actionDate, type: "Egreso", account,
        concept: `Pago · ${selectedObligation.beneficiary} · ${selectedObligation.concept}`, amount,
      }, ...current]);
    }
    setObligationNotice(mode === "schedule" ? "El pago quedó programado en esta simulación." : "El pago quedó registrado y el saldo fue actualizado.");
    if (mode === "pay") setTreasuryNotice(`Se descontaron ${formatCurrency(amount)} de ${account} por el pago a ${selectedObligation.beneficiary}.`);
    setSelectedObligationId(null);
  }

  function handleTreasuryMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("movementAmount"));
    const type = String(values.get("movementType")) as "Ingreso" | "Egreso";
    const account = String(values.get("movementAccount"));
    const sourceAccount = treasuryAccounts.find((item) => item.name === account);
    if (!Number.isFinite(amount) || amount <= 0 || !sourceAccount) return;
    if (type === "Egreso" && sourceAccount.balance < amount) {
      setTreasuryNotice(`No hay saldo suficiente en ${account} para registrar este egreso.`);
      return;
    }
    const factor = type === "Ingreso" ? 1 : -1;
    const movement: DemoTreasuryMovement = {
      id: crypto.randomUUID(),
      date: String(values.get("movementDate")),
      type,
      account,
      concept: String(values.get("movementConcept")).trim(),
      amount,
    };
    setTreasuryAccounts((current) => current.map((item) => item.name === account ? { ...item, balance: item.balance + amount * factor } : item));
    setTreasuryMovements((current) => [movement, ...current]);
    setTreasuryNotice(`${type} registrado en ${account}. El saldo operativo fue actualizado.`);
    setShowTreasuryMovement(false);
    form.reset();
  }

  function handleReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reconcileAccountName) return;
    const values = new FormData(event.currentTarget);
    const statementBalance = Number(values.get("statementBalance"));
    if (!Number.isFinite(statementBalance)) return;
    setTreasuryAccounts((current) => current.map((account) => account.name === reconcileAccountName ? { ...account, statementBalance, reconciledAt: today } : account));
    setTreasuryNotice(`Saldo informado actualizado para ${reconcileAccountName}. La diferencia queda visible y no se corrige automáticamente.`);
    setReconcileAccountName(null);
  }

  function handleSaveCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("costAmount"));
    const durationValue = String(values.get("costDuration"));
    const category = String(values.get("costCategory")) as DemoCost["category"];
    const startMonth = String(values.get("costStartMonth"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const durationMonths = category === "Único" ? 1 : durationValue === "indefinite" ? null : Number(durationValue);
    const cost: DemoCost = {
      id: editingCost?.id || crypto.randomUUID(),
      name: String(values.get("costName")).trim(),
      category,
      amount,
      startMonth,
      durationMonths,
      monthOverrides: durationMonths === null ? (editingCost?.monthOverrides || { [startMonth]: true }) : {},
    };
    setDemoCosts((current) => editingCost ? current.map((item) => item.id === editingCost.id ? cost : item) : [cost, ...current]);
    if (String(values.get("createPayable")) === "yes" && !editingCost) {
      const due = String(values.get("costDue"));
      setDemoObligations((current) => [{ id: crypto.randomUUID(), due, type: "Costo operativo", beneficiary: cost.name, concept: `${cost.category} · ${displayMonth(startMonth)}`, originalAmount: amount, paidAmount: 0 }, ...current]);
    }
    setResultsNotice(editingCost ? "El costo fue actualizado y el resultado se recalculó." : "El costo fue agregado al período.");
    setShowCostEditor(false);
    setEditingCostId(null);
    form.reset();
  }

  function toggleCostForMonth(cost: DemoCost) {
    const active = costAppliesToMonth(cost, month);
    setDemoCosts((current) => current.map((item) => item.id === cost.id ? { ...item, monthOverrides: { ...item.monthOverrides, [month]: !active } } : item));
    setResultsNotice(active ? `${cost.name} quedó suspendido para ${displayMonth(month)}.` : `${cost.name} quedó incluido en ${displayMonth(month)}.`);
  }

  function removeCost(cost: DemoCost) {
    setDemoCosts((current) => current.filter((item) => item.id !== cost.id));
    setResultsNotice(`${cost.name} fue eliminado de la simulación.`);
    if (editingCostId === cost.id) { setEditingCostId(null); setShowCostEditor(false); }
  }

  function handleCloseMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closeReady || currentClosure) return;
    const values = new FormData(event.currentTarget);
    const previousVersions = closures[month] ?? [];
    const next: DemoClosure = {
      version: Math.max(0, ...previousVersions.map((closure) => closure.version)) + 1,
      status: "closed",
      closedAt: new Date().toISOString(),
      result: operatingResult,
      treasury: treasuryTotal,
      equity,
      notes: String(values.get("closeNotes") ?? "").trim(),
    };
    setClosures((current) => ({ ...current, [month]: [...(current[month] ?? []), next] }));
    setResultsNotice(`Se cerró ${displayMonth(month)} y se guardó la versión ${next.version}.`);
  }

  function handleReopenMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentClosure) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get("reopenReason") ?? "").trim();
    if (reason.length < 5) return;
    setClosures((current) => ({
      ...current,
      [month]: (current[month] ?? []).map((closure) => closure === currentClosure ? { ...closure, status: "reopened", reopenReason: reason } : closure),
    }));
    setResultsNotice(`Se reabrió ${displayMonth(month)}. La versión ${currentClosure.version} sigue disponible en el historial.`);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-5 text-[#172033] sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1480px] gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-[#1e40af] shadow-[var(--shadow-sm)]">
          <div>
            <strong className="block text-sm">Vista de demostración local</strong>
            <span className="text-xs">Datos ficticios persistidos en este navegador. No consulta ni modifica producción.</span>
          </div>
          <div className="flex items-center gap-2"><StatusBadge tone="accent">Solo localhost</StatusBadge><Button onClick={resetDemo} size="sm" type="button" variant="secondary">Restaurar demo</Button></div>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[#dbe3ec] bg-white px-5 py-5 shadow-[var(--shadow-sm)]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b63d8] text-white"><AppIcon name="trend" /></span>
              <div>
                <h1 className="text-2xl font-extrabold tracking-[-0.03em]">Administración</h1>
                <p className="mt-0.5 text-sm text-[#64748b]">Centro de control económico y financiero de Starlim.</p>
              </div>
            </div>
          </div>
          <form action="/administration" className="flex items-end gap-2">
            <input name="view" type="hidden" value={view} />
            <Field htmlFor="demo-month" label="Período">
              <Input defaultValue={month} id="demo-month" name="month" type="month" />
            </Field>
            <button className="h-10 rounded-lg bg-[#0b63d8] px-4 text-sm font-bold text-white" type="submit">Ver</button>
          </form>
        </header>

        <nav aria-label="Áreas de Administración" className="grid gap-2 rounded-2xl border border-[#dbe3ec] bg-white p-2 shadow-[var(--shadow-sm)] sm:grid-cols-2 xl:grid-cols-5">
          {demoViews.map((item) => (
            <Link
              className={cn("flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 font-bold", view === item.key ? "bg-[#0b63d8] text-white" : "text-[#334155] hover:bg-[#f1f5f9]")}
              href={`/administration?view=${item.key}&month=${month}`}
              key={item.key}
            >
              <AppIcon className="h-5 w-5" name={item.icon} />{item.label}
            </Link>
          ))}
        </nav>

        <div>
          <h2 className="text-xl font-extrabold">{demoViews.find((item) => item.key === view)?.label} · {periodLabel(period)}</h2>
          <p className="mt-1 text-sm text-[#64748b]">Cada cifra conserva su contexto: resultado, liquidez, obligación o patrimonio.</p>
        </div>

        {view === "control" ? (
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard detail="Suma de cuentas operativas" label="Caja operativa" tone="accent" value={formatCurrency(treasuryTotal)} />
              <StatCard detail={`${demoObligations.filter((item) => remainingAmount(item) > 0).length} obligaciones abiertas`} label="Por pagar" tone={obligationSummary.overdue > 0 ? "danger" : "warning"} value={formatCurrency(obligationSummary.pending)} />
              <StatCard detail="Cuentas corrientes abiertas" label="Por cobrar" tone="info" value={formatCurrency(demo.receivables)} />
              <StatCard detail="8.460 unidades" label="Stock valorizado" value={formatCurrency(demo.stock)} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader><CardTitle>Prioridades de hoy</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {obligationSummary.overdue > 0 ? <Link className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" href={`/administration?view=obligations&month=${month}`}><span><strong className="block text-red-900">Obligaciones vencidas</strong><small className="text-red-700">Requieren programación o pago.</small></span><strong className="text-red-900">{formatCurrency(obligationSummary.overdue)}</strong></Link> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"><strong>No hay obligaciones vencidas.</strong></div>}
                  {obligationSummary.upcoming > 0 ? <Link className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" href={`/administration?view=obligations&month=${month}`}><span><strong className="block text-amber-950">Pagos dentro de 7 días</strong><small className="text-amber-800">Validar fecha y cuenta de salida.</small></span><strong>{formatCurrency(obligationSummary.upcoming)}</strong></Link> : null}
                  {treasuryDifference !== 0 ? <Link className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3" href={`/administration?view=treasury&month=${month}`}><span><strong className="block text-sky-950">Diferencia de conciliación</strong><small className="text-sky-800">El saldo informado no coincide con el operativo.</small></span><strong>{formatCurrency(treasuryDifference)}</strong></Link> : null}
                  {demoCosts.filter((cost) => cost.durationMonths === null && !costAppliesToMonth(cost, month)).length > 0 ? <Link className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" href={`/administration?view=results&month=${month}`}><span><strong className="block">Costos fijos sin confirmar</strong><small className="text-[#64748b]">Definir si permanecen este mes.</small></span><StatusBadge tone="warning">Revisar</StatusBadge></Link> : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Liquidez próxima</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {treasuryForecast.map((item) => <div className="rounded-xl border border-[#e2e8f0] p-4" key={item.days}><div className="flex justify-between"><strong>{item.days} días</strong><strong className={item.projectedBalance >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(item.projectedBalance)}</strong></div><div className="mt-2 flex justify-between text-xs text-[#64748b]"><span>Entra {formatCurrency(item.inflow)}</span><span>Sale {formatCurrency(item.outflow)}</span></div></div>)}
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Preparación del cierre mensual</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {[
                    [treasuryDifference === 0, "Cuentas conciliadas", "Comparar saldos operativos con banco y caja"],
                    [obligationSummary.overdue === 0, "Obligaciones al día", "Resolver vencimientos anteriores al cierre"],
                    [demoCosts.every((cost) => cost.durationMonths !== null || typeof cost.monthOverrides[month] === "boolean"), "Costos revisados", "Confirmar o suspender los costos indefinidos"],
                    [true, "Ventas y stock integrados", "En producción vendrán de pedidos, facturación y depósitos"],
                  ].map(([complete, title, detail]) => <div className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] p-3" key={String(title)}><span className={cn("grid h-8 w-8 place-items-center rounded-full text-sm font-black", complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}>{complete ? "✓" : "!"}</span><span><strong className="block text-sm">{title}</strong><small className="text-[#64748b]">{detail}</small></span></div>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Acoplamiento al sistema actual</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Ventas y facturación", "Pedidos entregados + comprobantes fiscales vigentes", "Automático"],
                    ["Cuentas por cobrar", "Cuentas corrientes actuales e historia de cobros", "Automático"],
                    ["Stock valorizado", "Inventario existente × costo vigente", "Automático"],
                    ["Costos y obligaciones", "Nueva carga administrativa + recurrencias", "Mixto"],
                  ].map(([title, detail, mode]) => <div className="rounded-xl border border-[#e2e8f0] p-3" key={title}><div className="flex justify-between gap-2"><strong className="text-sm">{title}</strong><StatusBadge tone={mode === "Automático" ? "success" : "warning"}>{mode}</StatusBadge></div><small className="mt-2 block text-[#64748b]">{detail}</small></div>)}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {view === "results" ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-extrabold">Resultado gerencial</h3><p className="mt-1 text-sm text-[#64748b]">Ventas y costo de mercadería serán automáticos; los costos operativos se administran aquí.</p></div>
              <Button onClick={() => { setEditingCostId(null); setShowCostEditor((current) => !current); }} type="button"><AppIcon className="h-4 w-4" name="receipt" /> Nuevo costo</Button>
            </div>
            {resultsNotice ? <div aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{resultsNotice}</div> : null}

            {showCostEditor ? (
              <Card className="border-[#bfdbfe]">
                <CardHeader><CardTitle>{editingCost ? `Editar · ${editingCost.name}` : "Nuevo costo operativo"}</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" key={editingCost?.id || "new-cost"} onSubmit={handleSaveCost}>
                    <Field htmlFor="cost-name" label="Concepto"><Input defaultValue={editingCost?.name} id="cost-name" name="costName" placeholder="Ej. Alquiler" required /></Field>
                    <Field htmlFor="cost-category" label="Etiqueta"><Select defaultValue={editingCost?.category || "Fijo"} id="cost-category" name="costCategory"><option>Fijo</option><option>Variable</option><option>Único</option></Select></Field>
                    <Field htmlFor="cost-amount" label="Importe mensual"><Input defaultValue={editingCost?.amount} id="cost-amount" min="0.01" name="costAmount" required step="0.01" type="number" /></Field>
                    <Field htmlFor="cost-start" label="Desde el mes"><Input defaultValue={editingCost?.startMonth || month} id="cost-start" name="costStartMonth" required type="month" /></Field>
                    <Field htmlFor="cost-duration" label="Duración"><Select defaultValue={editingCost?.durationMonths === null ? "indefinite" : String(editingCost?.durationMonths || 1)} id="cost-duration" name="costDuration"><option value="1">Solo 1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="indefinite">Indefinido, confirmar cada mes</option></Select></Field>
                    {!editingCost ? <Field htmlFor="cost-payable" label="Crear también obligación"><Select defaultValue="no" id="cost-payable" name="createPayable"><option value="no">No, sólo registrar el costo</option><option value="yes">Sí, agregar a pagos pendientes</option></Select></Field> : null}
                    {!editingCost ? <Field htmlFor="cost-due" label="Vencimiento si genera obligación"><Input defaultValue={today} id="cost-due" name="costDue" required type="date" /></Field> : null}
                    <div className="flex items-end gap-2"><Button type="submit">{editingCost ? "Guardar cambios" : "Agregar costo"}</Button><Button onClick={() => { setShowCostEditor(false); setEditingCostId(null); }} type="button" variant="secondary">Cancelar</Button></div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard detail="+8,4% vs. septiembre" label="Ventas netas" tone="accent" value={formatCurrency(demo.netSales)} />
              <StatCard detail={`${((grossMargin / demo.netSales) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% sobre ventas netas`} label="Margen bruto" tone="success" value={formatCurrency(grossMargin)} />
              <StatCard detail={`${currentCosts.length} costos incluidos`} label="Costos operativos" tone="warning" value={formatCurrency(operatingCosts)} />
              <StatCard detail={`${operatingResult >= 1_710_000 ? "+" : ""}${(((operatingResult - 1_710_000) / 1_710_000) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% vs. septiembre`} label="Resultado operativo" tone={operatingResult >= 0 ? "success" : "danger"} value={formatCurrency(operatingResult)} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <Card><CardHeader><CardTitle>Resultado económico</CardTitle></CardHeader><DataTable caption="Resultado económico de demostración" className="rounded-none border-0 shadow-none" tableLabel="Resultado económico"><DataTableBody>{[["Ventas brutas entregadas",demo.grossSales],["Ventas netas",demo.netSales],["Costo de mercadería vendida",-demo.cogs],["Margen bruto",grossMargin],["Costos operativos",-operatingCosts],["Resultado operativo",operatingResult]].map(([label,amount],index)=><DataTableRow className={index===3||index===5?"bg-[#f8fafc] font-bold":""} key={String(label)}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className={cn("font-mono", Number(amount) < 0 && "text-red-700")}>{formatCurrency(Number(amount))}</DataTableCell></DataTableRow>)}</DataTableBody></DataTable></Card>
              <Card><CardHeader><CardTitle>Evolución y rentabilidad acumulada</CardTitle></CardHeader><CardContent className="grid gap-3"><div className="rounded-xl bg-[#eff6ff] p-4"><span className="text-xs font-bold uppercase tracking-wide text-[#1d4ed8]">Resultado acumulado desde julio</span><strong className="mt-1 block text-2xl text-[#1e3a8a]">{formatCurrency(accumulatedResult)}</strong></div><div className="grid grid-cols-4 items-end gap-2">{[...historicalResults, { month, sales: demo.netSales, result: operatingResult }].map((item) => { const height = Math.max(12, Math.min(100, (Math.max(item.result, 0) / 2_500_000) * 100)); return <div className="text-center" key={item.month}><div className="flex h-28 items-end rounded-lg bg-[#f1f5f9] p-1"><div className={cn("w-full rounded-md", item.result >= 0 ? "bg-[#0b63d8]" : "bg-red-500")} style={{ height: `${height}%` }} /></div><strong className="mt-2 block text-xs capitalize">{displayMonth(item.month).replace(" de ", " ")}</strong><small className={item.result >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(item.result)}</small></div>; })}</div></CardContent></Card>
            </div>

            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Costos del período</CardTitle><span className="text-xs text-[#64748b]">Los indefinidos deben confirmarse al comenzar cada mes.</span></div></CardHeader>
              <DataTable caption="Costos editables de la demostración" className="rounded-none border-0 shadow-none" minWidth="980px" tableLabel="Costos operativos"><DataTableHeader><DataTableRow><DataTableHead>Concepto</DataTableHead><DataTableHead>Etiqueta</DataTableHead><DataTableHead>Vigencia</DataTableHead><DataTableHead>Estado en el mes</DataTableHead><DataTableHead align="right">Importe</DataTableHead><DataTableHead align="right">Acciones</DataTableHead></DataTableRow></DataTableHeader><DataTableBody>{demoCosts.map((cost) => { const active = costAppliesToMonth(cost, month); const duration = cost.durationMonths === null ? "Indefinido" : cost.durationMonths === 1 ? "1 mes" : `${cost.durationMonths} meses`; return <DataTableRow className={active ? "" : "bg-[#f8fafc] text-[#94a3b8]"} key={cost.id}><DataTableCell className="font-bold">{cost.name}</DataTableCell><DataTableCell><StatusBadge tone={cost.category === "Fijo" ? "accent" : cost.category === "Variable" ? "warning" : "neutral"}>{cost.category}</StatusBadge></DataTableCell><DataTableCell>Desde {displayMonth(cost.startMonth)} · {duration}</DataTableCell><DataTableCell><StatusBadge tone={active ? "success" : "neutral"}>{active ? "Incluido" : "Suspendido"}</StatusBadge></DataTableCell><DataTableCell align="right" className="font-mono font-bold">{formatCurrency(cost.amount)}</DataTableCell><DataTableCell align="right"><div className="flex justify-end gap-1"><Button onClick={() => toggleCostForMonth(cost)} size="sm" type="button" variant="secondary">{active ? "Suspender" : "Incluir"}</Button><Button onClick={() => { setEditingCostId(cost.id); setShowCostEditor(true); }} size="sm" type="button" variant="secondary">Editar</Button><Button className="text-red-700" onClick={() => removeCost(cost)} size="sm" type="button" variant="secondary">Eliminar</Button></div></DataTableCell></DataTableRow>; })}</DataTableBody></DataTable>
            </Card>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Cierre mensual controlado</CardTitle><StatusBadge tone={currentClosure || closeReady ? "success" : "warning"}>{currentClosure ? `Cerrado · v${currentClosure.version}` : closeReady ? "Listo para cerrar" : "Bloqueado"}</StatusBadge></div></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-3">
                  {closeChecks.map((check) => <div className={cn("rounded-xl border p-4", check.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")} key={check.label}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{check.label}</strong><StatusBadge tone={check.ready ? "success" : "warning"}>{check.ready ? "OK" : "Revisar"}</StatusBadge></div><small className="mt-2 block text-[#64748b]">{check.detail}</small></div>)}
                </div>
                {currentClosure ? <form className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" onSubmit={handleReopenMonth}><div><strong>Fotografía gerencial preservada</strong><small className="mt-1 block text-emerald-800">Resultado {formatCurrency(currentClosure.result)} · Caja {formatCurrency(currentClosure.treasury)} · Patrimonio {formatCurrency(currentClosure.equity)}</small></div><div className="flex flex-wrap items-end gap-2"><Field htmlFor="demo-reopen-reason" label="Motivo de reapertura"><Input id="demo-reopen-reason" minLength={5} name="reopenReason" required /></Field><Button type="submit" variant="secondary">Reabrir período</Button></div></form> : closeReady ? <form className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4" onSubmit={handleCloseMonth}><div><strong>Cerrar {displayMonth(month)}</strong><small className="mt-1 block text-sky-800">Guarda resultado, caja y patrimonio. Los datos posteriores no alterarán esta versión.</small></div><div className="flex flex-wrap items-end gap-2"><Field htmlFor="demo-close-notes" label="Nota opcional"><Input id="demo-close-notes" name="closeNotes" /></Field><Button type="submit">Crear cierre</Button></div></form> : <p className="text-xs text-[#64748b]">Resolvé los puntos marcados antes de crear un cierre. El sistema no fuerza ajustes automáticos.</p>}
                {(closures[month] ?? []).filter((closure) => closure.status === "reopened").length > 0 ? <p className="text-xs text-[#64748b]">Historial preservado: {(closures[month] ?? []).filter((closure) => closure.status === "reopened").length} versión/es reabierta/s.</p> : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {view === "treasury" ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-[#172033]">Posición de caja</h3>
                <p className="mt-1 text-sm text-[#64748b]">Los pagos de Obligaciones impactan aquí y conservan su cuenta de origen.</p>
              </div>
              <Button onClick={() => setShowTreasuryMovement((current) => !current)} type="button"><AppIcon className="h-4 w-4" name="wallet" /> Registrar movimiento</Button>
            </div>

            {treasuryNotice ? <div aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{treasuryNotice}</div> : null}

            {showTreasuryMovement ? (
              <Card>
                <CardHeader><CardTitle>Nuevo movimiento de tesorería</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleTreasuryMovement}>
                    <Field htmlFor="movement-type" label="Tipo"><Select defaultValue="Ingreso" id="movement-type" name="movementType"><option>Ingreso</option><option>Egreso</option></Select></Field>
                    <Field htmlFor="movement-account" label="Cuenta"><Select defaultValue="Santander" id="movement-account" name="movementAccount">{treasuryAccounts.map((account) => <option key={account.name}>{account.name}</option>)}</Select></Field>
                    <Field htmlFor="movement-date" label="Fecha"><Input defaultValue={today} id="movement-date" name="movementDate" required type="date" /></Field>
                    <Field htmlFor="movement-concept" label="Concepto"><Input id="movement-concept" name="movementConcept" placeholder="Origen o destino del movimiento" required /></Field>
                    <Field htmlFor="movement-amount" label="Importe"><Input id="movement-amount" min="0.01" name="movementAmount" required step="0.01" type="number" /></Field>
                    <div className="flex items-end gap-2"><Button type="submit">Registrar</Button><Button onClick={() => setShowTreasuryMovement(false)} type="button" variant="secondary">Cancelar</Button></div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {reconcileAccountName ? (
              <Card className="border-[#bfdbfe]">
                <CardHeader><CardTitle>Conciliar · {reconcileAccountName}</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-[minmax(0,320px)_auto]" onSubmit={handleReconciliation}>
                    <Field htmlFor="statement-balance" label="Saldo informado por banco / caja"><Input defaultValue={treasuryAccounts.find((account) => account.name === reconcileAccountName)?.statementBalance} id="statement-balance" name="statementBalance" required step="0.01" type="number" /></Field>
                    <div className="flex items-end gap-2"><Button type="submit">Actualizar conciliación</Button><Button onClick={() => setReconcileAccountName(null)} type="button" variant="secondary">Cancelar</Button></div>
                  </form>
                  <p className="mt-3 text-xs text-[#64748b]">La diferencia se muestra para revisión. La simulación nunca crea un ajuste contable automático.</p>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard detail="Suma de todas las cuentas" label="Total operativo" tone="accent" value={formatCurrency(treasuryTotal)} />
              <StatCard detail="Disponible físico" label="Efectivo" tone="success" value={formatCurrency(treasuryAccounts.find((account) => account.name === "Efectivo")?.balance || 0)} />
              <StatCard detail="Saldo operativo" label="Bancos" tone="info" value={formatCurrency(treasuryAccounts.filter((account) => account.kind === "Banco").reduce((total, account) => total + account.balance, 0))} />
              <StatCard detail={treasuryDifference === 0 ? "Todo conciliado" : "Requiere revisión"} label="Diferencia a conciliar" tone={treasuryDifference === 0 ? "success" : "danger"} value={formatCurrency(treasuryDifference)} />
            </div>

            <Card>
              <CardHeader><CardTitle>Cuentas y conciliación</CardTitle></CardHeader>
              <DataTable caption="Saldos operativos e informados de demostración" className="rounded-none border-0 shadow-none" minWidth="820px" tableLabel="Cuentas de tesorería">
                <DataTableHeader><DataTableRow><DataTableHead>Cuenta</DataTableHead><DataTableHead>Tipo</DataTableHead><DataTableHead align="right">Saldo operativo</DataTableHead><DataTableHead align="right">Saldo informado</DataTableHead><DataTableHead align="right">Diferencia</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Acción</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>{treasuryAccounts.map((account) => {
                  const difference = account.statementBalance - account.balance;
                  return <DataTableRow key={account.name}><DataTableCell className="font-bold">{account.name}</DataTableCell><DataTableCell>{account.kind}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(account.balance)}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(account.statementBalance)}</DataTableCell><DataTableCell align="right" className={cn("font-mono font-bold", difference === 0 ? "text-emerald-700" : "text-red-700")}>{formatCurrency(difference)}</DataTableCell><DataTableCell><StatusBadge tone={difference === 0 ? "success" : "warning"}>{difference === 0 ? "Conciliada" : "A revisar"}</StatusBadge>{account.reconciledAt ? <small className="mt-1 block text-[#64748b]">Actualizada {displayDate(account.reconciledAt)}</small> : null}</DataTableCell><DataTableCell align="right"><Button onClick={() => { setReconcileAccountName(account.name); setShowTreasuryMovement(false); }} size="sm" type="button" variant="secondary">Conciliar</Button></DataTableCell></DataTableRow>;
                })}</DataTableBody>
              </DataTable>
            </Card>

            <Card><CardHeader><CardTitle>Proyección de liquidez</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{treasuryForecast.map((item) => <div className="rounded-xl border border-[#e2e8f0] p-4" key={item.days}><div className="flex items-center justify-between gap-2"><strong>{item.days} días</strong><StatusBadge tone={item.projectedBalance >= 0 ? "success" : "danger"}>{item.projectedBalance >= 0 ? "Cubierto" : "Faltante"}</StatusBadge></div><div className={cn("mt-2 text-xl font-extrabold", item.projectedBalance >= 0 ? "text-emerald-700" : "text-red-700")}>{formatCurrency(item.projectedBalance)}</div><small className="text-[#64748b]">Caja actual + {formatCurrency(item.inflow)} por cobrar − {formatCurrency(item.outflow)} por pagar</small></div>)}</CardContent></Card>

            <Card>
              <CardHeader><CardTitle>Últimos movimientos</CardTitle></CardHeader>
              <DataTable caption="Movimientos ficticios de la sesión local" className="rounded-none border-0 shadow-none" minWidth="760px" tableLabel="Movimientos de tesorería"><DataTableHeader><DataTableRow><DataTableHead>Fecha</DataTableHead><DataTableHead>Cuenta</DataTableHead><DataTableHead>Concepto</DataTableHead><DataTableHead>Tipo</DataTableHead><DataTableHead align="right">Importe</DataTableHead></DataTableRow></DataTableHeader><DataTableBody>{treasuryMovements.map((movement) => <DataTableRow key={movement.id}><DataTableCell>{displayDate(movement.date)}</DataTableCell><DataTableCell className="font-medium">{movement.account}</DataTableCell><DataTableCell>{movement.concept}</DataTableCell><DataTableCell><StatusBadge tone={movement.type === "Ingreso" ? "success" : "warning"}>{movement.type}</StatusBadge></DataTableCell><DataTableCell align="right" className={cn("font-mono font-bold", movement.type === "Ingreso" ? "text-emerald-700" : "text-red-700")}>{movement.type === "Ingreso" ? "+" : "−"}{formatCurrency(movement.amount)}</DataTableCell></DataTableRow>)}</DataTableBody></DataTable>
            </Card>
          </div>
        ) : null}

        {view === "obligations" ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-[#172033]">Agenda unificada de pagos</h3>
                <p className="mt-1 text-sm text-[#64748b]">Cargá la obligación una vez y administrá su programación y sus pagos desde el mismo lugar.</p>
              </div>
              <Button onClick={() => { setShowNewObligation((current) => !current); setSelectedObligationId(null); }} type="button">
                <AppIcon className="h-4 w-4" name="receipt" /> Nueva obligación
              </Button>
            </div>

            {obligationNotice ? <div aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{obligationNotice}</div> : null}

            {showNewObligation ? (
              <Card>
                <CardHeader><CardTitle>Nueva obligación</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateObligation}>
                    <Field htmlFor="new-obligation-type" label="Tipo">
                      <Select defaultValue="Proveedor" id="new-obligation-type" name="type">
                        <option>Proveedor</option><option>Sueldo</option><option>Impuesto</option><option>Costo operativo</option><option>Otro</option>
                      </Select>
                    </Field>
                    <Field htmlFor="new-obligation-beneficiary" label="Beneficiario">
                      <Input id="new-obligation-beneficiary" name="beneficiary" placeholder="Razón social o persona" required />
                    </Field>
                    <Field htmlFor="new-obligation-concept" label="Concepto">
                      <Input id="new-obligation-concept" name="concept" placeholder="Factura, liquidación o detalle" required />
                    </Field>
                    <Field htmlFor="new-obligation-due" label="Vencimiento">
                      <Input id="new-obligation-due" name="due" required type="date" />
                    </Field>
                    <Field htmlFor="new-obligation-amount" label="Importe total">
                      <Input id="new-obligation-amount" min="0.01" name="amount" placeholder="0,00" required step="0.01" type="number" />
                    </Field>
                    <div className="flex items-end gap-2">
                      <Button type="submit">Agregar a agenda</Button>
                      <Button onClick={() => setShowNewObligation(false)} type="button" variant="secondary">Cancelar</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {selectedObligation ? (
              <Card className="border-[#bfdbfe]">
                <CardHeader><CardTitle>Gestionar · {selectedObligation.beneficiary}</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleManageObligation}>
                    <Field htmlFor="payment-mode" label="Acción">
                      <Select defaultValue="pay" id="payment-mode" name="paymentMode"><option value="pay">Registrar pago</option><option value="schedule">Programar pago</option></Select>
                    </Field>
                    <Field htmlFor="payment-amount" label={`Importe · saldo ${formatCurrency(remainingAmount(selectedObligation))}`}>
                      <Input defaultValue={remainingAmount(selectedObligation)} id="payment-amount" max={remainingAmount(selectedObligation)} min="0.01" name="paymentAmount" required step="0.01" type="number" />
                    </Field>
                    <Field htmlFor="payment-date" label="Fecha">
                      <Input defaultValue={today} id="payment-date" name="actionDate" required type="date" />
                    </Field>
                    <Field htmlFor="payment-account" label="Cuenta / medio">
                      <Select defaultValue="Santander" id="payment-account" name="account"><option>Santander</option><option>Efectivo</option><option>Mercado Pago</option><option>Otra cuenta</option></Select>
                    </Field>
                    <div className="flex items-end gap-2"><Button type="submit">Confirmar</Button><Button onClick={() => setSelectedObligationId(null)} type="button" variant="secondary">Cancelar</Button></div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard detail={`${demoObligations.filter((item) => remainingAmount(item) > 0).length} obligaciones abiertas`} label="Total pendiente" tone="warning" value={formatCurrency(obligationSummary.pending)} />
              <StatCard detail="Requiere decisión" label="Vencido" tone="danger" value={formatCurrency(obligationSummary.overdue)} />
              <StatCard detail="Vencen dentro de 7 días" label="Próximos 7 días" tone="info" value={formatCurrency(obligationSummary.upcoming)} />
              <StatCard detail="Incluido en la proyección" label="Pagos programados" tone="success" value={formatCurrency(obligationSummary.scheduled)} />
            </div>

            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Obligaciones registradas</CardTitle>
                  <div aria-label="Filtrar obligaciones" className="flex flex-wrap gap-2" role="group">
                    {([
                      ["open", "Abiertas"], ["overdue", "Vencidas"], ["upcoming", "Próximas"], ["paid", "Pagadas"], ["all", "Todas"],
                    ] as Array<[ObligationFilter, string]>).map(([key, label]) => (
                      <button className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", obligationFilter === key ? "border-[#0b63d8] bg-[#eff6ff] text-[#0b63d8]" : "border-[#dbe3ec] bg-white text-[#475569]")} key={key} onClick={() => setObligationFilter(key)} type="button">{label}</button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <DataTable caption="Obligaciones ficticias editables durante esta sesión local" className="rounded-none border-0 shadow-none" minWidth="1120px" tableLabel="Agenda de obligaciones">
                <DataTableHeader><DataTableRow><DataTableHead>Vencimiento</DataTableHead><DataTableHead>Tipo</DataTableHead><DataTableHead>Beneficiario / concepto</DataTableHead><DataTableHead align="right">Total</DataTableHead><DataTableHead align="right">Pagado</DataTableHead><DataTableHead align="right">Saldo</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Acción</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {filteredObligations.map((item) => {
                    const status = statusForObligation(item, today);
                    const remaining = remainingAmount(item);
                    return <DataTableRow key={item.id}>
                      <DataTableCell>{displayDate(item.due)}</DataTableCell>
                      <DataTableCell>{item.type}</DataTableCell>
                      <DataTableCell><strong className="block">{item.beneficiary}</strong><span className="text-xs text-[#64748b]">{item.concept}</span></DataTableCell>
                      <DataTableCell align="right" className="font-mono">{formatCurrency(item.originalAmount)}</DataTableCell>
                      <DataTableCell align="right" className="font-mono text-emerald-700">{formatCurrency(item.paidAmount)}</DataTableCell>
                      <DataTableCell align="right" className="font-mono font-bold">{formatCurrency(remaining)}</DataTableCell>
                      <DataTableCell><StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>{item.scheduledDate && remaining > 0 ? <small className="mt-1 block text-[#64748b]">Programado {displayDate(item.scheduledDate)} · {item.account}</small> : null}</DataTableCell>
                      <DataTableCell align="right">{remaining > 0 ? <Button onClick={() => { setSelectedObligationId(item.id); setShowNewObligation(false); }} size="sm" type="button" variant="secondary">Gestionar</Button> : <span className="text-xs font-bold text-emerald-700">Completada</span>}</DataTableCell>
                    </DataTableRow>;
                  })}
                  {filteredObligations.length === 0 ? <DataTableRow><DataTableCell className="py-8 text-center text-[#64748b]" colSpan={8}>No hay obligaciones para este filtro.</DataTableCell></DataTableRow> : null}
                </DataTableBody>
              </DataTable>
            </Card>
          </div>
        ) : null}

        {view === "equity" ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Estimación patrimonial operativa.</strong> No representa una valuación comercial ni un balance contable certificado.</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><StatCard detail="Caja + créditos + stock" label="Activos observables" tone="accent" value={formatCurrency(assets)} /><StatCard detail={`${demoObligations.filter((item) => remainingAmount(item) > 0).length} obligaciones abiertas`} label="Pasivos observables" tone="warning" value={formatCurrency(obligationSummary.pending)} /><StatCard detail="Activos menos obligaciones" label="Patrimonio neto estimado" tone={equity >= 0 ? "success" : "danger"} value={formatCurrency(equity)} /><StatCard detail="Caja + créditos frente a pasivos" label="Cobertura líquida" tone={treasuryTotal + demo.receivables >= obligationSummary.pending ? "success" : "danger"} value={`${obligationSummary.pending > 0 ? ((treasuryTotal + demo.receivables) / obligationSummary.pending).toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}×`} /></div>
            <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
              <Card><CardHeader><CardTitle>Composición patrimonial</CardTitle></CardHeader><DataTable caption="Composición patrimonial ficticia" className="rounded-none border-0 shadow-none" tableLabel="Composición patrimonial"><DataTableBody>{[["Caja operativa",treasuryTotal],["Cuentas por cobrar",demo.receivables],["Stock valorizado",demo.stock],["Total activos",assets],["Obligaciones pendientes",-obligationSummary.pending],["Patrimonio neto estimado",equity]].map(([label,amount],index)=><DataTableRow className={index===3||index===5?"bg-[#f8fafc] font-bold":""} key={String(label)}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className={cn("font-mono", Number(amount) < 0 && "text-red-700")}>{formatCurrency(Number(amount))}</DataTableCell></DataTableRow>)}</DataTableBody></DataTable></Card>
              <Card><CardHeader><CardTitle>Concentración del activo</CardTitle></CardHeader><CardContent className="grid gap-4">{([[
                "Caja", treasuryTotal, "bg-sky-500",
              ], ["Cuentas por cobrar", demo.receivables, "bg-amber-500"], ["Stock", demo.stock, "bg-emerald-500"]] as Array<[string, number, string]>).map(([label,value,color]) => { const share = assets > 0 ? (value / assets) * 100 : 0; return <div key={label}><div className="mb-1 flex justify-between text-sm"><strong>{label}</strong><span>{share.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% · {formatCurrency(value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]"><div className={cn("h-full rounded-full", color)} style={{ width: `${share}%` }} /></div></div>; })}<p className="rounded-xl bg-[#f8fafc] p-3 text-xs text-[#64748b]">La mercadería se valúa al costo vigente. Marca, cartera de clientes y valor comercial de la empresa no se incluyen.</p></CardContent></Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card><CardHeader><CardTitle>Composición de pasivos</CardTitle></CardHeader><DataTable caption="Pasivos por clase" className="rounded-none border-0 shadow-none" tableLabel="Pasivos por clase"><DataTableHeader><DataTableRow><DataTableHead>Clase</DataTableHead><DataTableHead align="right">Pendiente</DataTableHead><DataTableHead align="right">Participación</DataTableHead></DataTableRow></DataTableHeader><DataTableBody>{Array.from(new Set(demoObligations.map((item) => item.type))).map((type) => { const amount = demoObligations.filter((item) => item.type === type).reduce((total, item) => total + remainingAmount(item), 0); return <DataTableRow key={type}><DataTableCell className="font-medium">{type}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(amount)}</DataTableCell><DataTableCell align="right">{obligationSummary.pending > 0 ? `${((amount / obligationSummary.pending) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"}</DataTableCell></DataTableRow>; })}</DataTableBody></DataTable></Card>
              <Card><CardHeader><CardTitle>Evolución estimada</CardTitle></CardHeader><DataTable caption="Evolución patrimonial ficticia" className="rounded-none border-0 shadow-none" tableLabel="Evolución patrimonial"><DataTableHeader><DataTableRow><DataTableHead>Mes</DataTableHead><DataTableHead align="right">Patrimonio</DataTableHead><DataTableHead align="right">Variación</DataTableHead></DataTableRow></DataTableHeader><DataTableBody>{[{ month: "2026-07", value: 31_240_000 }, { month: "2026-08", value: 32_660_000 }, { month: "2026-09", value: 34_370_000 }, { month, value: equity }].map((item, index, rows) => { const previous = rows[index - 1]?.value; const variation = previous ? ((item.value - previous) / previous) * 100 : null; return <DataTableRow className={index === rows.length - 1 ? "bg-[#f8fafc] font-bold" : ""} key={`${item.month}-${index}`}><DataTableCell className="capitalize">{displayMonth(item.month)}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(item.value)}</DataTableCell><DataTableCell align="right" className={variation === null ? "" : variation >= 0 ? "text-emerald-700" : "text-red-700"}>{variation === null ? "Base" : `${variation >= 0 ? "+" : ""}${variation.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}</DataTableCell></DataTableRow>; })}</DataTableBody></DataTable></Card>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
