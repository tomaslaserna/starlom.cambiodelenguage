"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AppIcon, cn } from "@/components/ui";
import type {
  NavigationBadgeKey,
  NavigationGroup,
  NavigationIndicators,
  NavigationItem,
  NavigationSection,
} from "@/lib/navigation";

type ShellNavigationProps = {
  active: string;
  indicators: NavigationIndicators;
  sections: NavigationSection[];
};

type CurrentLocation = {
  pathname: string;
  searchParams: URLSearchParams;
};

function badgeValue(badge: NavigationBadgeKey | undefined, indicators: NavigationIndicators) {
  return badge ? indicators[badge] ?? 0 : 0;
}

function groupIsActive(group: NavigationGroup, active: string) {
  return group.active === active || Boolean(group.items?.some((item) => item.active === active));
}

function groupBadgeValue(group: NavigationGroup, indicators: NavigationIndicators) {
  return (
    badgeValue(group.badge, indicators) ||
    (group.items ?? []).reduce((sum, item) => sum + badgeValue(item.badge, indicators), 0)
  );
}

function sectionIsActive(section: NavigationSection, active: string) {
  return section.groups.some((group) => groupIsActive(group, active));
}

function sectionBadgeValue(section: NavigationSection, indicators: NavigationIndicators) {
  return section.groups.reduce((sum, group) => sum + groupBadgeValue(group, indicators), 0);
}

function hrefParts(href: string) {
  const url = new URL(href, "https://starlim.local");
  return { pathname: url.pathname, searchParams: url.searchParams };
}

