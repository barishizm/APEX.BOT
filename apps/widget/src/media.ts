// Files and speech for the composer: images are re-encoded in the browser (smaller uploads, and
// EXIF data such as GPS location never leaves the device), text files are read as text, and
// voice uses the browser's own speech APIs, so no audio passes through our servers.
import type { Attachment } from "./api.ts";

export const MAX_FILES = 3;
/** Longest edge sent to the model; larger photos only cost tokens. */
const MAX_EDGE = 1568;
/** The API accepts 1 MB per image; re-encoding stays under it. */
const MAX_IMAGE_BYTES = 950_000;
/** What the browser is asked to decode at all (a phone photo is a few MB). */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_TEXT_CHARS = 20_000;

const IMAGE = /^image\/(jpeg|png|webp|gif)$/;
const TEXT = /^(text\/(plain|markdown|csv)|application\/json)$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|log)$/i;
export const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json,.log";

export type FileProblem = "fileTooBig" | "fileType" | "fileRead";

export class FileError extends Error {
  constructor(readonly problem: FileProblem) {
    super(problem);
  }
}

/** An attachment ready to send, plus a preview for images. */
export interface Prepared {
  attachment: Attachment;
  /** data: URL of the re-encoded image, for the chip and the message bubble. */
  preview?: string;
}

/** Reads one picked, pasted or dropped file into an attachment, or throws a FileError. */
export async function prepareFile(file: File): Promise<Prepared> {
  const name = file.name || "file";
  if (IMAGE.test(file.type)) {
    if (file.size > MAX_SOURCE_BYTES) throw new FileError("fileTooBig");
    const data = await reencode(file);
    return { attachment: { kind: "image", name, data }, preview: `data:image/jpeg;base64,${data}` };
  }
  if (TEXT.test(file.type) || TEXT_EXT.test(name)) {
    if (file.size > MAX_TEXT_BYTES) throw new FileError("fileTooBig");
    const text = await file.text().catch(() => {
      throw new FileError("fileRead");
    });
    // a binary file with a text extension
    if (text.includes("\u0000")) throw new FileError("fileType");
    if (text.length > MAX_TEXT_CHARS) throw new FileError("fileTooBig");
    return { attachment: { kind: "text", name, text } };
  }
  throw new FileError("fileType");
}

/** Draws the image onto a canvas and returns JPEG base64, scaled down until it fits the size cap. */
async function reencode(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new FileError("fileRead");
  }
  let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
  try {
    for (let quality = 0.85; ; quality -= 0.15) {
      const scale = edge / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new FileError("fileRead");
      // JPEG has no transparency: a white page reads better than black behind a PNG logo
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", Math.max(quality, 0.5)).split(",")[1] ?? "";
      if (data.length * 0.75 <= MAX_IMAGE_BYTES) return data;
      if (quality <= 0.55) {
        edge = Math.round(edge * 0.7);
        quality = 1;
      }
      if (edge < 64) throw new FileError("fileTooBig");
    }
  } finally {
    bitmap.close();
  }
}

// ---------- speech ----------

export interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;
export interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

/** The browser's speech recognition, where there is one (Chrome, Edge, Safari). */
export function recognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const LOCALES: Record<string, string> = { tr: "tr-TR", en: "en-US", lt: "lt-LT", lv: "lv-LV", et: "et-EE" };

/** A reply as it should be read aloud: Markdown marks, links and URLs removed. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
