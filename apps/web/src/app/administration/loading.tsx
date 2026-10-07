export default function AdministrationLoading() {
  return (
    <div className="grid min-h-[420px] place-items-center px-6 py-12">
      <div className="grid justify-items-center gap-3 text-center">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#dbeafe] border-t-[#2563eb]" />
        <div>
          <p className="font-semibold text-[#0f172a]">Preparando Administración</p>
          <p className="mt-1 text-sm text-[#64748b]">Consolidando resultados, tesorería y obligaciones.</p>
        </div>
      </div>
    </div>
  );
}
