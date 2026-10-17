// Files a visitor attaches to a chat message: images (shown to the model) and plain text files
// (read as data). Everything about them is client-controlled, so the type comes from the file's
// own bytes, never from a name or a declared MIME type, and nothing is stored.

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type Attachment = { kind: "image"; name: string; mediaType: ImageType; data: string } | { kind: "text"; name: string; text: string };

export const ATTACHMENT_LIMITS = {
  files: 3,
  /** Decoded bytes per image; the widget re-encodes photos well under this. */
  imageBytes: 1_000_000,
  textChars: 20_000,
  nameChars: 100,
};

/** Largest /v1/chat body: three images in base64 plus JSON overhead. */
export const CHAT_BODY_LIMIT = Math.ceil((ATTACHMENT_LIMITS.files * ATTACHMENT_LIMITS.imageBytes * 4) / 3) + 64 * 1024;

export type AttachmentError = "bad_request" | "attachment_too_large" | "unsupported_file";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// C0/C1 controls except tab and newline (same set the chat text is cleaned of)
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** The image type from its signature, or null for anything else (SVG, HTML, executables...). */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (at(4, 0x37, 0x61) || at(4, 0x39, 0x61))) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** A display name only: no path, no controls, no markup characters. */
function fileName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(CONTROL, "").split(/[\\/]/).pop()!.replace(/[<>"`]/g, "").trim() : "";
  return name.slice(0, ATTACHMENT_LIMITS.nameChars) || "file";
}

/** Validated attachments from a request body, or the error code to answer with. */
export function parseAttachments(raw: unknown): Attachment[] | { error: AttachmentError } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > ATTACHMENT_LIMITS.files) return { error: "bad_request" };
  const out: Attachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "bad_request" };
    const { kind, name, data, text } = item as Record<string, unknown>;
    if (kind === "image") {
      if (typeof data !== "string" || !BASE64.test(data)) return { error: "bad_request" };
      if (data.length > Math.ceil((ATTACHMENT_LIMITS.imageBytes * 4) / 3) + 4) return { error: "attachment_too_large" };
      const bytes = Buffer.from(data, "base64");
      const mediaType = sniffImage(bytes);
      if (!mediaType) return { error: "unsupported_file" };
      // re-encoded, so what reaches the model is exactly the bytes that were checked
      out.push({ kind: "image", name: fileName(name), mediaType, data: bytes.toString("base64") });
    } else if (kind === "text") {
      if (typeof text !== "string") return { error: "bad_request" };
      // binary content read as text is full of NULs and controls; that isn't a text file
      if ((text.match(CONTROL)?.length ?? 0) > text.length / 20 + 2) return { error: "unsupported_file" };
      if (text.length > ATTACHMENT_LIMITS.textChars) return { error: "attachment_too_large" };
      const clean = text.replace(CONTROL, "").trim();
      if (clean) out.push({ kind: "text", name: fileName(name), text: clean });
    } else {
      return { error: "unsupported_file" };
    }
  }
  return out;
}

/** How a message's attachments are kept in the transcript (the files themselves are not). */
export function attachmentNote(attachments: Attachment[]): string {
  return attachments.map((a) => `📎 ${a.name}`).join("\n");
}
