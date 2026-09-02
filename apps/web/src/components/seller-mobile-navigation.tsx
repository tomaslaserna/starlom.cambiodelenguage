"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppIcon, cn } from "@/components/ui";
import type { AppIconName } from "@/components/ui/app-icon";

const ITEMS: Array<{ href: string; label: string; icon: AppIconName }> = [
  { href: "/crm/perfil", label: "Inicio", icon: "chart" },
  { href: "/crm/clientes", label: "Clientes", icon: "search" },
  { href: "/crm/presupuestos", label: "Presup.", icon: "quote" },
  { href: "/crm/listas", label: "Precios", icon: "package" },
];

const QUICK_ACTIONS: Array<{ href: string; label: string; description: string; icon: AppIconName }> = [
  { href: "/crm/clientes/nuevo", label: "Crear cliente", description: "Dar de alta una cuenta nueva", icon: "search" },
  { href: "/crm/leads?nuevo=1", label: "Crear lead", description: "Registrar un prospecto en el acto", icon: "clock" },
  { href: "/crm/presupuestos/nuevo", label: "Hacer presupuesto", description: "Cotizar y cerrar con el cliente", icon: "quote" },
];

export function SellerMobileNavigation() {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (!quickOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [quickOpen]);

  return (
    <nav aria-label="Navegación comercial móvil" className="seller-mobile-navigation lg:hidden">
      {quickOpen ? (
        <>
          <button aria-label="Cerrar acciones rápidas" className="seller-mobile-navigation__backdrop" onClick={() => setQuickOpen(false)} type="button" />
          <section aria-label="Acciones rápidas de venta" className="seller-mobile-navigation__quick-menu">
            <div className="mb-3">
              <strong className="block text-base text-[#0f172a]">Nueva gestión</strong>
              <span className="text-xs font-semibold text-[#64748b]">Resolvé la venta junto al cliente</span>
            </div>
            <div className="grid gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Link className="seller-mobile-navigation__quick-action" href={action.href} key={action.href} onClick={() => setQuickOpen(false)}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#075ac7]"><AppIcon className="h-5 w-5" name={action.icon} /></span>
                  <span className="min-w-0"><strong className="block text-sm text-[#0f172a]">{action.label}</strong><span className="block text-xs font-medium text-[#64748b]">{action.description}</span></span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {ITEMS.slice(0, 2).map((item) => {
        const current = pathname.startsWith(item.href);
        return (
          <Link aria-current={current ? "page" : undefined} className={cn("seller-mobile-navigation__item", current && "is-current")} href={item.href} key={item.href}>
            <AppIcon className="h-5 w-5" name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <span className="seller-mobile-navigation__create-slot">
        <button aria-expanded={quickOpen} aria-label="Crear cliente, lead o presupuesto" className={cn("seller-mobile-navigation__create", quickOpen && "is-open")} onClick={() => setQuickOpen((value) => !value)} type="button">+</button>
      </span>
      {ITEMS.slice(2).map((item) => {
        const current = pathname.startsWith(item.href);
        return (
          <Link aria-current={current ? "page" : undefined} className={cn("seller-mobile-navigation__item", current && "is-current")} href={item.href} key={item.href} onClick={() => setQuickOpen(false)}>
            <AppIcon className="h-5 w-5" name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
