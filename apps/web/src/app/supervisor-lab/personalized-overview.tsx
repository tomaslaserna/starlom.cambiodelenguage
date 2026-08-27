import Link from "next/link";
import { Card } from "@/components/ui";
import type { SupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";

const toneClass = {
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  warning: "border-[#fed7aa] bg-[#fff7ed] text-[#b45309]",
  success: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  neutral: "border-[#d9e2ef] bg-white text-[#334155]",
} as const;

export function PersonalizedOverview({ summary }: { summary: SupervisorLandingSummary }) {
  return (
    <section aria-labelledby="supervisor-personalized-title" className="grid gap-4">
      <div className="text-center">
        <span className="inline-flex rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-extrabold text-[#075ac7]">
          Perfil: {summary.profileLabel}
        </span>
        <h2 className="text-xl font-extrabold text-[#0f172a]" id="supervisor-personalized-title">
          {summary.greeting}
        </h2>
        <p className="mt-1 text-sm font-medium text-[#64748b]">{summary.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.cards.map((card) => (
          <Link href={card.href} key={card.label}>
            <Card className={`grid h-full gap-2 border p-4 text-center transition-transform hover:-translate-y-0.5 ${toneClass[card.tone]}`}>
              <span className="text-3xl font-black tabular-nums">{card.value}</span>
              <strong className="text-sm">{card.label}</strong>
              <span className="text-xs font-medium opacity-80">{card.detail}</span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
