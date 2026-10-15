"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/provider";

export function CopySnippet({ code }: { code: string }) {
  const { t } = useI18n();
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
        {copied ? t.common.copied : t.common.copy}
      </button>
    </div>
  );
}
