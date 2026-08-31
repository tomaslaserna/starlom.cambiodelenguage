export const ERP_GUIDE = {
  sales: {
    label: "Registro de ventas",
    href: "/sales",
    guidance: "Abrí Operaciones > Registro de ventas para revisar ventas entregadas, ajustes y comprobantes asociados.",
  },
  profitability: {
    label: "Rentabilidad",
    href: "/rentabilidad",
    guidance: "Abrí Administración > Rentabilidad para comparar ventas netas, costo y margen.",
  },
  collections: {
    label: "Cuentas corrientes",
    href: "/payments/accounts",
    guidance: "Abrí Administración > Cuentas corrientes para consultar el saldo real a cobrar por cliente.",
  },
  fiscal: {
    label: "Fiscal",
    href: "/billing",
    guidance: "Abrí Operaciones > Fiscal para revisar solicitudes, autorizaciones y comprobantes de ARCA.",
  },
  orders: {
    label: "Pedidos",
    href: "/orders",
    guidance: "Abrí Operaciones > Pedidos para autorizar, preparar y marcar entregas.",
  },
  stock: {
    label: "Stock",
    href: "/stock",
    guidance: "Abrí Datos > Stock para consultar existencias y movimientos.",
  },
  products: {
    label: "Catálogo de productos",
    href: "/products",
    guidance: "Abrí Datos > Productos para consultar y mantener el catálogo general de artículos.",
  },
  purchases: {
    label: "Nueva compra",
    href: "/purchases",
    guidance: "Abrí Compras > Nueva compra. Dentro de Mercadería recibida usá + Agregar producto nuevo para dar de alta un artículo que llegó de un proveedor; al registrar la compra también se incorpora su stock inicial y costo.",
  },
  customers: {
    label: "Clientes",
    href: "/customers",
    guidance: "Abrí Datos > Clientes para consultar la ficha, historial y datos comerciales.",
  },
} as const;

export type ErpGuideTopic = keyof typeof ERP_GUIDE;

export function getErpGuide(topic: ErpGuideTopic) {
  return ERP_GUIDE[topic];
}
