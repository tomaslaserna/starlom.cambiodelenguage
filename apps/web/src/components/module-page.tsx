import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { normalizeRole, type AuthSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { MessageNotifications } from "@/components/message-notifications";
import { MessageNotifier } from "@/components/message-notifier";
import { PresenceIndicator } from "@/components/presence-indicator";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { ShellNavigation } from "@/components/shell-navigation";
import { SellerMobileNavigation } from "@/components/seller-mobile-navigation";
import { ButtonLink, cn } from "@/components/ui";
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
  lockDesktopScroll?: boolean;
};

const NAVIGATION_AUTHORIZATION_TIMEOUT_MS = 5_000;
const NAVIGATION_INDICATORS_TIMEOUT_MS = 2_000;

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
  if (title) {
    return (
      <Link aria-label={`Starlim - ${title}`} className="flex min-w-0 flex-1 items-center" href="/">
        <Image
          alt="Starlim"
          className="h-auto w-[108px] object-contain"
          height={49}
          priority
          src="/starlim-logo-white.png"
          width={108}
        />
      </Link>
    );
  }

  return (
    <Link aria-label="Ir al inicio de Starlim" className="flex items-center justify-center py-1" href="/">
      <Image
        alt="Starlim"
        className="h-auto w-[148px] object-contain"
        height={67}
        priority
        src="/starlim-logo-white.png"
        width={148}
      />
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
  let indicators = emptyNavigationIndicators();
  const fallbackAuthorization: NavigationAuthorization = {
    allowedPermissionKeys: new Set<string>(),
  };
  const authorization =
    navigationAuthorization ??
    (await withTimeout(
      getNavigationAuthorization(session),
      NAVIGATION_AUTHORIZATION_TIMEOUT_MS,
      fallbackAuthorization,
    ));
  const sections = authorizedNavigationSections(authorization);
  const sellerMobile = normalizeRole(session.role) === "vendedor";
  const mobileSections = sellerMobile
    ? sections
        .filter((section) => section.label === "Inicio" || section.label === "CRM")
        .map((section) => section.label === "Inicio"
          ? { ...section, groups: section.groups.filter((group) => group.active === "supervisor-lab") }
          : section)
        .filter((section) => section.groups.length > 0)
    : sections;

  indicators = await withTimeout(
    getNavigationIndicators(session),
    NAVIGATION_INDICATORS_TIMEOUT_MS,
    emptyNavigationIndicators(),
  ).catch(() => emptyNavigationIndicators());

  return (
    <div className={cn("min-h-screen overflow-visible bg-[#f5f7fb] text-foreground lg:grid lg:h-screen lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden lg:overscroll-none", sellerMobile && "seller-mobile-shell")}>
      <SessionKeepAlive />
      <MessageNotifier />
      <MessageNotifications
        currentUsername={session.username}
        initialLatestMessage={null}
        initialUnread={0}
        initialRevision=""
      />
      <aside className="erp-sidebar-texture sticky top-0 hidden h-screen overflow-hidden overscroll-none border-r border-[#0750bd] bg-[linear-gradient(180deg,#0b6cff_0%,#075ac7_48%,#073f94_100%)] text-white shadow-[8px_0_30px_rgba(7,63,148,0.22)] lg:flex lg:flex-col">
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
        <header className="sticky top-0 z-30 border-b border-[#d9e2ef] bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.045)] backdrop-blur">
          <div className="hidden min-h-[4.25rem] items-center justify-between gap-4 px-7 lg:flex">
            <div className="min-w-0">
              <h1 className="erp-text-title-md truncate font-extrabold tracking-normal text-[#0f172a]">{title}</h1>
              <p className="erp-text-body-sm mt-0.5 truncate font-medium text-[#64748b]">{description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PresenceIndicator />
              <div className="erp-text-caption flex h-10 max-w-[360px] items-center truncate rounded-[9px] border border-[#d9e2ef] bg-[#f8fafc] px-3 shadow-[var(--shadow-xs)]">
                <span className="font-bold">{session.displayName}</span>
                <span className="font-medium text-[#64748b]"> - {session.role} - {session.companyName}</span>
              </div>
              <LogoutButton className="h-10 min-h-10 px-4" />
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
                <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-16 z-40 overflow-y-auto overscroll-contain border-b border-[#0750bd] bg-[linear-gradient(180deg,#0b6cff_0%,#075ac7_55%,#073f94_100%)] p-4 pb-7 text-white shadow-[var(--shadow-md)]">
                  <ShellNavigation active={active} indicators={indicators} sections={mobileSections} />
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

        <section className="erp-shell-content mx-auto min-w-0 max-w-[1480px] px-4 pb-24 pt-5 sm:px-6 lg:px-7 lg:pb-28 lg:pt-6">
          {children}
        </section>
        {sellerMobile ? <SellerMobileNavigation /> : null}
      </main>
    </div>
  );
}
