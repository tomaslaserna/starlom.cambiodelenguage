import { FiscalNotePage } from "@/app/billing/fiscal-note-page";

type DebitNotePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default function DebitNotePage(props: DebitNotePageProps) {
  return <FiscalNotePage {...props} kind="debit_note" />;
}
