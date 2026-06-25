import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { PresenceIndicator } from "@/components/presence-indicator";
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

function BrandBlock({ title }: { title?: string }) {
  return (
    <Link className="flex min-w-0 flex-1 items-center gap-3" href="/">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-2 shadow-[var(--shadow-xs)]">
        <Image src="/starlim-logo.png" alt="Star Lim" width={30} height={30} />
      </span>
      <span className="min-w-0">
        <span className="erp-text-caption block font-medium text-[color:var(--muted)]">Star Lim ERP</span>
        {title ? <span className="erp-text-title-sm block truncate font-semibold">{title}</span> : null}
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
  const authorization = navigationAuthorization ?? (await getNavigationAuthorization(session));
  const sections = authorizedNavigationSections(authorization);

  try {
    indicators = await getNavigationIndicators(session);
  } catch {
    indicators = emptyNavigationIndicators();
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-[color:var(--border)] bg-[color:var(--panel)] lg:flex lg:flex-col">
        <div className="border-b border-[color:var(--border)] px-4 py-4">
          <BrandBlock />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <ShellNavigation active={active} indicators={indicators} sections={sections} />
        </div>
        <div className="grid gap-2 border-t border-[color:var(--border)] px-3 py-3">
          <ButtonLink href="/" size="sm" variant="secondary">
            Inicio React
          </ButtonLink>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--panel)]/95 backdrop-blur">
          <div className="hidden min-h-16 items-center justify-between gap-4 px-5 lg:flex">
            <div className="min-w-0">
              <h1 className="erp-text-title-md truncate font-semibold tracking-normal">{title}</h1>
              <p className="erp-text-body-sm truncate text-[color:var(--muted)]">{description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PresenceIndicator />
              <div className="erp-text-caption max-w-[340px] truncate rounded-[var(--radius-md)] bg-[color:var(--panel-subtle)] px-3 py-2">
                <span className="font-semibold">{session.displayName}</span>
                <span className="text-[color:var(--muted)]"> - {session.role} - {session.companyName}</span>
              </div>
              <LogoutButton />
            </div>
          </div>

          <div className="lg:hidden">
            <div className="flex min-h-16 items-center gap-3 px-4">
              <details className="group">
                <summary
                  aria-label="Abrir menu de navegacion"
                  className="erp-text-body-sm min-h-10 list-none rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 font-semibold"
                >
                  Menu
                </summary>
                <div className="fixed inset-x-0 top-16 z-40 max-h-[72vh] overflow-y-auto overscroll-contain border-b border-[color:var(--border)] bg-[color:var(--panel)] p-4 shadow-[var(--shadow-md)]">
                  <ShellNavigation active={active} indicators={indicators} sections={sections} />
                  <div className="mt-5 grid gap-2 border-t border-[color:var(--border)] pt-4">
                    <ButtonLink href="/" size="sm" variant="secondary">
                      Inicio React
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

        <section className="erp-shell-content mx-auto min-w-0 max-w-[1480px] px-4 py-5 sm:px-5 lg:px-4">
          {children}
        </section>
      </main>
    </div>
  );
}
