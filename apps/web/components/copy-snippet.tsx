"use client";

import { useState } from "react";

export function CopySnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="snippet">
      <code>{code}</code>
      <button type="button" onClick={copy} aria-live="polite">
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}
