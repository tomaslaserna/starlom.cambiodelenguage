"use client";

import { useEffect, useMemo, useState } from "react";
import {
  initialPrototypeState,
  obligationBalance,
  prototypeToday,
  purchaseTotal,
  type PrototypeState,
  type Purchase,
  type Supplier,
} from "./model";

const STORAGE_KEY = "starlim-system-v2-prototype";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function usePrototypeStore() {
  const [state, setState] = useState<PrototypeState>(initialPrototypeState);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setState(JSON.parse(saved) as PrototypeState);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const metrics = useMemo(() => {
    const cash = state.accounts.reduce((total, account) => total + account.balance, 0);
    const receivables = state.customers.reduce((total, customer) => total + Math.max(0, customer.balance), 0);
    const customerCredits = state.customers.reduce((total, customer) => total + Math.max(0, -customer.balance), 0);
    const payables = state.obligations.reduce((total, obligation) => total + obligationBalance(obligation), 0);
    const stockValue = state.products.reduce((total, product) => total + product.stock * product.cost, 0);
    const monthlySales = state.orders.filter((order) => order.status === "Entregado").reduce((total, order) => total + order.total, 0);
    const stockAlerts = state.products.filter((product) => product.stock - product.reserved <= product.reorderPoint).length;
    const pendingFiscal = state.fiscalDocuments.filter((document) => ["Pendiente", "Error"].includes(document.status)).length;
    const openTasks = state.tasks.filter((task) => !task.done).length;
    return { cash, receivables, customerCredits, payables, stockValue, monthlySales, stockAlerts, pendingFiscal, openTasks, equity: cash + receivables + stockValue - payables };
  }, [state]);

  function reset() {
    setState(initialPrototypeState);
    window.localStorage.removeItem(STORAGE_KEY);
    setNotice("Se restauró la demostración inicial del Sistema V2.");
  }

  function toggleTask(id: string) {
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }));
  }

  function clockEmployee(id: string) {
    setState((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === id ? { ...employee, clockedInAt: employee.clockedInAt ? undefined : new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) } : employee) }));
    setNotice("La asistencia quedó actualizada en la demostración.");
  }

  function advanceOrder(id: string) {
    const sequence = ["Cargado", "Confirmado", "Preparación", "Reparto", "Entregado"] as const;
    setState((current) => {
      const order = current.orders.find((item) => item.id === id);
      if (!order || order.status === "Entregado") return current;
      const status = sequence[Math.min(sequence.indexOf(order.status) + 1, sequence.length - 1)];
      const delivered = status === "Entregado";
      const customer = current.customers.find((item) => item.id === order.customerId);
      const existingFiscal = current.fiscalDocuments.some((document) => document.orderNumber === order.number);
      const fiscalDocuments = delivered && order.receiptType !== "Remito"
        ? existingFiscal
          ? current.fiscalDocuments.map((document) => document.orderNumber === order.number ? { ...document, date: prototypeToday, total: order.total, status: "Pendiente" as const, detail: "Lista para autorización fiscal" } : document)
          : [{ id: newId("fiscal"), date: prototypeToday, customer: customer?.commercialName || "Cliente", type: order.receiptType, number: "Automática al entregar", total: order.total, status: "Pendiente" as const, orderNumber: order.number, detail: "Lista para autorización fiscal" }, ...current.fiscalDocuments]
        : current.fiscalDocuments;
      return {
        ...current,
        orders: current.orders.map((item) => item.id === id ? { ...item, status } : item),
        customers: delivered ? current.customers.map((item) => item.id === order.customerId ? { ...item, balance: item.balance + order.total } : item) : current.customers,
        products: delivered ? current.products.map((product) => {
          const line = order.items.find((item) => item.productId === product.id);
          return line ? { ...product, stock: Math.max(0, product.stock - line.quantity), reserved: Math.max(0, product.reserved - line.quantity) } : product;
        }) : current.products,
        fiscalDocuments,
      };
    });
    setNotice("El pedido avanzó y sus impactos relacionados fueron recalculados.");
  }

  function addCustomer(input: { commercialName: string; legalName: string; cuit: string; branch: string; segment: string; seller: string; priceList: string; receiptType: "Factura A" | "Factura B" | "Remito"; status: "Activo" | "Prospecto" }) {
    setState((current) => ({ ...current, customers: [{ id: newId("customer"), ...input, balance: 0, nextContact: prototypeToday }, ...current.customers] }));
    setNotice(`${input.commercialName} fue agregado al registro maestro de clientes.`);
  }

  function registerCollection(customerId: string, accountId: string, amount: number) {
    const customer = state.customers.find((item) => item.id === customerId);
    const account = state.accounts.find((item) => item.id === accountId);
    if (!customer || !account || amount <= 0) return "Datos inválidos para registrar el cobro.";
    setState((current) => ({
      ...current,
      customers: current.customers.map((item) => item.id === customerId ? { ...item, balance: item.balance - amount } : item),
      accounts: current.accounts.map((item) => item.id === accountId ? { ...item, balance: item.balance + amount } : item),
      movements: [{ id: newId("movement"), date: prototypeToday, accountId, direction: "Ingreso", concept: `Cobro · ${customer.commercialName}`, amount, referenceType: "customer", referenceId: customerId }, ...current.movements],
    }));
    setNotice(amount > Math.max(0, customer.balance) ? "Cobro registrado. El excedente quedó como saldo a favor del cliente." : "Cobro registrado en cuenta corriente y Tesorería.");
    return "";
  }

  function addSupplier(input: Omit<Supplier, "id" | "score" | "active">) {
    setState((current) => ({ ...current, suppliers: [{ ...input, id: newId("supplier"), score: 100, active: true }, ...current.suppliers] }));
    setNotice("Proveedor agregado a la base maestra.");
  }

  function createPurchase(input: { supplierId: string; productId: string; quantity: number; unitCost: number; expectedAt: string }) {
    const product = state.products.find((item) => item.id === input.productId);
    if (!product?.supplierIds.includes(input.supplierId)) return "El producto no está asociado al proveedor seleccionado.";
    if (input.quantity <= 0 || input.unitCost <= 0) return "Cantidad y costo deben ser mayores que cero.";
    const nextNumber = `OC-${String(105 + state.purchases.length).padStart(4, "0")}`;
    const purchase: Purchase = { id: newId("purchase"), number: nextNumber, supplierId: input.supplierId, createdAt: prototypeToday, expectedAt: input.expectedAt, status: "Ordenada", items: [{ productId: input.productId, quantity: input.quantity, unitCost: input.unitCost }] };
    setState((current) => ({ ...current, purchases: [purchase, ...current.purchases] }));
    setNotice(`${nextNumber} creada. Todavía no modificó stock ni generó deuda.`);
    return "";
  }

  function receivePurchase(id: string, invoiceNumber: string) {
    setState((current) => {
      const purchase = current.purchases.find((item) => item.id === id);
      if (!purchase || ["Recibida", "Recibida sin factura", "Cancelada"].includes(purchase.status)) return current;
      const supplier = current.suppliers.find((item) => item.id === purchase.supplierId);
      const normalizedInvoice = invoiceNumber.trim();
      const obligation = normalizedInvoice ? [{ id: newId("obligation"), source: "Compra" as const, beneficiary: supplier?.legalName || supplier?.name || "Proveedor", concept: `${purchase.number} · ${normalizedInvoice}`, dueDate: addDays(prototypeToday, supplier?.paymentDays || 0), total: purchaseTotal(purchase), paid: 0 }] : [];
      return {
        ...current,
        purchases: current.purchases.map((item) => item.id === id ? { ...item, status: normalizedInvoice ? "Recibida" : "Recibida sin factura", receivedAt: prototypeToday, invoiceNumber: normalizedInvoice || undefined } : item),
        products: current.products.map((product) => {
          const line = purchase.items.find((item) => item.productId === product.id);
          return line ? { ...product, stock: product.stock + line.quantity, cost: line.unitCost } : product;
        }),
        obligations: [...obligation, ...current.obligations],
      };
    });
    setNotice(invoiceNumber.trim() ? "Compra recibida: se actualizó stock, costo y obligación de pago." : "Mercadería recibida. El stock ingresó y la factura quedó pendiente, sin generar deuda definitiva.");
  }

  function attachPurchaseInvoice(id: string, invoiceNumber: string) {
    if (!invoiceNumber.trim()) return "Ingresá el número de factura.";
    const purchase = state.purchases.find((item) => item.id === id);
    if (!purchase || purchase.status !== "Recibida sin factura") return "La compra no espera una factura.";
    const supplier = state.suppliers.find((item) => item.id === purchase.supplierId);
    setState((current) => ({ ...current, purchases: current.purchases.map((item) => item.id === id ? { ...item, status: "Recibida", invoiceNumber: invoiceNumber.trim() } : item), obligations: [{ id: newId("obligation"), source: "Compra", beneficiary: supplier?.legalName || supplier?.name || "Proveedor", concept: `${purchase.number} · ${invoiceNumber.trim()}`, dueDate: addDays(purchase.receivedAt || prototypeToday, supplier?.paymentDays || 0), total: purchaseTotal(purchase), paid: 0 }, ...current.obligations] }));
    setNotice("Factura vinculada y obligación de pago generada.");
    return "";
  }

  function generatePayroll() {
    setState((current) => {
      const existing = new Set(current.obligations.filter((item) => item.source === "Sueldo" && item.concept.includes("octubre 2026")).map((item) => item.beneficiary));
      const obligations = current.employees.filter((employee) => employee.active && employee.monthlySalary > 0 && !existing.has(employee.name)).map((employee) => {
        const sales = current.orders.filter((order) => order.seller === employee.name).reduce((total, order) => total + order.total, 0);
        const total = employee.monthlySalary + sales * employee.commissionRate / 100;
        return { id: newId("obligation"), source: "Sueldo" as const, beneficiary: employee.name, concept: "Sueldo y comisión · octubre 2026", dueDate: "2026-10-15", total, paid: 0 };
      });
      return { ...current, obligations: [...obligations, ...current.obligations] };
    });
    setNotice("Liquidación generada: cada remuneración quedó como obligación individual en Administración.");
  }

  function payObligation(id: string, accountId: string, amount: number) {
    const obligation = state.obligations.find((item) => item.id === id);
    const account = state.accounts.find((item) => item.id === accountId);
    if (!obligation || !account || amount <= 0 || amount > obligationBalance(obligation)) return "Importe inválido para la obligación.";
    if (amount > account.balance) return `La cuenta ${account.name} no tiene fondos suficientes.`;
    setState((current) => ({
      ...current,
      obligations: current.obligations.map((item) => item.id === id ? { ...item, paid: item.paid + amount, account: account.name } : item),
      accounts: current.accounts.map((item) => item.id === accountId ? { ...item, balance: item.balance - amount } : item),
      movements: [{ id: newId("movement"), date: prototypeToday, accountId, direction: "Egreso", concept: `Pago · ${obligation.beneficiary} · ${obligation.concept}`, amount, referenceType: "obligation", referenceId: id }, ...current.movements],
    }));
    setNotice("Pago registrado con imputación explícita y movimiento de tesorería.");
    return "";
  }

  function adjustStock(productId: string, quantity: number, note: string) {
    if (!quantity) return;
    setState((current) => ({ ...current, products: current.products.map((product) => product.id === productId ? { ...product, stock: Math.max(0, product.stock + quantity) } : product), tasks: [{ id: newId("task"), title: `Auditar ajuste: ${note}`, area: "Operaciones", priority: "Media", dueDate: prototypeToday, done: false }, ...current.tasks] }));
    setNotice("Ajuste registrado. Se creó una tarea de auditoría operativa.");
  }

  function updateStatementBalance(accountId: string, statementBalance: number) {
    setState((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === accountId ? { ...account, statementBalance } : account) }));
    setNotice("Saldo informado actualizado; la diferencia permanece visible hasta resolverla.");
  }

  function resolveFiscalDocument(id: string) {
    setState((current) => ({ ...current, fiscalDocuments: current.fiscalDocuments.map((document) => document.id === id ? { ...document, status: "Emitido", detail: "Resuelto desde Control" } : document) }));
    setNotice("Excepción fiscal resuelta en la demostración.");
  }

  return { state, metrics, notice, setNotice, reset, toggleTask, clockEmployee, advanceOrder, addCustomer, registerCollection, addSupplier, createPurchase, receivePurchase, attachPurchaseInvoice, generatePayroll, payObligation, adjustStock, updateStatementBalance, resolveFiscalDocument };
}
