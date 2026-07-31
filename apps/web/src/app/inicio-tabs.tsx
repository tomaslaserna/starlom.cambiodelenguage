"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

type InicioTab = { key: string; label: string; count: number; content: ReactNode };

export function InicioTabs({ tabs }: { tabs: InicioTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 border-b border-[#e5ebf4] pb-1">
        {tabs.map((tab) => {
          const isActive = current?.key === tab.key;
          return (
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-t-[9px] px-4 py-2 text-sm font-bold transition-colors",
                isActive ? "bg-white text-[#0f172a] shadow-[inset_0_-2px_0_#2563eb]" : "text-[#64748b] hover:text-[#0f172a]",
              )}
              key={tab.key}
              onClick={() => setActive(tab.key)}
              type="button"
            >
              {tab.label}
              <span
                className={cn(
                  "inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-xs font-bold",
                  isActive ? "bg-[#eaf2ff] text-[#2563eb]" : "bg-[#eef2f8] text-[#64748b]",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
