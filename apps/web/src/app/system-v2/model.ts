export type SystemView = "home" | "commercial" | "operations" | "supply" | "people" | "administration" | "control";

export type Supplier = {
  id: string;
  name: string;
  legalName: string;
  cuit: string;
  category: string;
  contact: string;
  phone: string;
  email: string;
  paymentDays: number;
  leadDays: number;
  score: number;
  bank: string;
  bankAccount: string;
  active: boolean;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  presentation: string;
  stock: number;
  reserved: number;
  reorderPoint: number;
  cost: number;
  price: number;
  supplierIds: string[];
};

export type PurchaseItem = { productId: string; quantity: number; unitCost: number };
export type PurchaseStatus = "Borrador" | "Ordenada" | "Parcial" | "Recibida sin factura" | "Recibida" | "Cancelada";

export type Purchase = {
  id: string;
  number: string;
  supplierId: string;
  createdAt: string;
  expectedAt: string;
  receivedAt?: string;
  status: PurchaseStatus;
  invoiceNumber?: string;
  items: PurchaseItem[];
};

export type Employee = {
  id: string;
  name: string;
  title: string;
  role: "Administrador" | "Jefe" | "Vendedor" | "Operaciones" | "Logística" | "Depósito";
  startTime: string;
  monthlySalary: number;
  commissionRate: number;
  active: boolean;
  clockedInAt?: string;
};

export type Customer = {
  id: string;
  commercialName: string;
  legalName: string;
  cuit: string;
  branch: string;
  segment: string;
  seller: string;
  priceList: string;
  receiptType: "Factura A" | "Factura B" | "Remito";
  balance: number;
  nextContact?: string;
  status: "Activo" | "Prospecto" | "Inactivo";
};

export type Order = {
  id: string;
  number: string;
  customerId: string;
  seller: string;
  status: "Cargado" | "Confirmado" | "Preparación" | "Reparto" | "Entregado";
  receiptType: Customer["receiptType"];
  deliveryDate: string;
  urgency: "Baja" | "Media" | "Alta";
  total: number;
  items: Array<{ productId: string; quantity: number }>;
};

export type Obligation = {
  id: string;
  source: "Compra" | "Sueldo" | "Impuesto" | "Costo";
  beneficiary: string;
  concept: string;
  dueDate: string;
  total: number;
  paid: number;
  scheduledDate?: string;
  account?: string;
};

export type TreasuryAccount = {
  id: string;
  name: string;
  kind: "Banco" | "Efectivo" | "Billetera";
  balance: number;
  statementBalance: number;
};

export type TreasuryMovement = {
  id: string;
  date: string;
  accountId: string;
  direction: "Ingreso" | "Egreso";
  concept: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
};

export type FiscalDocument = {
  id: string;
  date: string;
  customer: string;
  type: "Factura A" | "Factura B" | "Nota de crédito";
  number: string;
  total: number;
  status: "Emitido" | "Pendiente" | "Error" | "Anulado";
  orderNumber?: string;
  detail?: string;
};

export type AppTask = {
  id: string;
  title: string;
  area: "Comercial" | "Operaciones" | "Compras" | "RR.HH." | "Administración" | "Fiscal";
  priority: "Baja" | "Media" | "Alta";
  dueDate: string;
  done: boolean;
};

export type PrototypeState = {
  suppliers: Supplier[];
  products: Product[];
  purchases: Purchase[];
  employees: Employee[];
  customers: Customer[];
  orders: Order[];
  obligations: Obligation[];
  accounts: TreasuryAccount[];
  movements: TreasuryMovement[];
  fiscalDocuments: FiscalDocument[];
  tasks: AppTask[];
};

export const prototypeToday = "2026-10-06";

