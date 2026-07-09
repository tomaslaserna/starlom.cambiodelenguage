"use server";

import { revalidatePath } from "next/cache";
import { createPartner, createSalaryPlan, partnerInputFromBody, salaryPlanInputFromBody } from "@/lib/finance";
import { stringFieldsFromFormData } from "@/lib/storage";
import {
  ADMIN_DIVIDENDS_WRITE_PERMISSION,
  ADMIN_SALARIES_WRITE_PERMISSION,
  requireApiSession,
} from "@/lib/route-auth";

export async function createSalaryPlanAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_SALARIES_WRITE_PERMISSION]);
  await createSalaryPlan(session.companyId, salaryPlanInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/balance/remunerations");
}

export async function createPartnerAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_DIVIDENDS_WRITE_PERMISSION]);
  await createPartner(session.companyId, partnerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/balance/remunerations");
}
