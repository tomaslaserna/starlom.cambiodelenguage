import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { MessageNotifications } from "@/components/message-notifications";
import { NavigationIndicatorsProvider } from "@/components/navigation-indicators-provider";
import { PresenceIndicator } from "@/components/presence-indicator";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { ShellNavigation } from "@/components/shell-navigation";
import { ButtonLink, cn } from "@/components/ui";
import {
  emptyNavigationIndicators,
  authorizedNavigationSections,
  getNavigationAuthorization,
  type NavigationAuthorization,
} from "@/lib/navigation";

type ModulePageProps = {
  title: string;
  description: string;
  active: string;
  session: AuthSession;
  children: ReactNode;
  navigationAuthorization?: NavigationAuthorization;
  lockDesktopScroll?: boolean;
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
  lockDesktopScroll = false,
}: ModulePageProps) {
  const fallbackAuthorization: NavigationAuthorization = {
    allowedPermissionKeys: new Set<string>(),
  };
  const authorization = navigationAuthorization
    ? navigationAuthorization
    : await withTimeout(getNavigationAuthorization(session), 60, fallbackAuthorization);
  // Badges and the message preview are useful, but neither may hold the whole
  // screen hostage. Both client components refresh them right after hydration.
  const indicators = emptyNavigationIndicators();
  const sections = authorizedNavigationSections(authorization);

  return (
    <NavigationIndicatorsProvider initialIndicators={indicators}>
      <div className="min-h-screen overflow-visible bg-[color:var(--background)] text-foreground lg:grid lg:h-screen lg:grid-cols-[252px_minmax(0,1fr)] lg:overflow-hidden lg:overscroll-none">
      <SessionKeepAlive />
      <MessageNotifications
        currentUsername={session.username}
        initialLatestMessage={null}
        initialUnread={0}
        initialRevision=""
      />
      <aside className="sticky top-0 hidden h-screen overflow-hidden overscroll-none border-r border-[#0750bd] bg-[linear-gradient(180deg,#0b6cff_0%,#075ac7_48%,#073f94_100%)] text-white shadow-[8px_0_30px_rgba(7,63,148,0.22)] lg:flex lg:flex-col">
        <div className="border-b border-white/14 px-4 py-4">
          <BrandBlock />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none px-3 py-4">
          <ShellNavigation active={active} indicators={indicators} sections={sections} />
        </div>
        <div className="grid gap-3 border-t border-white/14 px-3 py-3">
          <div className="rounded-[10px] border border-white/18 bg-[#052f70]/58 px-3 py-2 shadow-[0_10px_22px_rgba(5,32,85,0.18)]">
            <div className="erp-text-caption truncate font-semibold text-white">{session.displayName}</div>
            <div className="erp-text-caption mt-0.5 truncate font-medium text-white/72">{session.role}</div>
          </div>
          <ButtonLink className="border-[#60a5fa]/45 bg-[#0b4fc7] text-white shadow-[0_10px_22px_rgba(5,32,85,0.16)] hover:border-[#93c5fd]/60 hover:bg-[#073f94]" href="/" size="sm" variant="secondary">
            Inicio
          </ButtonLink>
        </div>
      </aside>

      <main className={cn("min-h-screen min-w-0 overflow-visible lg:h-screen", lockDesktopScroll ? "lg:overflow-hidden" : "lg:overflow-y-auto lg:overscroll-contain")}>
        <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/95 shadow-[0_6px_20px_rgba(15,34,62,0.04)] backdrop-blur">
          <div className="hidden min-h-[4.75rem] items-center justify-between gap-5 px-7 lg:flex">
            <div className="min-w-0">
              <h1 className="truncate text-[1.625rem] font-extrabold leading-8 tracking-[-0.03em] text-[color:var(--foreground)]">{title}</h1>
              <p className="erp-text-body-sm mt-0.5 truncate font-medium text-[color:var(--muted)]">{description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PresenceIndicator />
              <div className="erp-text-caption flex h-[var(--control-height-md)] max-w-[360px] items-center truncate rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-3 shadow-[var(--shadow-xs)]">
                <span className="font-bold">{session.displayName}</span>
                <span className="font-medium text-[#64748b]"> - {session.role} - {session.companyName}</span>
              </div>
              <LogoutButton className="h-[var(--control-height-md)] min-h-[var(--control-height-md)] px-4" />
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
                    <ButtonLink className="border-[#60a5fa]/45 bg-[#0b4fc7] text-white shadow-[0_10px_22px_rgba(5,32,85,0.16)] hover:border-[#93c5fd]/60 hover:bg-[#073f94]" href="/" size="sm" variant="secondary">
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

        <section className={cn("erp-shell-content mx-auto min-w-0 max-w-[1600px] px-4 pb-24 pt-4 sm:px-5 lg:px-6 lg:pt-5", lockDesktopScroll ? "lg:h-[calc(100vh-4.75rem)] lg:overflow-hidden lg:pb-5" : "lg:pb-28")}>
          <div className={cn("erp-workspace-surface", lockDesktopScroll && "h-full overflow-hidden")}>{children}</div>
        </section>
      </main>
      </div>
    </NavigationIndicatorsProvider>
  );
}
