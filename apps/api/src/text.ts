// Text helpers shared by retrieval and language handling. Turkish and English only.

export type Lang = "tr" | "en";

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

/** Lowercases without the Turkish/English "I" trap and folds Turkish letters to ASCII. */
export function fold(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/[ışğüöçâîû]/g, (ch) => FOLD[ch] ?? ch);
}

const STOPWORDS = new Set(
  [
    // tr
    "acaba", "ama", "bana", "ben", "bir", "biz", "bu", "da", "de", "diye", "gibi", "hangi", "icin", "ile", "ise",
    "kac", "mi", "mu", "nasil", "ne", "neden", "nedir", "o", "olan", "olarak", "siz", "size", "sizin", "su", "var",
    "ve", "veya", "ya", "yok", "zaman", "merhaba", "lutfen", "tesekkurler",
    // en
    "a", "an", "and", "are", "can", "could", "do", "does", "for", "from", "have", "how", "i", "if", "in", "is", "it",
    "me", "my", "of", "on", "or", "please", "the", "there", "to", "what", "when", "where", "which", "why", "will",
    "with", "would", "you", "your", "hi", "hello", "thanks",
  ].map(fold),
);

/** Prefix marking the looser four-letter stem; retrieval weighs these terms at half. */
export const LOOSE = "~";

/**
 * Tokens for lexical search. Turkish is agglutinative ("iade", "iadesi", "iadeler"), so each
 * word yields its first five letters (F5 stemming) plus a looser four-letter stem that still
 * matches when the root is shorter than five letters. Works acceptably for English too.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of fold(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.push(raw.length > 5 ? raw.slice(0, 5) : raw);
    if (raw.length >= 4) out.push(LOOSE + raw.slice(0, 4));
  }
  return out;
}

const TR_CHARS = /[çğıöşüİ]/i;
const TR_WORDS = new Set(["ve", "bir", "bu", "ne", "nasil", "mi", "mu", "icin", "var", "ile", "merhaba", "nedir", "musunuz", "misiniz", "yok", "evet", "hayir", "tesekkurler", "kac", "neler", "olur", "istiyorum"]);
const EN_WORDS = new Set(["the", "is", "what", "how", "do", "does", "can", "you", "my", "and", "to", "for", "are", "hi", "hello", "thanks", "want", "would", "have", "of", "where", "when"]);

/** Best-effort TR/EN guess; null when the text gives no signal (e.g. "ok", "👍"). */
export function detectLang(text: string): Lang | null {
  if (TR_CHARS.test(text)) return "tr";
  let tr = 0;
  let en = 0;
  for (const word of fold(text).split(/[^a-z]+/)) {
    if (TR_WORDS.has(word)) tr++;
    if (EN_WORDS.has(word)) en++;
  }
  if (tr === en) return null;
  return tr > en ? "tr" : "en";
}
