"use client";

import { useState } from "react";

export function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative rounded-xl border border-border bg-bg-card overflow-hidden">
      {title && (
        <div className="border-b border-border px-4 py-2 text-[11px] font-medium text-text-muted">
          {title}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-[13px] font-mono text-text-muted leading-relaxed">
          <code>{children}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 rounded-md border border-border bg-bg-hover px-2 py-1 text-[11px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-text"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
