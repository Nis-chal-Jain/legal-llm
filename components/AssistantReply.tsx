"use client";

import MarkdownMessage from "@/components/MarkdownMessage";

export default function AssistantReply({
  content,
  thinking,
  streaming,
}: {
  content: string;
  thinking?: string;
  streaming?: boolean;
}) {
  const showThinking = Boolean(thinking?.trim()) || Boolean(streaming && !content);

  return (
    <div className="space-y-3">
      {showThinking ? (
        <details className="group rounded-xl border border-border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm text-muted select-none [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-zinc-600">
              {content ? "Thinking process" : "Thinking…"}
            </span>
            <span className="text-xs text-zinc-400 group-open:hidden">Show</span>
            <span className="hidden text-xs text-zinc-400 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-border px-3 py-3">
            {thinking?.trim() ? (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-6 text-zinc-500">
                {thinking.trim()}
              </pre>
            ) : (
              <p className="text-sm text-muted">Working through the question…</p>
            )}
          </div>
        </details>
      ) : null}

      {content ? (
        <MarkdownMessage content={content} />
      ) : streaming ? null : (
        <p className="text-sm text-muted">No answer returned.</p>
      )}
    </div>
  );
}
