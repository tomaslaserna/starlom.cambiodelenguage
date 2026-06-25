import Link from "next/link";
import { cn } from "@/components/ui";

type SectionTab = {
  href: string;
  label: string;
  active?: boolean;
  badge?: number;
};

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav aria-label="Secciones" className="erp-text-body-sm flex flex-wrap gap-2 font-medium">
      {tabs.map((tab) => (
        <Link
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 transition-colors",
            tab.active
              ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
              : "border-[color:var(--border)] bg-[color:var(--panel)] hover:bg-[color:var(--hover)]",
          )}
          href={tab.href}
          key={tab.href}
        >
          <span>{tab.label}</span>
          {tab.badge && tab.badge > 0 ? (
            <span
              aria-label={`${tab.badge} pendientes`}
              className={`erp-text-caption rounded-full px-2 py-0.5 ${
                tab.active ? "bg-white text-[color:var(--accent)]" : "bg-[color:var(--danger)] text-white"
              }`}
            >
              {tab.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
