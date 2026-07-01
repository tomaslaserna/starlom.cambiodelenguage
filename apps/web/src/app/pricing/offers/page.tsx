import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  createOfferAction,
  toggleOfferActiveAction,
  updateOfferAction,
} from "@/app/pricing/offers/actions";
import { requireStaffSession } from "@/lib/auth";
import { getOffer, listOffers } from "@/lib/offers";
import { getOrderFormData } from "@/lib/orders";
import { sessionCanReadProducts } from "@/lib/route-auth";

type OffersPageProps = {
  searchParams: Promise<{ edit?: string }>;
};

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");
  const { edit } = await searchParams;

  const [offers, formData] = await Promise.all([
    listOffers(session.companyId),
    getOrderFormData(session.companyId),
  ]);
  const products = formData.products;
  const editing = edit ? await getOffer(session.companyId, edit).catch(() => null) : null;

  return (
    <ModulePage
      active="pricing"
      description="Ofertas para sumar a las confirmaciones de pedido."
      session={session}
      title="Ofertas"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Ofertas"
          description="Alta y gestion de ofertas vigentes para el generador de WhatsApp."
          actions={
            <ButtonLink href="/pricing" size="sm" variant="secondary">
              Volver a Precios
            </ButtonLink>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar oferta" : "Nueva oferta"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={editing ? updateOfferAction : createOfferAction} className="grid gap-3">
              {editing ? <input name="id" type="hidden" value={editing.id} /> : null}
              <Field htmlFor="offer-title" label="Titulo">
                <Input
                  id="offer-title"
                  name="title"
                  defaultValue={editing?.title ?? ""}
                  placeholder="Oferta de la semana"
                  required
                />
              </Field>
              <Field htmlFor="offer-description" label="Texto (linea de la confirmacion)">
                <textarea
                  className="erp-text-body-sm min-h-20 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--field)] px-3 py-2 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                  id="offer-description"
                  name="description"
                  defaultValue={editing?.description ?? ""}
                  placeholder="Llevando 2 bobinas, la 2da unidad 50% OFF"
                  required
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field htmlFor="offer-product" label="Producto (opcional)">
                  <Select id="offer-product" name="productId" defaultValue={editing?.productId ?? ""}>
                    <option value="">Sin producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="offer-active" label="Estado">
                  <Select
                    id="offer-active"
                    name="active"
                    defaultValue={editing && !editing.active ? "inactiva" : "activa"}
                  >
                    <option value="activa">Activa</option>
                    <option value="inactiva">Inactiva</option>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{editing ? "Guardar cambios" : "Crear oferta"}</Button>
                {editing ? (
                  <ButtonLink href="/pricing/offers" variant="secondary">
                    Cancelar
                  </ButtonLink>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable caption="Listado de ofertas" tableLabel="Ofertas">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Titulo</DataTableHead>
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead align="right">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {offers.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={4}>
                    <EmptyState
                      description="Crea la primera oferta con el formulario de arriba."
                      title="No hay ofertas"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                offers.map((offer) => (
                  <DataTableRow key={offer.id}>
                    <DataTableCell>
                      <div className="font-medium">{offer.title}</div>
                      <div className="line-clamp-2 text-xs text-[color:var(--muted)]">{offer.description}</div>
                    </DataTableCell>
                    <DataTableCell>{offer.productName ?? "—"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={offer.active ? "success" : "neutral"}>
                        {offer.active ? "Activa" : "Inactiva"}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ButtonLink href={`/pricing/offers?edit=${offer.id}`} size="sm" variant="secondary">
                          Editar
                        </ButtonLink>
                        <form action={toggleOfferActiveAction}>
                          <input name="id" type="hidden" value={offer.id} />
                          <input name="active" type="hidden" value={offer.active ? "inactiva" : "activa"} />
                          <Button size="sm" type="submit" variant="secondary">
                            {offer.active ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
