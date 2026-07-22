"use client";

import { createClient } from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Button,
  Card,
  EmptyState,
  Input,
  StatusBadge,
  Textarea,
  cn,
} from "@/components/ui";
import {
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_ATTACHMENT_MAX_FILES,
  validateMessageAttachment,
} from "@/lib/message-attachment-rules";

type MessageAttachment = {
  id: number;
  messageId: number;
  fileName: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

type MessageItem = {
  id: number;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  body: string;
  date: string;
  read: boolean;
  type: string;
  importance: string;
  attachments: MessageAttachment[];
};

type MessagesClientProps = {
  currentUsername: string;
  employees: string[];
  initialContact: string | null;
  initialRevision: string;
  markConversationReadAction: (contact: string) => Promise<void>;
  messages: MessageItem[];
  sendMessageAction: (formData: FormData) => Promise<void>;
};

type SignedUpload = {
  id: string;
  bucket: string;
  path: string;
  token: string;
  contentType: string;
};

const MESSAGE_REFRESH_INTERVAL_MS = 3_000;

type ContactSummary = {
  name: string;
  latestMessage: MessageItem | null;
  unread: number;
};

let browserStorageClient: ReturnType<typeof createClient> | null = null;

function getBrowserStorageClient() {
  if (!browserStorageClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("La carga de adjuntos no esta configurada");
    browserStorageClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return browserStorageClient;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parsedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatConversationTime(value: string) {
  const date = parsedDate(value);
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: date.getFullYear() === now.getFullYear() ? undefined : "2-digit",
  }).format(date);
}

function formatMessageTime(value: string) {
  const date = parsedDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function contactForMessage(message: MessageItem, currentUsername: string) {
  if (message.from === currentUsername) return message.to;
  if (message.to === currentUsername) return message.from;
  return "";
}

function uniqueMessages(messages: MessageItem[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date),
  );
}

function avatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("es");
}

function importanceTone(importance: string) {
  if (importance === "urgente") return "danger" as const;
  if (importance === "alta") return "warning" as const;
  if (importance === "baja") return "neutral" as const;
  return "info" as const;
}

async function requestSignedUpload(file: File) {
  const response = await fetch("/api/messages/attachments/sign", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: SignedUpload;
    error?: string;
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error || "No se pudo preparar el adjunto");
  }
  return payload.data;
}

