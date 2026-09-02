import CustomerDetailPage from "@/app/customers/[id]/page";

export default function CrmCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerDetailPage crmMode params={params} />;
}
