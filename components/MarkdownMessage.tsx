"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownMessage({ content }: { content: string }) {
  if (!content) return <span className="text-muted">…</span>;

  return (
    <div className="md-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