function MessageBubble({
  currentUsername,
  message,
}: {
  currentUsername: string;
  message: MessageItem;
}) {
  const outgoing = message.from === currentUsername;
  const showSubject = message.subject && message.subject.toLocaleLowerCase("es") !== "mensaje";

  return (
    <li className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "max-w-[88%] rounded-[12px] px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.12)] sm:max-w-[72%]",
          outgoing
            ? "rounded-br-[3px] bg-[#dbeafe] text-[#0f172a]"
            : "rounded-bl-[3px] border border-[#e2e8f0] bg-white text-[#0f172a]",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {showSubject ? <strong className="text-xs font-black text-[#075ac7]">{message.subject}</strong> : null}
          {message.importance !== "normal" ? (
            <StatusBadge tone={importanceTone(message.importance)}>{message.importance}</StatusBadge>
          ) : null}
        </div>
        <p className={cn("whitespace-pre-wrap break-words text-sm leading-5", showSubject && "mt-1.5")}>
          {message.body || "Mensaje sin texto"}
        </p>

        {message.attachments.length ? (
          <ul className="mt-2 grid gap-1.5" aria-label="Archivos adjuntos">
            {message.attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[8px] border border-[#93c5fd] bg-white/75 px-3 py-2 text-xs font-bold text-[#075ac7] transition-colors hover:bg-white"
                  href={attachment.downloadUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0 break-all">{attachment.fileName}</span>
                  <span className="shrink-0 text-[#64748b]">{formatBytes(attachment.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-[#64748b]">
          <time dateTime={message.date}>{formatMessageTime(message.date)}</time>
          {outgoing ? (
            <span aria-label={message.read ? "Leido" : "Enviado"} className={message.read ? "text-[#0b6cff]" : undefined}>
              {message.read ? "✓✓" : "✓"}
            </span>
          ) : null}
        </footer>
      </article>
    </li>
  );
}

export function MessagesClient({
  currentUsername,
  employees,
  initialContact,
  initialRevision,
  markConversationReadAction,
  messages,
  sendMessageAction,
}: MessagesClientProps) {
  const [liveMessages, setLiveMessages] = useState(() => uniqueMessages(messages));
  const [selectedContact, setSelectedContact] = useState<string | null>(initialContact);
  const [contactSearch, setContactSearch] = useState("");
  const [locallyRead, setLocallyRead] = useState(() => new Set<number>());
  const [readError, setReadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, startSending] = useTransition();
  const [, startMarkingRead] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshInFlightRef = useRef(false);
  const revisionInFlightRef = useRef(false);
  const revisionRef = useRef(initialRevision);

  const refreshMessages = useCallback(async (signal?: AbortSignal) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await fetch("/api/messages", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          inbox?: MessageItem[];
          sent?: MessageItem[];
          meta?: { revision?: string };
        };
      };
      if (!response.ok || !payload.data) throw new Error("No se pudieron actualizar los mensajes");
      setLiveMessages(uniqueMessages([...(payload.data.inbox ?? []), ...(payload.data.sent ?? [])]));
      if (payload.data.meta?.revision) revisionRef.current = payload.data.meta.revision;
      setSyncError("");
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const refreshMessagesWhenChanged = useCallback(async (signal?: AbortSignal) => {
    if (revisionInFlightRef.current) return;
    revisionInFlightRef.current = true;
    try {
      const response = await fetch("/api/messages?mode=revision", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { revision?: string };
      };
      const revision = payload.data?.revision;
      if (!response.ok || !revision) throw new Error("No se pudo comprobar si hay mensajes nuevos");
      if (revision !== revisionRef.current) {
        await refreshMessages(signal);
      } else {
        setSyncError("");
      }
    } finally {
      revisionInFlightRef.current = false;
    }
  }, [refreshMessages]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshWhenAvailable = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void refreshMessagesWhenChanged(controller.signal).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSyncError("Reconectando mensajes...");
      });
    };

    refreshWhenAvailable();
    const interval = window.setInterval(refreshWhenAvailable, MESSAGE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenAvailable);
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenAvailable);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
    };
  }, [refreshMessagesWhenChanged]);

  const contactSummaries = useMemo(() => {
    const names = new Set(employees.filter(Boolean));
    for (const message of liveMessages) {
      const contact = contactForMessage(message, currentUsername);
      if (contact) names.add(contact);
    }

    const summaries: ContactSummary[] = [...names].map((name) => {
      const contactMessages = liveMessages.filter(
        (message) => contactForMessage(message, currentUsername) === name,
      );
      return {
        name,
        latestMessage: contactMessages[0] ?? null,
        unread: contactMessages.filter(
          (message) =>
            message.from === name &&
            message.to === currentUsername &&
            !message.read &&
            !locallyRead.has(message.id),
        ).length,
      };
    });

    return summaries.sort((left, right) => {
      if (!left.latestMessage && !right.latestMessage) return left.name.localeCompare(right.name, "es");
      if (!left.latestMessage) return 1;
      if (!right.latestMessage) return -1;
      return Date.parse(right.latestMessage.date) - Date.parse(left.latestMessage.date);
    });
  }, [currentUsername, employees, liveMessages, locallyRead]);

  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLocaleLowerCase("es");
    if (!query) return contactSummaries;
    return contactSummaries.filter((contact) => {
      const searchable = [
        contact.name,
        contact.latestMessage?.subject ?? "",
        contact.latestMessage?.body ?? "",
      ].join(" ").toLocaleLowerCase("es");
      return searchable.includes(query);
    });
  }, [contactSearch, contactSummaries]);

  const selectedConversation = useMemo(
    () =>
      selectedContact
        ? liveMessages
            .filter((message) => contactForMessage(message, currentUsername) === selectedContact)
            .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
        : [],
    [currentUsername, liveMessages, selectedContact],
  );

  const selectedSummary = contactSummaries.find((contact) => contact.name === selectedContact) ?? null;

  const markConversationAsRead = useCallback(
    (contact: string) => {
      const unreadMessageIds = liveMessages
        .filter(
          (message) =>
            message.from === contact &&
            message.to === currentUsername &&
            !message.read &&
            !locallyRead.has(message.id),
        )
        .map((message) => message.id);
      if (!unreadMessageIds.length) return;

      setLocallyRead((current) => new Set([...current, ...unreadMessageIds]));
      setReadError("");
      startMarkingRead(async () => {
        try {
          await markConversationReadAction(contact);
        } catch {
          setLocallyRead((current) => {
            const next = new Set(current);
            for (const id of unreadMessageIds) next.delete(id);
            return next;
          });
          setReadError("No se pudo marcar la conversacion como leida.");
        }
      });
    },
    [currentUsername, liveMessages, locallyRead, markConversationReadAction],
  );

  useEffect(() => {
    if (!selectedContact) return;
    const timer = window.setTimeout(() => markConversationAsRead(selectedContact), 0);
    return () => window.clearTimeout(timer);
  }, [markConversationAsRead, selectedContact]);

  useEffect(() => {
    if (!selectedContact) return;
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedContact, selectedConversation.length]);

  function openContact(contact: string) {
    setSelectedContact(contact);
    setReadError("");
    setUploadError("");
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setUploadError("");
    if (files.length > MESSAGE_ATTACHMENT_MAX_FILES) {
      setSelectedFiles([]);
      setUploadError(`Selecciona hasta ${MESSAGE_ATTACHMENT_MAX_FILES} archivos.`);
      event.target.value = "";
      return;
    }
    for (const file of files) {
      const validation = validateMessageAttachment({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (!validation.data) {
        setSelectedFiles([]);
        setUploadError(`${file.name}: ${validation.error}`);
        event.target.value = "";
        return;
      }
    }
    setSelectedFiles(files);
  }

  async function uploadSelectedFiles() {
    const ids: string[] = [];
    const storage = getBrowserStorageClient();
    for (const [index, file] of selectedFiles.entries()) {
      setUploadProgress(`Subiendo ${index + 1} de ${selectedFiles.length}: ${file.name}`);
      const signed = await requestSignedUpload(file);
      const { error } = await storage.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: signed.contentType,
          upsert: false,
        });
      if (error) throw new Error(error.message || `No se pudo subir ${file.name}`);
      ids.push(signed.id);
    }
    return ids;
  }

  function handleComposeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContact || isSending || isUploading) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setUploadError("");
    setUploadProgress("");
    setIsUploading(selectedFiles.length > 0);

    startSending(async () => {
      try {
        if (selectedFiles.length) {
          const attachmentIds = await uploadSelectedFiles();
          formData.set("attachments", JSON.stringify(attachmentIds));
          setUploadProgress("Adjuntos listos. Enviando mensaje...");
        }
        await sendMessageAction(formData);
        form.reset();
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFiles([]);
        setUploadProgress("");
        await refreshMessages().catch(() => undefined);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "No se pudo enviar el mensaje");
      } finally {
        setIsUploading(false);
      }
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const sending = isSending || isUploading;

  return (
    <Card className="overflow-hidden">
      <div className="grid min-h-[680px] overflow-hidden lg:h-[calc(100vh-10.5rem)] lg:min-h-[620px] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          aria-label="Lista de contactos"
          className={cn(
            "min-h-0 flex-col border-[color:var(--border)] bg-white lg:flex lg:border-r",
            selectedContact ? "hidden" : "flex",
          )}
        >
          <header className="border-b border-[color:var(--border)] bg-[#f8fafc] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="erp-text-title-sm font-black text-[#0f172a]">Chats</h2>
                <p className="erp-text-caption mt-0.5 font-semibold text-[#64748b]">
                  {contactSummaries.length} contacto(s)
                </p>
              </div>
              <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-black text-[#075ac7]">
                {contactSummaries.reduce((total, contact) => total + contact.unread, 0)} sin leer
              </span>
            </div>
            <label className="sr-only" htmlFor="message-contact-search">Buscar o iniciar un chat</label>
            <Input
              autoComplete="off"
              className="mt-3"
              id="message-contact-search"
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Buscar o iniciar un chat"
              suppressHydrationWarning
              type="search"
              value={contactSearch}
            />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={0}>
            {filteredContacts.length ? (
              <ul>
                {filteredContacts.map((contact) => {
                  const latest = contact.latestMessage;
                  const outgoing = latest?.from === currentUsername;
                  const active = selectedContact === contact.name;
                  return (
                    <li className="border-b border-[#eef2f7]" key={contact.name}>
                      <button
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          active ? "bg-[#dbeafe]" : "bg-white hover:bg-[#f8fafc]",
                        )}
                        onClick={() => openContact(contact.name)}
                        suppressHydrationWarning
                        type="button"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#0b6cff,#0750bd)] text-sm font-black text-white shadow-sm">
                          {avatarInitials(contact.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <strong className="truncate text-sm font-black text-[#0f172a]">{contact.name}</strong>
                            {latest ? (
                              <time className="shrink-0 text-[11px] font-semibold text-[#64748b]" dateTime={latest.date}>
                                {formatConversationTime(latest.date)}
                              </time>
                            ) : null}
                          </span>
                          <span className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-[#64748b]">
                              {latest ? `${outgoing ? "Vos: " : ""}${latest.bodyPreview || latest.subject || "Archivo adjunto"}` : "Iniciar conversacion"}
                            </span>
                            {contact.unread ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#0b6cff] px-1.5 text-[10px] font-black text-white">
                                {contact.unread}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState title="Sin contactos" description="No hay contactos o conversaciones que coincidan con la busqueda." />
              </div>
            )}
          </div>
        </aside>

        <section
          aria-label={selectedContact ? `Chat con ${selectedContact}` : "Seleccion de chat"}
          className={cn("min-h-0 min-w-0 flex-col bg-white", selectedContact ? "flex" : "hidden lg:flex")}
        >
          {selectedContact ? (
            <>
              <header className="flex min-h-[69px] items-center gap-3 border-b border-[color:var(--border)] bg-[#f8fafc] px-3 py-2.5 sm:px-4">
                <Button
                  aria-label="Volver a contactos"
                  className="lg:hidden"
                  onClick={() => setSelectedContact(null)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Volver
                </Button>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#0b6cff,#0750bd)] text-sm font-black text-white">
                  {avatarInitials(selectedContact)}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-black text-[#0f172a]">{selectedContact}</strong>
                  <span className="block text-xs font-semibold text-[#64748b]">
                    {selectedSummary?.latestMessage ? "Conversacion interna" : "Nuevo chat"}
                  </span>
                </span>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#eef3f8] px-3 py-4 sm:px-6" aria-live="polite">
                {selectedConversation.length ? (
                  <ul className="grid gap-2.5">
                    {selectedConversation.map((message) => (
                      <MessageBubble currentUsername={currentUsername} key={message.id} message={message} />
                    ))}
                  </ul>
                ) : (
                  <div className="flex min-h-full items-center justify-center py-12">
                    <EmptyState
                      title={`Inicia un chat con ${selectedContact}`}
                      description="Escribe el primer mensaje en el cuadro de abajo."
                    />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <footer className="border-t border-[color:var(--border)] bg-white px-3 py-3 sm:px-4">
                <form className="grid gap-2" onSubmit={handleComposeSubmit}>
                  <input name="to" suppressHydrationWarning type="hidden" value={selectedContact} />
                  <input name="subject" suppressHydrationWarning type="hidden" value="Mensaje" />

                  <div className="rounded-[22px] border border-[#cbd5e1] bg-[#f8fafc] p-2 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow] focus-within:border-[#60a5fa] focus-within:ring-2 focus-within:ring-[#bfdbfe]">
                    {selectedFiles.length ? (
                      <ul aria-label="Archivos seleccionados" className="flex flex-wrap gap-1.5 px-2 pb-2">
                        {selectedFiles.map((file) => (
                          <li className="rounded-full bg-[#dbeafe] px-2.5 py-1 text-[11px] font-bold text-[#075ac7]" key={`${file.name}-${file.size}`}>
                            {file.name} ({formatBytes(file.size)})
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="flex items-end gap-1.5">
                      <input
                        accept={MESSAGE_ATTACHMENT_ACCEPT}
                        className="peer sr-only"
                        id="message-attachments"
                        multiple
                        onChange={handleFiles}
                        ref={fileInputRef}
                        suppressHydrationWarning
                        type="file"
                      />
                      <label
                        aria-label="Adjuntar archivos"
                        className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#e2e8f0] hover:text-[#075ac7] peer-focus-visible:ring-2 peer-focus-visible:ring-[#2563eb] peer-focus-visible:ring-offset-2"
                        htmlFor="message-attachments"
                        title="Adjuntar archivos"
                      >
                        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <path
                            d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </label>
                      <Textarea
                        aria-label="Escribe un mensaje"
                        className="max-h-32 min-h-10 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 shadow-none hover:border-0 focus:border-0"
                        name="body"
                        onKeyDown={handleComposerKeyDown}
                        placeholder="Escribe un mensaje"
                        required
                        rows={1}
                      />
                      <Button
                        aria-busy={sending}
                        aria-label={sending ? "Enviando mensaje" : "Enviar mensaje"}
                        className="h-10 w-10 shrink-0 rounded-full [min-height:2.5rem] [&>span]:flex [&>span]:h-full [&>span]:w-full [&>span]:shrink-0 [&>span]:items-center [&>span]:justify-center [&_svg]:shrink-0"
                        disabled={sending}
                        style={{ paddingInline: 0 }}
                        title="Enviar mensaje"
                        type="submit"
                      >
                        {sending ? (
                          <svg aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
                          </svg>
                        ) : (
                          <svg aria-hidden="true" className="block h-5 w-5 -translate-x-px" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3.4 20.4 22 12 3.4 3.6l-.01 6.53L16.7 12 3.39 13.87z" />
                          </svg>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-[#64748b]">Enter envia · Shift + Enter agrega una linea</p>
                    <p className="text-[11px] font-semibold text-[#64748b]">
                      Hasta {MESSAGE_ATTACHMENT_MAX_FILES} adjuntos de 20 MB
                    </p>
                  </div>
                  {uploadProgress ? <p className="text-xs font-semibold text-[#075ac7]">{uploadProgress}</p> : null}
                  {uploadError ? <p className="text-xs font-semibold text-[#b91c1c]">{uploadError}</p> : null}
                  {readError ? <p className="text-xs font-semibold text-[#b91c1c]">{readError}</p> : null}
                  {syncError ? <p className="text-xs font-semibold text-[#b45309]">{syncError}</p> : null}
                </form>
              </footer>
            </>
          ) : (
            <div className="flex min-h-full items-center justify-center bg-[#eef3f8] p-8">
              <EmptyState
                title="Selecciona un contacto"
                description="Elige una persona de la lista para abrir el chat y ver toda la conversacion."
              />
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
