// Where an audit entry's target lives in the admin area. Plain module: the audit list (client) and
// the entry page (server) both use it.

const TARGET_PAGE: Record<string, string> = { user: "/admin/users", organization: "/admin/workspaces", bot: "/admin/bots", knowledge_source: "/admin/knowledge" }

/** The admin page of an audit entry's target, when it has one. */
export const targetHref = (type: string, id: string | null) => (id && TARGET_PAGE[type] ? `${TARGET_PAGE[type]}/${id}` : null)
