import { createCustomerAction } from "@/app/customers/actions";
import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { CUSTOMER_RECEIPT_OPTIONS } from "@/lib/catalog-management";
import { CUSTOMER_BUSINESS_SEGMENTS } from "@/lib/customer-segments";
import { fastOr } from "@/lib/fast-data";
import { FISCAL_CONDITION_OPTIONS } from "@/lib/fiscal-conditions";
import { getNavigationAuthorization } from "@/lib/navigation";
import { requirePagePermission } from "@/lib/page-auth";
import { listPriceLists } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";

export default async function NewCustomerPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "clientes", action: "crear" }]);

  const [navigationAuthorization, priceLists] = await Promise.all([
    fastOr(
      getNavigationAuthorization(session),
      { allowedPermissionKeys: new Set<string>() },
      60,
    ),
    listPriceLists(session.companyId, true),
  ]);
  const activePriceLists = priceLists.filter((list) => list.active);

  return (
    <ModulePage
      active="database"
      description="Alta de un cliente con sus datos comerciales, fiscales y de contacto."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="Nuevo cliente"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/customers" variant="secondary">Volver a clientes</ButtonLink>}
          description="Completá los datos disponibles. Después podrás ampliar o corregir la ficha del cliente."
          moduleIntro
          title="Nuevo cliente"
        />

        <Card className="p-4">
          <form action={createCustomerAction} className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-5">
              <Field htmlFor="customer-segment" label="Rubro comercial">
                <Select defaultValue="" id="customer-segment" name="businessSegment">
                  <option value="">Sin clasificar</option>
                  {CUSTOMER_BUSINESS_SEGMENTS.map((segment) => (
                    <option key={segment} value={segment}>{segment}</option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="customer-name" label="Cliente" required>
                <Input autoFocus id="customer-name" name="name" required />
              </Field>
              <Field htmlFor="customer-business" label="Razón social">
                <Input id="customer-business" name="businessName" />
              </Field>
              <Field htmlFor="customer-tax-id" label="CUIT/DNI">
                <Input id="customer-tax-id" name="taxId" />
              </Field>
              <Field htmlFor="customer-vat" label="Condición IVA">
                <Select defaultValue="Consumidor Final" id="customer-vat" name="vatCondition">
                  {FISCAL_CONDITION_OPTIONS.map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="customer-receipt-type" label="Comprobante asociado" required>
                <Select defaultValue="" id="customer-receipt-type" name="receiptType" required>
                  <option disabled value="">Seleccionar comprobante</option>
                  {CUSTOMER_RECEIPT_OPTIONS.map((receiptType) => (
                    <option key={receiptType} value={receiptType}>{receiptType}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              <Field htmlFor="customer-phone" label="Teléfono">
                <Input id="customer-phone" name="phone" />
              </Field>
              <Field htmlFor="customer-price-list" label="Lista">
                <Select defaultValue={activePriceLists[0]?.name ?? ""} id="customer-price-list" name="priceList">
                  {activePriceLists.length === 0 ? <option value="">Sin listas activas</option> : null}
                  {activePriceLists.map((list) => (
                    <option key={list.id} value={list.name}>{list.name}</option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="customer-seller" label="Vendedor">
                <Input id="customer-seller" name="seller" />
              </Field>
              <Field htmlFor="customer-assigned-seller" label="Vendedor asignado (a cargo)">
                <Input id="customer-assigned-seller" name="assignedSeller" />
              </Field>
              <Field htmlFor="customer-city" label="Ciudad">
                <Input id="customer-city" name="city" />
              </Field>
              <Field htmlFor="customer-province" label="Provincia">
                <Input id="customer-province" name="province" />
              </Field>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
              <Field htmlFor="customer-address" label="Dirección">
                <Input id="customer-address" name="address" />
              </Field>
              <Field htmlFor="customer-observation" label="Observación">
                <Textarea id="customer-observation" name="observation" rows={2} />
              </Field>
              <Button type="submit">Crear cliente</Button>
            </div>
          </form>
        </Card>
      </div>
    </ModulePage>
  );
}
