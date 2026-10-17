import { KNOWLEDGE_LIMITS, KnowledgeError, failSync, finishSync, loadEmbeddings, type ChunkRecord, type KnowledgeSource } from "@apex/db"
import { CrawlError, chunkPage, crawlSite, type KnowledgeBase, type SemanticQuery } from "@apex/knowledge"
import { chunkHash, createEmbedder, embedderDims, vectorFromBytes } from "@apex/knowledge/embed"
import { errorJson } from "@/lib/auth"
import { botErrorResponse } from "@/lib/bot"
import type { Locale } from "@/lib/i18n"
import { translateMessage } from "@/lib/i18n/messages"
import { db } from "@/lib/db"

// Same floor the chat API uses (APEX_MIN_RETRIEVAL_SCORE there), for the dashboard's search preview
export const minRetrievalScore = () => Number(process.env.APEX_MIN_RETRIEVAL_SCORE) || 2

/** The chat API's embedder (APEX_EMBEDDINGS there), so the search preview matches by meaning too; null when off. */
export function previewEmbedder() {
  const spec = process.env.APEX_EMBEDDINGS?.trim()
  if (!spec || spec === "off") return null
  try {
    return createEmbedder(spec, { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY })
  } catch (err) {
    console.error("[knowledge] APEX_EMBEDDINGS is set but can't be used; the preview matches keywords only", err)
    return null
  }
}

/**
 * Attaches the bot's stored vectors (written by the chat API) to `index` and embeds the question,
 * for the search preview. Chunks the API hasn't embedded yet stay keyword-only, as they are in chat.
 */
export async function previewSemantic(index: KnowledgeBase, generation: number, botId: string, chunks: ChunkRecord[], question: string) {
  const embedder = previewEmbedder()
  const dims = embedder && embedderDims(embedder.id)
  if (!embedder || !dims) return { semantic: null, embedded: 0 }
  const hashes = chunks.map(chunkHash)
  const key = (h: Uint8Array) => Buffer.from(h).toString("hex")
  const stored = new Map((await loadEmbeddings(db(), botId, embedder.id, hashes)).map((r) => [key(r.hash), vectorFromBytes(r.vector, dims)]))
  const vectors = hashes.map((h) => stored.get(key(h)) ?? null)
  const embedded = vectors.filter(Boolean).length
  if (!embedded) return { semantic: null, embedded }
  index.attachVectors(botId, generation, embedder.id, vectors)
  try {
    const [vector] = await embedder.embed([question], "query", AbortSignal.timeout(5000))
    return { semantic: { embedder: embedder.id, vectors: [vector] } satisfies SemanticQuery, embedded }
  } catch (err) {
    console.error("[knowledge] couldn't embed the preview question", err instanceof Error ? err.message : err)
    return { semantic: null, embedded }
  }
}

/** Reads the website and stores its chunks; runs after the response, so it reports through the source's status. */
export async function crawlInto(sourceId: string, url: string) {
  try {
    const result = await crawlSite(url, {
      maxPages: KNOWLEDGE_LIMITS.websitePages,
      // local development only: lets you point the crawler at a site on your own machine
      allowPrivate: process.env.APEX_CRAWL_ALLOW_PRIVATE === "1",
    })
    await finishSync(db(), sourceId, { pages: result.pages.length, chunks: result.pages.flatMap((p) => chunkPage(p)) })
  } catch (err) {
    if (!(err instanceof CrawlError)) console.error("[knowledge] crawl failed", sourceId, err)
    await failSync(db(), sourceId, err instanceof CrawlError ? err.message : "Something went wrong while reading the site. Try again").catch(
      (e) => console.error("[knowledge] couldn't record the failure", e),
    )
  }
}

// The stored error is English (it's written by a background job); show it in the reader's language
export function sourceJson(s: KnowledgeSource, locale: Locale) {
  return { ...s, error: s.error && translateMessage(s.error, locale), syncedAt: s.syncedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}
export type SourceJson = ReturnType<typeof sourceJson>

const STATUS = { invalid_input: 400, limit: 409, not_found: 404, forbidden: 403, busy: 409 } as const

export async function knowledgeErrorResponse(err: unknown) {
  if (err instanceof KnowledgeError) return errorJson(err.code, err.message, { status: STATUS[err.code] })
  if (err instanceof CrawlError) return errorJson("invalid_input", err.message, { status: 400 })
  // session, bot and unexpected errors
  return botErrorResponse(err)
}
