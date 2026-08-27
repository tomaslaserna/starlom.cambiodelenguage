"use client";

type PermissionOption = {
  key: string;
  module: string;
  action: string;
  name: string;
  sensitive: boolean;
};

type PermissionBlock = {
  key: string;
  title: string;
  description: string;
  matches: (permission: PermissionOption) => boolean;
};

const BLOCKS: PermissionBlock[] = [
  {
    key: "commercial",
    title: "Comercial",
    description: "Clientes, CRM, presupuestos, pedidos y registro de ventas.",
    matches: ({ key }) => /^(clientes|crm|presupuestos|pedidos|ventas)\./.test(key),
  },
  {
    key: "collections",
    title: "Cobranzas",
    description: "Cuentas corrientes, cobros y aprobaciones.",
    matches: ({ key }) => /^(cobranzas|cobros)\./.test(key),
  },
  {
    key: "fiscal",
    title: "Fiscal",
    description: "Facturas, notas fiscales y comprobantes.",
    matches: ({ key, module }) => /^(fiscal|facturacion)\./.test(key) || /fiscal|factur/i.test(module),
  },
  {
    key: "inventory",
    title: "Stock y logística",
    description: "Productos, inventario, preparación y entregas.",
    matches: ({ key }) => /^(stock|productos|logistica|entregas)\./.test(key),
  },
  {
    key: "purchases",
    title: "Compras",
    description: "Proveedores, compras, recepción y reposición.",
    matches: ({ key }) => /^(compras|proveedores)\./.test(key),
  },
  {
    key: "administration",
    title: "Administración y finanzas",
    description: "Caja, tesorería, balance, métricas y reportes.",
    matches: ({ key }) => /^(admin\.|caja\.|tesoreria\.|balance\.|reportes\.)/.test(key),
  },
  {
    key: "people",
    title: "Personal y sistema",
    description: "Empleados, configuración, auditoría y acciones sensibles.",
    matches: ({ key }) => /^(empleados|registros|sistema|auditoria)\./.test(key),
  },
];

function groupedPermissions(permissions: PermissionOption[]) {
  const pending = new Set(permissions.map((permission) => permission.key));
  const groups = BLOCKS.map((block) => {
    const items = permissions.filter((permission) => pending.has(permission.key) && block.matches(permission));
    items.forEach((permission) => pending.delete(permission.key));
    return { ...block, items };
  }).filter((block) => block.items.length > 0);

  const other = permissions.filter((permission) => pending.has(permission.key));
  if (other.length) {
    groups.push({
      key: "other",
      title: "Otros accesos",
      description: "Permisos todavía no asociados a un bloque funcional.",
      matches: () => false,
      items: other,
    });
  }
  return groups;
}

function permissionLevel(action: string, sensitive: boolean) {
  if (sensitive) return "Sensible";
  if (/aprobar|autorizar|administrar/i.test(action)) return "Aprobar";
  if (/crear|editar|operar|cancelar|borrar|eliminar/i.test(action)) return "Operar";
  return "Ver";
}

export function PermissionBlocks({
  permissions,
  selectedKeys = [],
  idPrefix,
}: {
  permissions: PermissionOption[];
  selectedKeys?: string[];
  idPrefix: string;
}) {
  const selected = new Set(selectedKeys);
  const groups = groupedPermissions(permissions);

  function setBlock(blockKey: string, checked: boolean) {
    document
      .querySelectorAll<HTMLInputElement>(`input[data-permission-block="${idPrefix}-${blockKey}"]`)
      .forEach((input) => {
        input.checked = checked;
      });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((block) => (
        <fieldset
          key={block.key}
          className="rounded-[12px] border border-[color:var(--border)] bg-white p-4 shadow-sm"
        >
          <legend className="sr-only">{block.title}</legend>
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
            <div>
              <h4 className="font-black text-[color:var(--foreground)]">{block.title}</h4>
              <p className="mt-1 text-[var(--text-caption)] leading-5 text-[color:var(--muted)]">
                {block.description}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[color:var(--panel-muted)] px-2 py-1 text-[11px] font-black text-[color:var(--muted)]">
              {block.items.length}
            </span>
          </div>

          <div className="my-2 flex justify-end gap-2 text-[11px] font-extrabold">
            <button className="text-[color:var(--accent-strong)] hover:underline" type="button" onClick={() => setBlock(block.key, true)}>
              Habilitar bloque
            </button>
            <span aria-hidden="true" className="text-[color:var(--border)]">·</span>
            <button className="text-[color:var(--muted)] hover:underline" type="button" onClick={() => setBlock(block.key, false)}>
              Quitar bloque
            </button>
          </div>

          <div className="grid gap-1.5">
            {block.items.map((permission) => (
              <label
                key={permission.key}
                className="flex min-h-10 items-start gap-2 rounded-[8px] px-2 py-2 text-[var(--text-body-sm)] hover:bg-[color:var(--panel-muted)]"
              >
                <input
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--border)] accent-[var(--accent)]"
                  data-permission-block={`${idPrefix}-${block.key}`}
                  defaultChecked={selected.has(permission.key)}
                  name="permissionKeys"
                  suppressHydrationWarning
                  type="checkbox"
                  value={permission.key}
                />
                <span className="min-w-0 flex-1 text-[color:var(--foreground)]">{permission.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    permission.sensitive
                      ? "bg-red-50 text-red-700"
                      : "bg-[color:var(--panel-muted)] text-[color:var(--muted)]"
                  }`}
                >
                  {permissionLevel(permission.action, permission.sensitive)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
