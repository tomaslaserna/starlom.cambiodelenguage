import CustomersPage from "@/app/customers/page";

export default function NewCrmCustomerPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; created?: string }> }) {
  return <CustomersPage crmMode searchParams={searchParams} />;
}
