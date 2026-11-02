import "server-only";

import { tool } from "ai";
import { z } from "zod";
import type { AuthSession } from "@/lib/auth";
import { isAdminRole, normalizeRole } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import {
  getSupervisorCustomerHistory,
  getSupervisorCustomerOrderSummary,
  getSupervisorCustomerDocuments,
  getSupervisorCustomerBalances,
  getSupervisorCustomerInvoices,
  getSupervisorInvoiceByNumber,
  getSupervisorOperationalSnapshot,
  getSupervisorSalesMetrics,
  searchSupervisorCatalogForCleaning,
  searchSupervisorCustomers,
} from "@/lib/supervisor-lab/read-model";
import { selectUnambiguousCustomerMatch, summarizeCustomerProductPatterns } from "@/lib/supervisor-lab/product-pattern";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";
import { getErpGuide } from "@/lib/supervisor-lab/system-guide";
import { searchCompanyManual } from "@/lib/supervisor-lab/company-manual";
import { diagnoseCleaningProblem } from "@/lib/supervisor-lab/cleaning-knowledge";

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
    getCustomerOrderSummary: tool({
      description: "Resuelve por nombre la frecuencia de compra, último pedido (incluye pendientes), última compra entregada y cantidad/importe de pedidos del mes. Último mes por defecto es el mes calendario anterior. Distingue fecha comercial y fecha de carga.",
      inputSchema: z.object({
        search: z.string().trim().min(2).max(120),
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("Mes AAAA-MM; omitir para el último mes completo"),
      }),
      execute: async ({ search, period }) => executeOnce(`getCustomerOrderSummary:${search.trim().toLocaleLowerCase("es")}:${period ?? "previous"}`, async () => {
        const matches = await searchSupervisorCustomers(session, search);
        const selected = selectUnambiguousCustomerMatch(matches, search);
        if (!selected) return {
          summary: null,
          matches,
          clarification: matches.length ? "Hay varios clientes posibles. Pedir que el operador elija; no mezclar historiales." : "No se encontró un cliente accesible con ese nombre. Pedir el nombre exacto.",
        };
        return { summary: await getSupervisorCustomerOrderSummary(session, selected.customerId, period) };
      }),
    }),
    getCustomerCommercialBrief: tool({
      description: "Prepara información comercial redactable de un cliente por nombre: qué productos suele pedir, cantidades promedio cuando los compra, cada cuánto compra, importe promedio por pedido entregado y sus dos últimos comprobantes reales. Para vendedores en la calle y preguntas compuestas; los promedios son históricos, no cotizaciones actuales.",
      inputSchema: z.object({ search: z.string().trim().min(2).max(120) }),
      execute: async ({ search }) => executeOnce(`getCustomerCommercialBrief:${search.trim().toLocaleLowerCase("es")}`, async () => {
        const matches = await searchSupervisorCustomers(session, search);
        const selected = selectUnambiguousCustomerMatch(matches, search);
        if (!selected) return { brief: null, matches, clarification: matches.length ? "Pedir que el operador elija el cliente; no combinar homónimos." : "No se encontró un cliente accesible con ese nombre." };
        const [summary, history, documents] = await Promise.all([
          getSupervisorCustomerOrderSummary(session, selected.customerId),
          getSupervisorCustomerHistory(session, selected.customerId),
          getSupervisorCustomerDocuments(session, selected.customerId, 2),
        ]);
        return {
          brief: {
            summary,
            usualProducts: history ? summarizeCustomerProductPatterns([history]).slice(0, 10) : [],
            productHistoryPurchaseCount: history?.purchases.length ?? 0,
            documents,
            clarification: "Cantidades promedio por compra de cada producto, no por todos los pedidos. Los importes son históricos y no constituyen una cotización actual. Factura y remito pueden corresponder a la misma venta: no sumarlos como compras distintas. La lista de productos muestra hasta diez de los más frecuentes.",
          },
        };
      }),
    }),
    getCustomerDocuments: tool({
      description: "Devuelve los últimos N comprobantes reales de un cliente por nombre: facturas fiscales aprobadas y remitos emitidos, con tipo, número, fecha, importe y PDF. No incluye pedidos ni notas de crédito/débito. Para últimas facturas solamente, usar getCustomerInvoices.",
      inputSchema: z.object({ search: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(10).default(2) }),
      execute: async ({ search, limit }) => executeOnce(`getCustomerDocuments:${search.trim().toLocaleLowerCase("es")}:${limit}`, async () => {
        const matches = await searchSupervisorCustomers(session, search);
        const selected = selectUnambiguousCustomerMatch(matches, search);
        if (!selected) return { documents: [], matches, clarification: matches.length ? "Pedir que el operador elija el cliente; no combinar homónimos." : "No se encontró un cliente accesible con ese nombre." };
        return {
          customerName: selected.customerName,
          documents: await getSupervisorCustomerDocuments(session, selected.customerId, limit),
          source: { label: selected.customerName, href: selected.sourceHref },
          clarification: "Incluye facturas y remitos; no notas de crédito/débito. Un remito y una factura pueden corresponder a la misma venta. La cantidad es de documentos, no de pedidos. Si hay menos que los solicitados, indicarlo. No es el saldo actual de deuda.",
        };
      }),
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
      description: "Obtiene las últimas facturas fiscales aprobadas de un cliente por nombre, razón social o CUIT. Usar cuando pide facturas expresamente. Si pide comprobantes sin especificar factura, usar getCustomerDocuments, que también incluye remitos. Cada resultado incluye PDF y cuenta corriente.",
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
      description: "Busca al cliente por nombre y resume la frecuencia y cantidad promedio de sus productos comprados. Para interpretar pedidos informales usa search con el nombre mencionado (por ejemplo PINAR EVENTOS); no necesitas buscar IDs antes. Si hay varios clientes posibles, pide aclaracion.",
      inputSchema: z.object({
        search: z.string().trim().min(2).max(120).optional(),
        customerIds: z.array(z.string().uuid()).min(1).max(5).optional(),
      }).refine((input) => Boolean(input.search || input.customerIds?.length), "Indica search o customerIds"),
      execute: async ({ search, customerIds }) => {
        let resolvedIds = customerIds ?? [];
        if (search) {
          const matches = await searchSupervisorCustomers(session, search);
          const selected = selectUnambiguousCustomerMatch(matches, search);
          if (!selected) {
            return {
              customerNames: [],
              products: [],
              sources: [],
              matches,
              clarification: matches.length === 0
                ? "No se encontro un cliente accesible con ese nombre. Solicita el nombre exacto."
                : "Hay varios clientes posibles. Solicita que el operador elija uno antes de interpretar el pedido.",
            };
          }
          resolvedIds = [selected.customerId];
        }
        const histories = (await Promise.all(
          [...new Set(resolvedIds)].map((customerId) => getSupervisorCustomerHistory(session, customerId)),
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
      execute: async ({ period }) => executeOnce(`getSalesMetrics:${period ?? "current"}`, async () => {
        const metrics = await getSupervisorSalesMetrics(session, period);
        return {
          metrics,
          interpretation: "grossAmount es el total comercial final. netAmount es un neto fiscal explicativo: descuenta IVA solamente cuando existe un comprobante fiscal aprobado que lo discrimina, por lo que no debe compararse como si fuera la misma métrica que el neto de Rentabilidad.",
          howToVerify: "Abrí Registro de ventas. El enlace ya selecciona el mes consultado y muestra únicamente ventas entregadas de ese período.",
          sources: [
            { label: "Registro de ventas del período", href: metrics.sourceHref },
          ],
        };
      }),
    }),
    getErpGuide: tool({
      description: "Indica en que pantalla del ERP se encuentra una funcion o dato y devuelve un enlace interno. Usar cuando el usuario pregunta donde ver algo o cuando conviene permitirle verificar un numero.",
      inputSchema: z.object({
        topic: z.enum(["sales", "profitability", "collections", "fiscal", "orders", "stock", "products", "purchases", "customers"]),
      }),
      execute: async ({ topic }) => ({ guide: getErpGuide(topic) }),
    }),
    searchCompanyManual: tool({
      description: "Busca en el manual operativo detallado de Starlim cómo funciona un proceso del ERP o de la empresa. Usar para preguntas de procedimiento, pasos, controles, responsabilidades o qué ocurre después de una acción.",
      inputSchema: z.object({
        query: z.string().trim().min(3).max(300),
      }),
      execute: async ({ query }) => executeOnce(`searchCompanyManual:${query.trim().toLocaleLowerCase("es")}`, async () => ({
        entries: searchCompanyManual(query),
        clarification: "El manual describe el circuito configurado en el ERP. Si una política interna no figura, debe marcarse como pendiente de validación y no inventarse.",
      })),
    }),
    getCleaningAdvice: tool({
      description: "Diagnostica una necesidad de limpieza doméstica o institucional y busca opciones reales en el catálogo activo de Starlim. Usar para manchas, suciedad, superficies, desinfección, métodos y asesoramiento al cliente.",
      inputSchema: z.object({
        problem: z.string().trim().min(3).max(500),
        surface: z.string().trim().min(2).max(160).optional(),
        environment: z.enum(["hogar", "comercio", "institucion", "industria", "desconocido"]).optional(),
      }),
      execute: async ({ problem, surface, environment }) => executeOnce(
        `getCleaningAdvice:${problem}:${surface ?? ""}:${environment ?? ""}`.toLocaleLowerCase("es"),
        async () => {
          const advice = diagnoseCleaningProblem(problem, surface, environment);
          return {
            advice,
            catalogMatches: await searchSupervisorCatalogForCleaning(session, advice.catalogTerms),
            catalogClarification: "Son coincidencias del catálogo activo, ordenadas primero por existencia positiva. Confirmar etiqueta, compatibilidad, presentación y lista de precios antes de ofrecerlas al cliente.",
            sources: [
              { label: "Catálogo de productos", href: "/products" },
              { label: "Listas de precios", href: "/crm/listas" },
              { label: "Stock", href: "/stock" },
            ],
          };
        },
      ),
    }),
  };
}
