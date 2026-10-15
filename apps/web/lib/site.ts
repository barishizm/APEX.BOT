// Public URL of the chat API (apps/api); it also serves /widget.js.
export const apiUrl = () => (process.env.NEXT_PUBLIC_APEX_API_URL || "http://localhost:8787").replace(/\/+$/, "")

export const embedSnippet = (siteKey: string) => `<script src="${apiUrl()}/widget.js" data-site-key="${siteKey}" async></script>`
