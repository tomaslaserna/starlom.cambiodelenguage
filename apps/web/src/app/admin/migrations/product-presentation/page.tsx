import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { applyProductPresentationMigrationAction } from "@/app/admin/migrations/product-presentation/actions";

export default async function ProductPresentationMigrationPage({ searchParams }: { searchParams: Promise<{ applied?: string }> }) {
  const session = await requireStaffSession();
  if (!isAdminRole(session.role)) redirect("/");
  const { applied } = await searchParams;
  return (
    <ModulePage active="admin" description="Migración controlada de presentaciones de productos." session={session} title="Actualizar productos">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Presentaciones por producto</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {applied ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 font-semibold text-emerald-800">Migración aplicada y verificada correctamente.</p>
          ) : (
            <>
              <p className="text-sm text-[color:var(--muted)]">Agrega el campo de presentación con valor inicial 1. No modifica nombres, costos, stock ni precios actuales.</p>
              <form action={applyProductPresentationMigrationAction}><Button type="submit">Aplicar y verificar migración</Button></form>
            </>
          )}
          <ButtonLink href="/admin" variant="outline">Volver</ButtonLink>
        </CardContent>
      </Card>
    </ModulePage>
  );
}
