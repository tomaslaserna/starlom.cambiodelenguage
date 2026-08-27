import "server-only";

import { tool } from "ai";
import { z } from "zod";
import type { AuthSession } from "@/lib/auth";
import { isAdminRole, normalizeRole } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import {
  getSupervisorCustomerHistory,
  getSupervisorCustomerBalances,
  getSupervisorCustomerInvoices,
  getSupervisorInvoiceByNumber,
  getSupervisorOperationalSnapshot,
  getSupervisorSalesMetrics,
  searchSupervisorCustomers,
} from "@/lib/supervisor-lab/read-model";
import { summarizeCustomerProductPatterns } from "@/lib/supervisor-lab/product-pattern";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";
import { getErpGuide } from "@/lib/supervisor-lab/system-guide";

async function resolvePrioritySession(session: AuthSession, employeeName?: string) {
  const requestedName = employeeName?.trim();
  if (!requestedName || requestedName.toLocaleLowerCase("es") === session.displayName.toLocaleLowerCase("es")) {
    return { session, requestedEmployee: session.displayName };
  }
  if (!isAdminRole(session.role)) {
    return { session: null, requestedEmployee: requestedName, error: "Solo un administrador puede consultar las prioridades de otro empleado." };
  }

  const result = await queryWithCompanyContext<{
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
    role: string;
  }>(
    session.companyId,
    `SELECT p.id::text, p.full_name, p.email, p.username, ue.role::text AS role
       FROM profiles p
       JOIN usuario_empresa ue
         ON ue.id_usuario = p.id
        AND ue.empresa_id = $1
        AND ue.activo = TRUE
      WHERE p.active = TRUE
        AND (
          LOWER(COALESCE(p.full_name, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(p.username, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(p.email, '')) LIKE LOWER($2)
        )
      ORDER BY
        CASE WHEN LOWER(COALESCE(p.full_name, '')) = LOWER($3) THEN 0 ELSE 1 END,
        p.full_name ASC
      LIMIT 5`,
    [session.companyId, `%${requestedName}%`, requestedName],
    { cache: false },
  );

  if (result.rows.length !== 1) {
    return {
      session: null,
      requestedEmployee: requestedName,
      error: result.rows.length === 0 ? "No se encontro un empleado activo con ese nombre." : "Hay varios empleados posibles; indica el nombre completo.",
      matches: result.rows.map((row) => row.full_name || row.username || row.email || "Empleado"),
    };
  }

  const employee = result.rows[0];
  const displayName = employee.full_name || employee.username || employee.email || requestedName;
  return {
    requestedEmployee: displayName,
    session: {
      ...session,
      userId: employee.id,
      username: employee.username || employee.email || displayName,
      email: employee.email || session.email,
      displayName,
      role: normalizeRole(employee.role),
    },
  };
}

