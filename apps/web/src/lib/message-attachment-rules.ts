export const MESSAGE_ATTACHMENT_MAX_FILES = 5;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string[]> = {
  csv: ["text/csv", "application/vnd.ms-excel"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  gif: ["image/gif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  txt: ["text/plain"],
  webp: ["image/webp"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export const MESSAGE_ATTACHMENT_ACCEPT = Object.entries(MIME_BY_EXTENSION)
  .flatMap(([extension, mimeTypes]) => [`.${extension}`, ...mimeTypes])
  .filter((value, index, values) => values.indexOf(value) === index)
  .join(",");

export type MessageAttachmentMetadata = {
  fileName: string;
  contentType: string;
  size: number;
};

export type ValidatedMessageAttachment = MessageAttachmentMetadata & {
  extension: string;
};

export function validateMessageAttachment(
  input: MessageAttachmentMetadata,
): { data?: ValidatedMessageAttachment; error?: string } {
  const fileName = input.fileName.trim();
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const allowedMimeTypes = MIME_BY_EXTENSION[extension];

  if (!fileName || !allowedMimeTypes) {
    return { error: "Formato no permitido. Usa PDF, Excel, Word, CSV, TXT o imagenes." };
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    return { error: "El archivo esta vacio o tiene un tamano invalido." };
  }
  if (input.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    return { error: "Cada archivo puede pesar hasta 20 MB." };
  }

  const receivedType = input.contentType.trim().toLowerCase();
  const contentType = receivedType === "application/octet-stream" || !receivedType
    ? allowedMimeTypes[0]
    : receivedType;
  if (!allowedMimeTypes.includes(contentType)) {
    return { error: "La extension del archivo no coincide con su tipo." };
  }

  return {
    data: {
      fileName: fileName.slice(0, 180),
      contentType,
      size: input.size,
      extension,
    },
  };
}
