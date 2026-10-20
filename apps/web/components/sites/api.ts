// Client calls for the website switcher and the Websites page. Each resolves to the
// response body, or the message to show when it failed.

type Result = { ok: true; data: { id: string; name: string } | null } | { ok: false; message: string }

async function send(url: string, method: string, body: object | null, strings: { failed: string; offline: string }): Promise<Result> {
  try {
    const res = await fetch(url, {
      method,
      ...(body && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, message: data?.issues?.[0]?.message ?? data?.message ?? strings.failed }
    return { ok: true, data }
  } catch {
    return { ok: false, message: strings.offline }
  }
}

type Strings = { failed: string; offline: string }

export const selectSite = (id: string, t: Strings) => send(`/api/sites/${id}/select`, "POST", {}, t)
export const createSite = (name: string, t: Strings) => send("/api/sites", "POST", { name }, t)
export const renameSite = (id: string, name: string, t: Strings) => send(`/api/sites/${id}`, "PATCH", { name }, t)
export const removeSite = (id: string, t: Strings) => send(`/api/sites/${id}`, "DELETE", null, t)
export const chooseActiveSites = (ids: string[], t: Strings) => send("/api/sites/active", "POST", { ids }, t)
