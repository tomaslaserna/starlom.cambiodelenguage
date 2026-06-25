"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";
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
        "erp-text-caption ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold",
        active ? "bg-[color:var(--accent)] text-white" : "bg-[color:var(--danger)] text-white",
      )}
    >
      {value}
    </span>
  );
}

function navigationRowClass(active: boolean) {
  return cn(
    "erp-text-body-sm flex min-h-9 items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 font-medium transition-colors",
    active
      ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-[color:var(--foreground)]"
      : "border-transparent text-[color:var(--muted)] hover:bg-[color:var(--hover)] hover:text-[color:var(--foreground)]",
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
        "erp-text-body-sm flex min-h-9 items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 transition-colors lg:min-h-8",
        itemCurrent
          ? "bg-[color:var(--panel-subtle)] font-semibold text-[color:var(--foreground)]"
          : "text-[color:var(--muted)] hover:bg-[color:var(--hover)] hover:text-[color:var(--foreground)]",
      )}
      href={item.href}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Badge active={itemCurrent} value={itemBadge} />
    </Link>
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
  const childHrefs = (group.items ?? []).map((item) => item.href);

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
        <span aria-hidden="true" className="erp-text-caption transition-transform group-open:rotate-90">
          &gt;
        </span>
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <Badge active={activeGroup} value={groupBadge} />
      </summary>
      <div className="mt-1 grid gap-1 pl-4">
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
    </details>
  );
}

export function ShellNavigation({ active, indicators, sections }: ShellNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current: CurrentLocation = {
    pathname,
    searchParams: new URLSearchParams(searchParams.toString()),
  };

  return (
    <nav aria-label="Navegacion principal" className="grid gap-5">
      {sections.map((section) => (
        <section className="grid gap-1" key={section.label}>
          <h2 className="erp-text-caption px-2.5 font-semibold uppercase tracking-normal text-[color:var(--muted)]">
            {section.label}
          </h2>
          <div className="grid gap-1">
            {section.groups.map((group) => (
              <NavigationGroupBlock
                active={active}
                current={current}
                group={group}
                indicators={indicators}
                key={group.label}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
