import type { Metadata } from "next"
import { ADMIN_KNOWLEDGE_LIST, adminKnowledgeSummary, embeddingCoverage, KNOWLEDGE_REFRESH_JOB, recentJobRuns } from "@apex/db"
import { KnowledgeOverview, type KnowledgeOverviewJson } from "@/components/admin/knowledge-overview"
import { KnowledgeTable } from "@/components/admin/knowledge-table"
import { readTableQuery } from "@/components/admin/table-query"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { activeEmbeddingModel } from "@/lib/knowledge"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).knowledge.title }
}

export default async function AdminKnowledgePage({ searchParams }: PageProps<"/admin/knowledge">) {
  await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).knowledge
  const model = activeEmbeddingModel()
  const [summary, runs, coverage] = await Promise.all([
    adminKnowledgeSummary(db()),
    recentJobRuns(db(), KNOWLEDGE_REFRESH_JOB, 10),
    model ? embeddingCoverage(db(), model) : null,
  ])
  // Dates become ISO strings, as the client would get them from an API
  const search = await searchParams
  const overview = JSON.parse(JSON.stringify({ summary, runs, coverage, model })) as KnowledgeOverviewJson
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <KnowledgeOverview data={overview} />
      {/* the tiles above link to filtered views of this page; a new query starts the table afresh */}
      <KnowledgeTable key={JSON.stringify(search)} initialQuery={readTableQuery(search, Object.keys(ADMIN_KNOWLEDGE_LIST.filters))} />
    </div>
  )
}