export function createSupervisorTools(session: AuthSession) {
  const executedCalls = new Set<string>();
  async function executeOnce<T>(key: string, execute: () => Promise<T>) {
    if (executedCalls.has(key)) {
      return { repeated: true, instruction: "Esta consulta ya fue resuelta. Usa el resultado anterior y responde al usuario." };
    }
    executedCalls.add(key);
    return execute();
  }

  return {
    searchCustomers: tool({
      description: "Busca clientes de Starlim por nombre, razon social o CUIT. Usar antes del historial si no se conoce el ID exacto.",
      inputSchema: z.object({ search: z.string().trim().min(2).max(120) }),
      execute: async ({ search }) => executeOnce(`searchCustomers:${search.trim().toLocaleLowerCase("es")}`, async () => ({
        matches: await searchSupervisorCustomers(session, search),
        source: { label: "Clientes", href: "/customers" },
      })),
    }),
    getCustomerHistory: tool({
      description: "Obtiene compras entregadas, productos, cantidades, precios y comprobantes de un cliente identificado por UUID.",
      inputSchema: z.object({ customerId: z.string().uuid() }),
      execute: async ({ customerId }) => {
        const history = await getSupervisorCustomerHistory(session, customerId);
        return {
          history,
          source: { label: history?.customerName ?? "Cliente", href: `/customers/${customerId}` },
        };
      },
    }),
    getCustomerAccountBalance: tool({
      description: "Consulta directamente el saldo real de cuenta corriente de uno o varios clientes por nombre, razon social o CUIT. Usar siempre para preguntas como cuanto debe, saldo a cobrar, deuda o cuenta corriente; no reconstruir el saldo desde ventas o historial.",
      inputSchema: z.object({ search: z.string().trim().min(2).max(120) }),
      execute: async ({ search }) => executeOnce(`getCustomerAccountBalance:${search.trim().toLocaleLowerCase("es")}`, async () => ({
        matches: await getSupervisorCustomerBalances(session, search),
        interpretation: "balance positivo es deuda del cliente; balance cero es cuenta cancelada; balance negativo es saldo a favor del cliente.",
        source: { label: "Cuentas corrientes", href: "/payments/accounts" },
      })),
    }),
    getCustomerInvoices: tool({
      description: "Obtiene las ultimas facturas fiscales aprobadas de un cliente por nombre, razon social o CUIT. Usar para preguntas como ultimas facturas, facturas de un cliente o mostrame sus comprobantes. Cada resultado incluye PDF y cuenta corriente.",
      inputSchema: z.object({
        search: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(10).default(3),
      }),
      execute: async ({ search, limit }) => executeOnce(`getCustomerInvoices:${search.trim().toLocaleLowerCase("es")}:${limit}`, async () => ({
        invoices: await getSupervisorCustomerInvoices(session, search, limit),
        clarification: "Estas son facturas emitidas y aprobadas. Su importe no equivale necesariamente al saldo a cobrar porque puede haber pagos, notas de credito o notas de debito. Para cobrar, verificar el enlace de cuenta corriente del cliente.",
      })),
    }),
    getInvoiceByNumber: tool({
      description: "Busca una factura fiscal aprobada por numero de comprobante, con o sin punto de venta. Usar cuando el operador pregunta por una factura particular.",
      inputSchema: z.object({ number: z.string().trim().min(1).max(40) }),
      execute: async ({ number }) => executeOnce(`getInvoiceByNumber:${number.replace(/\s+/g, "")}`, async () => ({
        invoices: await getSupervisorInvoiceByNumber(session, number),
        clarification: "El importe corresponde al comprobante emitido, no al saldo actual del cliente. Para saber cuanto cobrar, abrir su cuenta corriente.",
      })),
    }),
    getCustomerProductPattern: tool({
      description: "Resume la frecuencia y cantidad promedio de productos comprados por uno o varios registros del mismo cliente. Usar para interpretar y pasar en limpio pedidos informales; prioriza el patron completo y no un unico remito.",
      inputSchema: z.object({
        customerIds: z.array(z.string().uuid()).min(1).max(5),
      }),
      execute: async ({ customerIds }) => {
        const histories = (await Promise.all(
          [...new Set(customerIds)].map((customerId) => getSupervisorCustomerHistory(session, customerId)),
        )).filter((history) => history !== null);
        return {
          customerNames: histories.map((history) => history.customerName),
          products: summarizeCustomerProductPatterns(histories),
          sources: histories.map((history) => ({
            label: history.customerName,
            href: `/customers/${history.customerId}`,
          })),
        };
      },
    }),
    getOperationalSnapshot: tool({
      description: "Lista pedidos pendientes, autorizados aun no entregados y ventas entregadas con decision fiscal pendiente.",
      inputSchema: z.object({}),
      execute: async () => ({
        snapshot: await getSupervisorOperationalSnapshot(session),
        sources: [
          { label: "Pedidos", href: "/orders" },
          { label: "Ventas", href: "/sales" },
          { label: "Fiscal", href: "/fiscal" },
        ],
      }),
    }),
    getWorkPriorities: tool({
      description: "Obtiene prioridades personalizadas: recompra y cobranzas para vendedores; pedidos, entregas y facturación para administrativos. Un administrador puede indicar employeeName para consultar a otro empleado.",
      inputSchema: z.object({
        employeeName: z.string().trim().min(2).max(120).optional(),
      }),
      execute: async ({ employeeName }) => {
        const resolved = await resolvePrioritySession(session, employeeName);
        if (!resolved.session) return resolved;
        const summary = await getSupervisorLandingSummary(resolved.session);
        return {
          employee: resolved.requestedEmployee,
          mode: summary.mode,
          cards: summary.cards,
          details: summary.details,
          sources: summary.cards.map((card) => ({ label: card.label, href: card.href })),
        };
      },
    }),
    getSalesMetrics: tool({
      description: "Calcula rapidamente ventas entregadas de un mes: cantidad, total final, neto de IVA y ajustes. Usar para preguntas como cuanto vendimos, ventas del mes o facturacion comercial.",
      inputSchema: z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Mes en formato AAAA-MM; omitir para el mes actual"),
      }),
      execute: async ({ period }) => executeOnce(`getSalesMetrics:${period ?? "current"}`, async () => ({
        metrics: await getSupervisorSalesMetrics(session, period),
        interpretation: "grossAmount es el total comercial final; netAmount descuenta IVA solamente cuando existe un comprobante fiscal aprobado que lo discrimina.",
        sources: [
          { label: "Registro de ventas", href: `/sales${period ? `?month=${period}` : ""}` },
          { label: "Rentabilidad", href: `/rentabilidad${period ? `?month=${period}` : ""}` },
        ],
      })),
    }),
    getErpGuide: tool({
      description: "Indica en que pantalla del ERP se encuentra una funcion o dato y devuelve un enlace interno. Usar cuando el usuario pregunta donde ver algo o cuando conviene permitirle verificar un numero.",
      inputSchema: z.object({
        topic: z.enum(["sales", "profitability", "collections", "fiscal", "orders", "stock", "customers"]),
      }),
      execute: async ({ topic }) => ({ guide: getErpGuide(topic) }),
    }),
  };
}
