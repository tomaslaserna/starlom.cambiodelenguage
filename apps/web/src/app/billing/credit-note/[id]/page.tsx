import { FiscalNotePage } from "@/app/billing/fiscal-note-page";

type CreditNotePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default function CreditNotePage(props: CreditNotePageProps) {
  return <FiscalNotePage {...props} kind="credit_note" />;
}
