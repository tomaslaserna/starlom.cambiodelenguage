import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { listBank } from "@/lib/bank-store";
import { BankClient } from "@/app/bank/bank-client";

export default async function BankPage() {
  const session = await requireStaffSession();
  const [personal, shared] = await Promise.all([
    listBank(session, "personal"),
    listBank(session, "shared"),
  ]);

  return (
    <ModulePage
      active="bank"
      description="Tu espacio de archivos: guardá lo que necesitás para tu día a día y accedé a los documentos de la empresa."
      session={session}
      title="Banco"
    >
      <BankClient personal={personal} shared={shared} />
    </ModulePage>
  );
}
