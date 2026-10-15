import { KNOWLEDGE_LIMITS, KnowledgeError, failSync, finishSync, type KnowledgeSource } from "@apex/db"
import { CrawlError, chunkPage, crawlSite } from "@apex/knowledge"
import { botErrorResponse } from "@/lib/bot"
import { db } from "@/lib/db"

// Same floor the chat API uses (APEX_MIN_RETRIEVAL_SCORE there), for the dashboard's search preview
export const minRetrievalScore = () => Number(process.env.APEX_MIN_RETRIEVAL_SCORE) || 2

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

export function sourceJson(s: KnowledgeSource) {
  return { ...s, syncedAt: s.syncedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}
export type SourceJson = ReturnType<typeof sourceJson>

const STATUS = { invalid_input: 400, limit: 409, not_found: 404, forbidden: 403, busy: 409 } as const

export function knowledgeErrorResponse(err: unknown) {
  if (err instanceof KnowledgeError) return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] })
  if (err instanceof CrawlError) return Response.json({ error: "invalid_input", message: err.message }, { status: 400 })
  // session, bot and unexpected errors
  return botErrorResponse(err)
}