export const initialPrototypeState: PrototypeState = {
  suppliers: [
    { id: "sup-maralimm", name: "Maralimm", legalName: "MARALIMM SAS", cuit: "30-71633069-0", category: "Papelería institucional", contact: "María", phone: "351 555-0140", email: "ventas@maralimm.test", paymentDays: 15, leadDays: 5, score: 92, bank: "Galicia", bankAccount: "CC 105750731", active: true },
    { id: "sup-polides", name: "Polides", legalName: "POLIDES SRL", cuit: "30-71489942-0", category: "Químicos", contact: "Lucas", phone: "351 555-0188", email: "pedidos@polides.test", paymentDays: 7, leadDays: 3, score: 88, bank: "Santander", bankAccount: "CC 455182", active: true },
    { id: "sup-envaplast", name: "Envaplast", legalName: "ENVAPLAST SA", cuit: "30-71200112-4", category: "Descartables", contact: "Carla", phone: "351 555-0192", email: "comercial@envaplast.test", paymentDays: 30, leadDays: 8, score: 76, bank: "Macro", bankAccount: "CC 889122", active: true },
  ],
  products: [
    { id: "prod-papel", sku: "PAP-001", name: "Papel higiénico industrial x2", category: "Papelería", presentation: "Bulto x 4 packs", stock: 38, reserved: 12, reorderPoint: 30, cost: 18_420, price: 29_900, supplierIds: ["sup-maralimm"] },
    { id: "prod-toalla", sku: "PAP-014", name: "Toalla en rollo 300 m", category: "Papelería", presentation: "Pack x 2", stock: 14, reserved: 8, reorderPoint: 18, cost: 22_880, price: 37_600, supplierIds: ["sup-maralimm", "sup-envaplast"] },
    { id: "prod-detergente", sku: "QUI-032", name: "Detergente base", category: "Químicos", presentation: "Bidón x 5 l", stock: 46, reserved: 9, reorderPoint: 20, cost: 8_750, price: 15_200, supplierIds: ["sup-polides"] },
    { id: "prod-bolsa", sku: "DES-090", name: "Bolsa 90 × 120", category: "Descartables", presentation: "Paquete x 10", stock: 19, reserved: 15, reorderPoint: 25, cost: 12_600, price: 21_900, supplierIds: ["sup-envaplast"] },
    { id: "prod-servilleta", sku: "PAP-044", name: "Servilleta 33 × 33", category: "Papelería", presentation: "Caja x 12", stock: 62, reserved: 18, reorderPoint: 24, cost: 15_450, price: 25_800, supplierIds: ["sup-maralimm", "sup-envaplast"] },
  ],
  purchases: [
    { id: "pur-104", number: "OC-0104", supplierId: "sup-maralimm", createdAt: "2026-10-02", expectedAt: "2026-10-08", status: "Ordenada", invoiceNumber: "FA 10012", items: [{ productId: "prod-papel", quantity: 24, unitCost: 18_420 }, { productId: "prod-toalla", quantity: 18, unitCost: 22_880 }] },
    { id: "pur-103", number: "OC-0103", supplierId: "sup-polides", createdAt: "2026-10-01", expectedAt: "2026-10-04", receivedAt: "2026-10-04", status: "Recibida", invoiceNumber: "FA 10140", items: [{ productId: "prod-detergente", quantity: 36, unitCost: 8_750 }] },
  ],
  employees: [
    { id: "emp-augusto", name: "Augusto Finocchietti", title: "Socio administrador", role: "Administrador", startTime: "09:00", monthlySalary: 0, commissionRate: 0, active: true, clockedInAt: "08:54" },
    { id: "emp-fran", name: "Francisco Valdés", title: "Vendedor", role: "Vendedor", startTime: "16:00", monthlySalary: 620_000, commissionRate: 2.5, active: true },
    { id: "emp-tobias", name: "Tobías", title: "Depósito", role: "Depósito", startTime: "08:00", monthlySalary: 710_000, commissionRate: 0, active: true, clockedInAt: "08:03" },
  ],
  customers: [
    { id: "cus-minuteria", commercialName: "La Minutería", legalName: "MINUTERIA S.A.S.", cuit: "30-71937793-5", branch: "Nueva Córdoba", segment: "Gastronomía", seller: "Francisco Valdés", priceList: "Lista 2", receiptType: "Factura A", balance: 1_575_645.35, nextContact: "2026-10-07", status: "Activo" },
    { id: "cus-pinar", commercialName: "Pinar Eventos", legalName: "PINAR EVENTOS SRL", cuit: "30-71841022-8", branch: "Zona norte", segment: "Eventos", seller: "Francisco Valdés", priceList: "Lista 2", receiptType: "Factura A", balance: 0, nextContact: "2026-10-08", status: "Activo" },
    { id: "cus-cascada", commercialName: "La Cascada", legalName: "LA CASCADA SRL", cuit: "30-70900112-1", branch: "Casa central", segment: "Gastronomía", seller: "Augusto Finocchietti", priceList: "Lista 1", receiptType: "Factura A", balance: -26_554.72, status: "Activo" },
    { id: "cus-nuevo", commercialName: "Hotel del Parque", legalName: "", cuit: "", branch: "Centro", segment: "Hotelería", seller: "Francisco Valdés", priceList: "Lista 3", receiptType: "Remito", balance: 0, nextContact: "2026-10-06", status: "Prospecto" },
  ],
  orders: [
    { id: "ord-142", number: "P-0142", customerId: "cus-pinar", seller: "Francisco Valdés", status: "Confirmado", receiptType: "Factura A", deliveryDate: "2026-10-07", urgency: "Alta", total: 482_600, items: [{ productId: "prod-papel", quantity: 6 }, { productId: "prod-servilleta", quantity: 6 }] },
    { id: "ord-141", number: "P-0141", customerId: "cus-minuteria", seller: "Francisco Valdés", status: "Preparación", receiptType: "Factura A", deliveryDate: "2026-10-06", urgency: "Media", total: 318_240, items: [{ productId: "prod-toalla", quantity: 4 }, { productId: "prod-detergente", quantity: 3 }] },
    { id: "ord-140", number: "P-0140", customerId: "cus-cascada", seller: "Augusto Finocchietti", status: "Reparto", receiptType: "Remito", deliveryDate: "2026-10-06", urgency: "Baja", total: 126_442, items: [{ productId: "prod-bolsa", quantity: 5 }] },
  ],
  obligations: [
    { id: "obl-polides", source: "Compra", beneficiary: "POLIDES SRL", concept: "FA 10140", dueDate: "2026-10-10", total: 668_432, paid: 0, scheduledDate: "2026-10-09", account: "Santander" },
    { id: "obl-salaries", source: "Sueldo", beneficiary: "Equipo operativo", concept: "Sueldos octubre", dueDate: "2026-10-15", total: 1_330_000, paid: 0 },
    { id: "obl-rent", source: "Costo", beneficiary: "Inmobiliaria", concept: "Alquiler octubre", dueDate: "2026-10-08", total: 690_000, paid: 0 },
  ],
  accounts: [
    { id: "acc-santander", name: "Santander", kind: "Banco", balance: 6_450_000, statementBalance: 6_420_000 },
    { id: "acc-cash", name: "Caja", kind: "Efectivo", balance: 1_240_000, statementBalance: 1_240_000 },
    { id: "acc-mp", name: "Mercado Pago", kind: "Billetera", balance: 550_000, statementBalance: 550_000 },
  ],
  movements: [
    { id: "mov-1", date: "2026-10-06", accountId: "acc-santander", direction: "Ingreso", concept: "Cobros de cuentas corrientes", amount: 925_400 },
    { id: "mov-2", date: "2026-10-05", accountId: "acc-cash", direction: "Egreso", concept: "Gastos operativos", amount: 86_500 },
  ],
  fiscalDocuments: [
    { id: "fis-1", date: "2026-10-06", customer: "La Minutería", type: "Factura A", number: "0001-00000641", total: 318_240, status: "Pendiente", orderNumber: "P-0141", detail: "Se emitirá al confirmar entrega" },
    { id: "fis-2", date: "2026-10-05", customer: "La Cascada", type: "Factura A", number: "0001-00000640", total: 126_442, status: "Emitido", orderNumber: "P-0138" },
    { id: "fis-3", date: "2026-10-03", customer: "Cliente demo", type: "Nota de crédito", number: "0002-00000031", total: 17_687, status: "Error", detail: "Documento sin referencia comercial vinculada" },
  ],
  tasks: [
    { id: "task-1", title: "Conciliar Santander", area: "Administración", priority: "Alta", dueDate: "2026-10-06", done: false },
    { id: "task-2", title: "Confirmar entrega P-0141", area: "Operaciones", priority: "Alta", dueDate: "2026-10-06", done: false },
    { id: "task-3", title: "Contactar Hotel del Parque", area: "Comercial", priority: "Media", dueDate: "2026-10-06", done: false },
    { id: "task-4", title: "Revisar nota de crédito sin referencia", area: "Fiscal", priority: "Alta", dueDate: "2026-10-06", done: false },
  ],
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function purchaseTotal(purchase: Purchase) {
  return purchase.items.reduce((total, item) => total + item.quantity * item.unitCost, 0);
}

export function availableStock(product: Product) {
  return product.stock - product.reserved;
}

export function obligationBalance(obligation: Obligation) {
  return Math.max(0, obligation.total - obligation.paid);
}
