import { deleteSource } from "@apex/db"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { knowledgeErrorResponse } from "@/lib/knowledge"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    await deleteSource(db(), user.id, (await params).id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
