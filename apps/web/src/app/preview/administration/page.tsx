import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import type { ComponentProps } from 'react';
import { TreasuryWorkspace } from '@/app/administration/treasury-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tesorería · revisión local | Starlim', robots: { index: false, follow: false } };

export default async function AdministrationPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  let snapshot: ComponentProps<typeof TreasuryWorkspace> & { capturedAt: string };
  try { snapshot=JSON.parse(await readFile(path.join(process.cwd(),'.local/administration-preview.json'),'utf8')); }
  catch { notFound(); }
  return <main className="min-h-screen bg-[#f3f6fc] pb-12 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-6 py-5"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Administración</h1><p className="mt-1 text-sm text-slate-500">Tesorería · caja, cobros y proyección</p></div><span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Vista local · sin publicar</span></div></header>
    <div className="mx-auto max-w-7xl space-y-5 px-4 pt-6 sm:px-6">
      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Copia de datos reales al 20/11/2026. Esta revisión no registra pagos ni modifica saldos. El selector mensual de producción conserva su funcionamiento habitual.</p>
      <TreasuryWorkspace treasury={snapshot.treasury} cashflow={snapshot.cashflow} collections={snapshot.collections}
        reconciliation={snapshot.reconciliation} reconciliationWorkspace={snapshot.reconciliationWorkspace}
        canWriteTreasury={false} month="2026-11" today="2026-11-20" period={{kind:'month',key:'2026-11'}} />
    </div>
  </main>;
}
