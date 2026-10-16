// Text helpers shared by retrieval and language handling: Turkish, English, Lithuanian,
// Latvian and Estonian.

export type Lang = "tr" | "en" | "lt" | "lv" | "et";
export const LANGS: readonly Lang[] = ["tr", "en", "lt", "lv", "et"];

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

/**
 * Lowercases without the Turkish/English "I" trap and folds letters to ASCII: Turkish ones by
 * table, every other accented letter (ą ė š ū ā ģ ķ ļ ņ õ ä …) by dropping its diacritics.
 */
export function fold(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/[ışğüöçâîû]/g, (ch) => FOLD[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const STOPWORDS = new Set(
  [
    // tr
    "acaba", "ama", "bana", "ben", "bir", "biz", "bu", "da", "de", "diye", "gibi", "hangi", "icin", "ile", "ise",
    "kac", "mi", "mu", "nasil", "ne", "neden", "nedir", "o", "olan", "olarak", "siz", "size", "sizin", "su", "var",
    "ve", "veya", "ya", "yok", "zaman", "merhaba", "lutfen", "tesekkurler", "kim", "kimdir", "kimin", "hakkinda", "anlat", "anlatir", "misin", "musun",
    // en
    "a", "an", "and", "are", "can", "could", "do", "does", "for", "from", "have", "how", "i", "if", "in", "is", "it",
    "me", "my", "of", "on", "or", "please", "the", "there", "to", "what", "when", "where", "which", "why", "will",
    "with", "would", "you", "your", "hi", "hello", "thanks", "who", "whom", "whose", "about", "tell", "was", "this", "that", "he", "she", "his", "her", "am", "be",
    // lt (words that are also Turkish or English content words, like "iki" or "man", stay searchable)
    "ir", "ar", "kaip", "kas", "kur", "kada", "kodel", "yra", "mano", "jus", "jums", "jusu", "apie", "kiek", "koks", "kokia", "kokie",
    "labas", "laba", "sveiki", "aciu", "prasau", "noriu", "galiu", "galite", "taip", "kad", "nuo", "per",
    // lv
    "un", "vai", "ka", "kapec", "cik", "par", "lai", "es", "labdien", "paldies", "ludzu", "gribu", "varu", "var", "nav",
    // et
    "ja", "ning", "voi", "kuidas", "mis", "millal", "miks", "kui", "palju", "tere", "aitah", "palun", "jah", "ei",
    "ma", "mina", "mulle", "minu", "teie", "teil", "olen", "soovin", "tahan", "kohta",
  ].map(fold),
);

/** Prefix marking the looser four-letter stem; retrieval weighs these terms at half. */
export const LOOSE = "~";

/**
 * Tokens for lexical search. Turkish, Lithuanian, Latvian and Estonian are heavily inflected
 * ("iade", "iadesi", "iadeler"; "grąžinimas", "grąžinimo"), so each word yields its first five
 * letters (F5 stemming) plus a looser four-letter stem that still matches when the root is
 * shorter than five letters. Works acceptably for English too.
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

// Letters only one of our languages uses settle it outright
const UNIQUE_CHARS: [Lang, RegExp][] = [
  ["tr", /[çğışİ]/i],
  ["lv", /[āēīģķļņ]/i],
  ["lt", /[ąęėįų]/i],
  ["et", /[õä]/i],
];
// Letters shared by some of them only tip the balance
const SHARED_CHARS: [RegExp, Lang[]][] = [
  [/[öü]/i, ["tr", "et"]],
  [/[čū]/i, ["lt", "lv"]],
  [/[šž]/i, ["lt", "lv", "et"]],
];

// Common words in questions, folded; a word used by two of the languages is left out
const WORDS: Record<Lang, Set<string>> = {
  tr: new Set(["ve", "bir", "bu", "ne", "nasil", "mi", "mu", "icin", "var", "ile", "merhaba", "nedir", "musunuz", "misiniz", "yok", "evet", "hayir", "tesekkurler", "kac", "neler", "olur", "istiyorum"]),
  en: new Set(["the", "is", "what", "how", "do", "does", "can", "you", "my", "and", "to", "for", "are", "hi", "hello", "thanks", "want", "would", "have", "of", "where", "when"]),
  lt: new Set(["kaip", "yra", "kodel", "labas", "laba", "aciu", "prasau", "noriu", "galiu", "galite", "kiek", "koks", "kokia", "kokie", "apie", "taip", "mano", "nera", "reikia"]),
  lv: new Set(["un", "kapec", "labdien", "paldies", "ludzu", "gribu", "varu", "cik", "par", "vai", "nav", "lai", "kads", "esmu"]),
  et: new Set(["ja", "kuidas", "mis", "kus", "millal", "miks", "tere", "aitah", "palun", "jah", "ei", "ma", "mina", "teie", "soovin", "tahan", "kui", "palju", "ning", "voi", "mulle", "minu", "olen"]),
};

/** Best-effort language guess; null when the text gives no clear signal (e.g. "ok", "👍"). */
export function detectLang(text: string): Lang | null {
  for (const [lang, chars] of UNIQUE_CHARS) if (chars.test(text)) return lang;
  const score: Record<Lang, number> = { tr: 0, en: 0, lt: 0, lv: 0, et: 0 };
  for (const [chars, langs] of SHARED_CHARS) if (chars.test(text)) for (const lang of langs) score[lang]++;
  for (const word of fold(text).split(/[^a-z]+/)) {
    for (const lang of LANGS) if (WORDS[lang].has(word)) score[lang] += 2;
  }
  const [first, second] = [...LANGS].sort((a, b) => score[b] - score[a]);
  return score[first] > 0 && score[first] > score[second] ? first : null;
}
