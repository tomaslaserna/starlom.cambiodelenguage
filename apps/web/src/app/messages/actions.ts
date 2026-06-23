"use server";

import { revalidatePath } from "next/cache";
import {
  draftMessageInputFromBody,
  markMessagesRead,
  messageInputFromBody,
  saveMessageDraft,
  sendMessage,
} from "@/lib/messages";
import { requireApiSession } from "@/lib/route-auth";

function formBody(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function sendMessageAction(formData: FormData) {
  const session = await requireApiSession();
  await sendMessage(session, messageInputFromBody(formBody(formData)));
  revalidatePath("/messages");
}

export async function saveDraftAction(formData: FormData) {
  const session = await requireApiSession();
  await saveMessageDraft(session, draftMessageInputFromBody(formBody(formData)));
  revalidatePath("/messages");
}

export async function markInboxReadAction() {
  const session = await requireApiSession();
  await markMessagesRead(session);
  revalidatePath("/messages");
}