function searchParamsMatch(expected: URLSearchParams, current: URLSearchParams) {
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function hasSearchParams(params: URLSearchParams) {
  return Array.from(params.keys()).length > 0;
}

function hrefMatchesCurrent(href: string, current: CurrentLocation, competingHrefs: string[]) {
  const target = hrefParts(href);
  if (target.pathname !== current.pathname) return false;

  if (hasSearchParams(target.searchParams)) {
    return searchParamsMatch(target.searchParams, current.searchParams);
  }

  return !competingHrefs.some((competingHref) => {
    if (competingHref === href) return false;
    const competing = hrefParts(competingHref);
    return (
      competing.pathname === current.pathname &&
      hasSearchParams(competing.searchParams) &&
      searchParamsMatch(competing.searchParams, current.searchParams)
    );
  });
}

function Badge({ value, active }: { value: number; active?: boolean }) {
  if (value <= 0) return null;
  return (
    <span
      aria-label={`${value} pendientes`}
      className={cn(
        "erp-text-caption ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold",
        active ? "bg-white text-[#0b4fc7]" : "bg-white/16 text-white",
      )}
    >
      {value}
    </span>
  );
}

function navigationRowClass(active: boolean) {
  return cn(
    "erp-display-font erp-text-body-sm flex min-h-10 items-center gap-2 rounded-[10px] border px-3 py-2 font-semibold transition-[background-color,border-color,color,box-shadow]",
    active
      ? "border-white/26 bg-white text-[#0b4fc7] shadow-[0_10px_22px_rgba(5,32,85,0.18)]"
      : "border-transparent text-white/82 hover:border-white/18 hover:bg-white/10 hover:text-white",
  );
}

function NavigationItemLink({
  activeGroup,
  competingHrefs,
  current,
  indicators,
  item,
}: {
  activeGroup: boolean;
  competingHrefs: string[];
  current: CurrentLocation;
  indicators: NavigationIndicators;
  item: NavigationItem;
}) {
  const itemCurrent = activeGroup && hrefMatchesCurrent(item.href, current, competingHrefs);
  const itemBadge = badgeValue(item.badge, indicators);

  return (
    <Link
      aria-current={itemCurrent ? "page" : undefined}
      className={cn(
        "erp-display-font erp-text-body-sm flex min-h-9 items-center gap-2 rounded-[8px] px-2.5 py-1.5 font-medium transition-colors lg:min-h-8",
        itemCurrent
          ? "bg-white font-medium text-[#0b4fc7] shadow-[inset_2px_0_0_#2563eb]"
          : "text-white/74 hover:bg-white/10 hover:text-white",
      )}
      href={item.href}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Badge active={itemCurrent} value={itemBadge} />
    </Link>
  );
}

function GroupItemsList({
  activeGroup,
  current,
  group,
  indicators,
}: {
  activeGroup: boolean;
  current: CurrentLocation;
  group: NavigationGroup;
  indicators: NavigationIndicators;
}) {
  const childHrefs = (group.items ?? []).map((item) => item.href);

  return (
    <div className="mt-1.5 grid gap-1 border-l border-white/18 pl-4">
      {(group.items ?? []).map((item) => (
        <NavigationItemLink
          activeGroup={activeGroup}
          competingHrefs={childHrefs}
          current={current}
          indicators={indicators}
          item={item}
          key={item.href}
        />
      ))}
    </div>
  );
}

function isRedundantSoleGroup(section: NavigationSection) {
  const [group] = section.groups;
  return (
    section.groups.length === 1 &&
    !group.href &&
    Boolean(group.items) &&
    group.label.trim().toLowerCase() === section.label.trim().toLowerCase()
  );
}

function NavigationGroupBlock({
  active,
  current,
  group,
  indicators,
}: {
  active: string;
  current: CurrentLocation;
  group: NavigationGroup;
  indicators: NavigationIndicators;
}) {
  const activeGroup = groupIsActive(group, active);
  const groupBadge = groupBadgeValue(group, indicators);

  if (group.href) {
    const groupCurrent = hrefMatchesCurrent(group.href, current, []);
    return (
      <Link
        aria-current={groupCurrent ? "page" : undefined}
        className={navigationRowClass(groupCurrent || activeGroup)}
        href={group.href}
      >
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <Badge active={groupCurrent || activeGroup} value={groupBadge} />
      </Link>
    );
  }

  return (
    <details className="group" open={activeGroup || undefined}>
      <summary className={cn("cursor-pointer list-none", navigationRowClass(activeGroup))}>
        <span aria-hidden="true" className="erp-text-caption w-3 shrink-0 text-center transition-transform group-open:rotate-90">
          &gt;
        </span>
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <Badge active={activeGroup} value={groupBadge} />
      </summary>
      <GroupItemsList activeGroup={activeGroup} current={current} group={group} indicators={indicators} />
    </details>
  );
}

const sectionSummaryClass = (activeSection: boolean) =>
  cn(
    "erp-display-font erp-text-body-sm flex min-h-11 items-center gap-2 rounded-[10px] border px-3 py-2 font-semibold uppercase tracking-[0.01em] transition-[background-color,border-color,color,box-shadow]",
    activeSection
      ? "border-white/26 bg-white/16 text-white shadow-[0_10px_22px_rgba(5,32,85,0.14)]"
      : "border-white/10 bg-white/6 text-white/82 hover:border-white/18 hover:bg-white/10 hover:text-white",
  );

function SectionAccordion({
  active,
  current,
  indicators,
  section,
}: {
  active: string;
  current: CurrentLocation;
  indicators: NavigationIndicators;
  section: NavigationSection;
}) {
  const activeSection = sectionIsActive(section, active);
  const sectionBadge = sectionBadgeValue(section, indicators);

  return (
    <details className="group/section" open={activeSection || undefined}>
      <summary className={cn("cursor-pointer list-none", sectionSummaryClass(activeSection))}>
        <span aria-hidden="true" className="erp-text-caption w-3 shrink-0 text-center transition-transform group-open/section:rotate-90">
          &gt;
        </span>
        {section.icon ? <AppIcon aria-hidden="true" className="h-4 w-4 shrink-0" name={section.icon} /> : null}
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        <Badge active={activeSection} value={sectionBadge} />
      </summary>
      <div className="mt-1.5 grid gap-1 pb-2 pl-2">
        {isRedundantSoleGroup(section) ? (
          <GroupItemsList activeGroup={activeSection} current={current} group={section.groups[0]} indicators={indicators} />
        ) : (
          section.groups.map((group) => (
            <NavigationGroupBlock active={active} current={current} group={group} indicators={indicators} key={group.label} />
          ))
        )}
      </div>
    </details>
  );
}

// Segundo mundo del CRM: retorno al sistema + Modo CRM (items planos) + Inicio
// (menu incondicional compartido: escritorio, calendario, mensajes, banco).
function CrmWorldNavigation({
  active,
  current,
  crmSection,
  inicioSection,
  indicators,
}: {
  active: string;
  current: CurrentLocation;
  crmSection: NavigationSection;
  inicioSection?: NavigationSection;
  indicators: NavigationIndicators;
}) {
  return (
    <nav aria-label="Navegacion CRM" className="grid gap-2">
      <Link className={cn(navigationRowClass(false), "crm-system-return text-[#93b4ff]")} href="/">
        <span aria-hidden="true" className="erp-text-caption w-3 shrink-0 text-center">
          &lt;
        </span>
        <span className="min-w-0 flex-1 truncate">Volver al sistema</span>
      </Link>
      <div className="erp-text-caption mt-1 flex items-center gap-2 rounded-[999px] border border-white/16 bg-white/10 px-3 py-1.5 font-semibold uppercase tracking-[0.08em] text-white/72">
        {crmSection.icon ? <AppIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" name={crmSection.icon} /> : null}
        Modo CRM
      </div>
      <div className="mt-1 grid gap-1">
        {crmSection.groups.map((group) => (
          <NavigationGroupBlock active={active} current={current} group={group} indicators={indicators} key={group.label} />
        ))}
      </div>
      {inicioSection ? (
        <div className="mt-2">
          <SectionAccordion active={active} current={current} indicators={indicators} section={inicioSection} />
        </div>
      ) : null}
    </nav>
  );
}

export function ShellNavigation({ active, indicators, sections }: ShellNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current: CurrentLocation = {
    pathname,
    searchParams: new URLSearchParams(searchParams.toString()),
  };

  // Segundo mundo: dentro del CRM se muestra su propia barra (retorno + items).
  const inCrmWorld = pathname.startsWith("/crm");
  const crmSection = sections.find((section) => section.label === "CRM");
  const inicioSection = sections.find((section) => section.label === "Inicio");
  if (inCrmWorld && crmSection) {
    return (
      <CrmWorldNavigation
        active={active}
        current={current}
        crmSection={crmSection}
        inicioSection={inicioSection}
        indicators={indicators}
      />
    );
  }

  return (
    <nav aria-label="Navegacion principal" className="grid gap-2">
      {sections.map((section) => {
        // La seccion CRM es una puerta de entrada: un link directo al segundo mundo.
        if (section.label === "CRM") {
          return (
            <Link className={sectionSummaryClass(false)} href="/crm/clientes" key={section.label}>
              {section.icon ? <AppIcon aria-hidden="true" className="h-4 w-4 shrink-0" name={section.icon} /> : null}
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <span aria-hidden="true" className="erp-text-caption shrink-0 text-white/50">&gt;</span>
            </Link>
          );
        }

        return (
          <SectionAccordion active={active} current={current} indicators={indicators} key={section.label} section={section} />
        );
      })}
    </nav>
  );
}
