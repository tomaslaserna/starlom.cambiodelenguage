import Image from "next/image";

const migrationModules = [
  {
    name: "Autenticacion y permisos",
    phpSurface: "sign.php, auth.php, guard.php",
    target: "Sesion server-side y RBAC en Node",
    status: "Migrado base",
  },
  {
    name: "Clientes y productos",
    phpSurface: "clientes.php, productos.php, stock.php",
    target: "API JSON + tablas React",
    status: "Pantallas base",
  },
  {
    name: "Ventas y comprobantes",
    phpSurface: "ventas.php, facturacion.php",
    target: "Flujos transaccionales con auditoria",
    status: "APIs migradas",
  },
  {
    name: "Administracion",
    phpSurface: "admin_*.php, panel_*.php",
    target: "Dashboard financiero modular",
    status: "Dashboard base",
  },
];

const apiContracts = [
  { method: "GET", path: "/api/health", purpose: "Estado de app Node y PostgreSQL" },
  { method: "GET", path: "/api/customers", purpose: "Listado paginado de clientes" },
  { method: "GET", path: "/api/orders", purpose: "Pedidos y ventas con filtros" },
  { method: "GET", path: "/api/admin/metrics", purpose: "Indicadores financieros base" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[color:var(--border)] bg-white p-2">
              <Image
                src="/starlim-logo.png"
                alt="Star Lim"
                width={44}
                height={44}
                priority
              />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--muted)]">Migracion incremental</p>
              <h1 className="text-2xl font-semibold tracking-normal">Star Lim ERP</h1>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-medium">
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/login"
            >
              Login Node
            </a>
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/customers"
            >
              Clientes
            </a>
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/products"
            >
              Productos
            </a>
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/orders"
            >
              Pedidos
            </a>
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/admin"
            >
              Admin
            </a>
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--panel-subtle)]"
              href="/api/health"
            >
              API health
            </a>
            <a
              className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-white hover:bg-[color:var(--accent-strong)]"
              href="/frontend/index.php"
            >
              ERP PHP actual
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Mapa de migracion</h2>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                La nueva app convive con PHP mientras se reemplazan modulos por APIs Node,
                pantallas React y acceso controlado a PostgreSQL.
              </p>
            </div>
            <span className="w-fit rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 font-mono text-xs">
              apps/web
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Modulo</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">PHP actual</th>
                  <th className="px-4 py-3 font-semibold">Destino</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {migrationModules.map((module) => (
                  <tr key={module.name} className="border-t border-[color:var(--border)]">
                    <td className="px-4 py-4 font-medium">{module.name}</td>
                    <td className="hidden px-4 py-4 font-mono text-xs text-[color:var(--muted)] md:table-cell">
                      {module.phpSurface}
                    </td>
                    <td className="px-4 py-4 text-[color:var(--muted)]">{module.target}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs">
                        {module.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Stack objetivo</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[color:var(--muted)]">Interfaz</dt>
                <dd className="font-medium">React / Next.js</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[color:var(--muted)]">Backend</dt>
                <dd className="font-medium">Node.js / TypeScript</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[color:var(--muted)]">Datos</dt>
                <dd className="font-medium">PostgreSQL / Supabase</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[color:var(--muted)]">IA futura</dt>
                <dd className="font-medium">Servicio aislado</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Contratos API iniciales</h2>
            <div className="mt-4 grid gap-3">
              {apiContracts.map((contract) => (
                <div
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3"
                  key={`${contract.method} ${contract.path}`}
                >
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="rounded bg-[color:var(--accent)] px-2 py-1 text-white">
                      {contract.method}
                    </span>
                    <span>{contract.path}</span>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{contract.purpose}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
