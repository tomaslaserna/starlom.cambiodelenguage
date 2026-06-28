import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { PresenceIndicator } from "@/components/presence-indicator";
import { RouteWarmup } from "@/components/route-warmup";
import { ShellNavigation } from "@/components/shell-navigation";
import { ButtonLink } from "@/components/ui";
import {
  emptyNavigationIndicators,
  authorizedNavigationSections,
  getNavigationAuthorization,
  getNavigationIndicators,
  type NavigationAuthorization,
} from "@/lib/navigation";

type ModulePageProps = {
  title: string;
  description: string;
  active: string;
  session: AuthSession;
  children: ReactNode;
  navigationAuthorization?: NavigationAuthorization;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function BrandBlock({ title }: { title?: string }) {
  return (
    <Link className="flex min-w-0 flex-1 items-center gap-3" href="/">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white p-2 shadow-[0_8px_18px_rgba(15,23,42,0.07)]">
        <Image src="/starlim-logo.png" alt="Starlim" width={30} height={30} />
      </span>
      <span className="min-w-0">
        <span className="erp-text-caption block font-semibold uppercase text-white">Starlim</span>
        {title ? <span className="erp-text-title-sm block truncate font-medium text-white/82">{title}</span> : null}
      </span>
    </Link>
  );
}

export async function ModulePage({
  title,
  description,
  active,
  session,
  children,
  navigationAuthorization,
}: ModulePageProps) {
  let indicators = emptyNavigationIndicators();
  const fallbackAuthorization: NavigationAuthorization = {
    allowedPermissionKeys: new Set([
      "clientes.ver",
      "proveedores.ver",
      "productos.ver",
      "empleados.ver",
      "cobranzas.ver",
      "cobranzas.aprobar",
    ]),
  };
  const authorization =
    navigationAuthorization ??
    (await withTimeout(getNavigationAuthorization(session), 60, fallbackAuthorization));
  const sections = authorizedNavigationSections(authorization);

  indicators = await withTimeout(getNavigationIndicators(session), 60, emptyNavigationIndicators()).catch(() =>
    emptyNavigationIndicators(),
  );

  return (
    <div className="min-h-screen overflow-visible bg-[#f5f7fb] text-foreground lg:grid lg:h-screen lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
      <RouteWarmup />
      <aside className="sticky top-0 hidden h-screen border-r border-[#0750bd] bg-[linear-gradient(180deg,#0b6cff_0%,#075ac7_48%,#073f94_100%)] text-white shadow-[8px_0_30px_rgba(7,63,148,0.22)] lg:flex lg:flex-col">
        <div className="border-b border-white/14 px-4 py-4">
          <BrandBlock />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <ShellNavigation active={active} indicators={indicators} sections={sections} />
        </div>
        <div className="grid gap-3 border-t border-white/14 px-3 py-3">
          <div className="rounded-[10px] border border-white/18 bg-[#052f70]/58 px-3 py-2 shadow-[0_10px_22px_rgba(5,32,85,0.18)]">
            <div className="erp-text-caption truncate font-semibold text-white">{session.displayName}</div>
            <div className="erp-text-caption mt-0.5 truncate font-medium text-white/72">{session.role}</div>
          </div>
          <ButtonLink className="border-white/18 bg-white/12 text-white shadow-[0_10px_22px_rgba(5,32,85,0.16)] hover:border-white/30 hover:bg-white/18" href="/" size="sm" variant="secondary">
            Inicio
          </ButtonLink>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 overflow-visible lg:h-screen lg:overflow-y-auto lg:overscroll-contain">
        <header className="sticky top-0 z-30 border-b border-[#d9e2ef] bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.045)] backdrop-blur">
          <div className="hidden min-h-[4.25rem] items-center justify-between gap-4 px-7 lg:flex">
            <div className="min-w-0">
              <h1 className="erp-text-title-md truncate font-black tracking-normal text-[#0f172a]">{title}</h1>
              <p className="erp-text-body-sm mt-0.5 truncate font-semibold text-[#64748b]">{description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PresenceIndicator />
              <div className="erp-text-caption max-w-[360px] truncate rounded-[9px] border border-[#d9e2ef] bg-[#f8fafc] px-3 py-2 shadow-[var(--shadow-xs)]">
                <span className="font-black">{session.displayName}</span>
                <span className="font-semibold text-[#64748b]"> - {session.role} - {session.companyName}</span>
              </div>
              <LogoutButton />
            </div>
          </div>

          <div className="lg:hidden">
            <div className="flex min-h-16 items-center gap-3 border-b border-[#0750bd] bg-[linear-gradient(90deg,#0b6cff_0%,#075ac7_100%)] px-4 text-white">
              <details className="group">
                <summary
                  aria-label="Abrir menu de navegacion"
                  className="erp-text-body-sm min-h-10 list-none rounded-[9px] border border-white/24 bg-white/12 px-3 py-2 font-medium text-white shadow-[0_8px_18px_rgba(5,32,85,0.16)]"
                >
                  Menu
                </summary>
                <div className="fixed inset-x-0 top-16 z-40 max-h-[72vh] overflow-y-auto overscroll-contain border-b border-[#0750bd] bg-[linear-gradient(180deg,#0b6cff_0%,#075ac7_55%,#073f94_100%)] p-4 text-white shadow-[var(--shadow-md)]">
                  <ShellNavigation active={active} indicators={indicators} sections={sections} />
                  <div className="mt-5 grid gap-2 border-t border-white/14 pt-4">
                    <ButtonLink className="border-white/18 bg-white/12 text-white shadow-[0_10px_22px_rgba(5,32,85,0.16)] hover:bg-white/18" href="/" size="sm" variant="secondary">
                      Inicio
                    </ButtonLink>
                    <LogoutButton className="w-full" />
                  </div>
                </div>
              </details>
              <BrandBlock title={title} />
              <div className="ml-auto">
                <PresenceIndicator compact />
              </div>
            </div>
          </div>
        </header>

        <section className="erp-shell-content mx-auto min-w-0 max-w-[1480px] px-4 pb-24 pt-5 sm:px-6 lg:px-7 lg:pb-28 lg:pt-6">
          {children}
        </section>
      </main>
    </div>
  );
}
