import { redirect } from "next/navigation";

export default function NewCustomerPage() {
  redirect("/customers#crear-cliente");
}
