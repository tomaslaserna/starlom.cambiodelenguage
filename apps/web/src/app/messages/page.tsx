import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { listMessageCenter } from "@/lib/messages";
import {
  markConversationReadAction,
  sendMessageAction,
} from "@/app/messages/actions";
import { MessagesClient } from "@/app/messages/messages-client";

type MessagesPageProps = {
  searchParams: Promise<{
    contact?: string;
    message?: string;
  }>;
};

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const center = await listMessageCenter(session);
  const messages = [...center.inbox, ...center.sent]
    .filter((message, index, rows) => rows.findIndex((candidate) => candidate.id === message.id) === index)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const requestedMessageId = Number(params.message ?? 0);
  const requestedMessage = messages.find((message) => message.id === requestedMessageId);
  const availableContacts = new Set([
    ...center.employees,
    ...messages.flatMap((message) => [message.from, message.to]),
  ]);
  availableContacts.delete(session.username);
  availableContacts.delete("");
  const initialContact = params.contact && availableContacts.has(params.contact)
    ? params.contact
    : requestedMessage
      ? requestedMessage.from === session.username
        ? requestedMessage.to
        : requestedMessage.from
      : null;

  return (
    <ModulePage
      active="messages"
      description="Mensajeria interna entre usuarios registrados, con lectura completa, busqueda y adjuntos privados."
      session={session}
      title="Mensajes"
    >
      <MessagesClient
        currentUsername={session.username}
        employees={center.employees}
        initialContact={initialContact}
        initialRevision={center.meta.revision}
        markConversationReadAction={markConversationReadAction}
        messages={messages}
        sendMessageAction={sendMessageAction}
      />
    </ModulePage>
  );
}
