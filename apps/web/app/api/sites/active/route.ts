import { setActiveSites } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"

// Body: { ids }. While the workspace has more websites than its plan includes, these stay active
// and the rest are paused (their widget offers the contact form only). Nothing is deleted.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { ids } = await readJson(request)
    await setActiveSites(db(), user.id, ids)
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
