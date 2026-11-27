"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiSession, SALES_OPERATE_PERMISSION } from "@/lib/route-auth";
import { uuidParam } from "@/lib/request-body";
import { executeFiscalReissue } from "@/lib/fiscal-reissue";
export async function reissueAction(form: FormData) {
  const session = await requireApiSession([SALES_OPERATE_PERMISSION]);
  const saleId = uuidParam(String(form.get("saleId") ?? ""), "Venta");
  let message = "";
  try {
    await executeFiscalReissue(
      session,
      saleId,
      String(form.get("reason") ?? ""),
      String(form.get("originalName") ?? ""),
      String(form.get("fingerprint") ?? ""),
      form.get("mode") === "net_returns",
    );
  } catch (error) {
    message = error instanceof Error ? error.message : "Error fiscal";
  }
  revalidatePath("/billing");
  revalidatePath(`/billing/reissue/${saleId}`);
  redirect(
    `/billing/reissue/${saleId}?message=${encodeURIComponent(message || "Refacturación completada.")}`,
  );
}
