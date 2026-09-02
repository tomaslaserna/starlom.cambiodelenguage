"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, ButtonLink, cn } from "@/components/ui";
import type { AppIconName } from "@/components/ui/app-icon";

const SECTIONS: Array<{ href: string; label: string; icon: AppIconName }> = [
  { href: "/crm/perfil", label: "Mi día", icon: "chart" },
  { href: "/crm/clientes", label: "Clientes", icon: "user" },
  { href: "/crm/leads", label: "Leads", icon: "trend" },
  { href: "/crm/presupuestos", label: "Presupuestos", icon: "quote" },
  { href: "/crm/cobros", label: "Cobros", icon: "wallet" },
  { href: "/crm/calendario", label: "Agenda", icon: "calendar" },
  { href: "/crm/listas", label: "Precios", icon: "package" },
];

export function CrmCommandBar() {
  const pathname = usePathname();

  return (
    <section aria-label="Centro de trabajo comercial" className="mb-5 overflow-hidden rounded-[18px] border border-[#cfe0f7] bg-white shadow-[0_14px_34px_rgba(15,74,150,0.08)]">
      <div className="flex flex-col gap-3 border-b border-[#e3ebf5] bg-[linear-gradient(115deg,#edf5ff_0%,#ffffff_52%,#fff8e9_100%)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#075ac7]">
            <span className="h-2 w-2 rounded-full bg-[#ffb238]" />
            Centro comercial
          </div>
          <p className="mt-1 text-sm font-semibold text-[#526174]">Contactá, cotizá y hacé seguimiento sin perder el próximo paso.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <ButtonLink href="/crm/leads?nuevo=1" leadingIcon={<AppIcon className="h-4 w-4" name="trend" />} size="sm" variant="secondary">Nuevo lead</ButtonLink>
          <ButtonLink href="/crm/presupuestos/nuevo" leadingIcon={<AppIcon className="h-4 w-4" name="quote" />} size="sm">Presupuestar</ButtonLink>
        </div>
      </div>
      <nav aria-label="Secciones del CRM" className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:thin] sm:px-3">
        {SECTIONS.map((section) => {
          const current = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] px-3 text-sm font-bold text-[#526174] transition hover:bg-[#edf5ff] hover:text-[#075ac7]",
                current && "bg-[#075ac7] text-white shadow-[0_8px_18px_rgba(7,90,199,0.22)] hover:bg-[#075ac7] hover:text-white",
              )}
              href={section.href}
              key={section.href}
            >
              <AppIcon className="h-4 w-4" name={section.icon} />
              {section.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
