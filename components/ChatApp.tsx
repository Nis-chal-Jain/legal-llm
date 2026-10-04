"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssistantReply from "@/components/AssistantReply";
import {
  DEFAULT_MODE,
  DEFAULT_MODEL,
  MODES,
  MODELS,
  type ModeId,
  type ModelId,
} from "@/lib/models";
import { separateThinkingAndAnswer } from "@/lib/thinking";

type Role = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  thinking?: string;
};
type UploadedFile = { id: string; name: string; size: number; text: string };

const ACCEPT = ".pdf,.txt,.docx,.md,application/pdf,text/plain,text/markdown";

function uid() {
  return crypto.randomUUID();
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatApp() {
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [mode, setMode] = useState<ModeId>(DEFAULT_MODE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => MODELS.find((m) => m.id === model) ?? MODELS[0],
    [model],
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (!incoming.length) return;

    setUploading(true);
    setError(null);

    const form = new FormData();
    for (const file of incoming) form.append("files", file);

    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = (await res.json()) as {
        files?: { name: string; size: number; text: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not extract files.");
      setFiles((prev) => [
        ...prev,
        ...(data.files ?? []).map((f) => ({ ...f, id: uid() })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: uid(), role: "user", content: text };
    const history = [...messages, userMessage];
    const assistantId = uid();

    setInput("");
    setError(null);
    setBusy(true);
    setMessages([
      ...history,
      { id: assistantId, role: "assistant", content: "", thinking: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature,
          maxTokens,
          messages: history
            .filter((m) => m.role === "user" || m.content)
            .map(({ role, content }) => ({ role, content })),
          files: files.map(({ name, text: fileText }) => ({
            name,
            text: fileText,
          })),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Chat request failed.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream.");

      const decoder = new TextDecoder();
      let assembledAnswer = "";
      let assembledThinking = "";
      let lineBuf = "";

      const publish = (answer: string, thinking: string, streaming = true) => {
        const split = separateThinkingAndAnswer(answer, thinking, streaming);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: split.answer, thinking: split.thinking }
              : m,
          ),
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuf += decoder.decode(value, { stream: true });
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type?: string;
              text?: string;
            };
            if (event.type === "thinking" && event.text) {
              assembledThinking += event.text;
            } else if (event.type === "answer" && event.text) {
              assembledAnswer += event.text;
            }
            publish(assembledAnswer, assembledThinking);
          } catch {
            assembledAnswer += line;
            publish(assembledAnswer, assembledThinking);
          }
        }
      }

      if (lineBuf.trim()) {
        try {
          const event = JSON.parse(lineBuf) as { type?: string; text?: string };
          if (event.type === "thinking" && event.text) {
            assembledThinking += event.text;
          } else if (event.type === "answer" && event.text) {
            assembledAnswer += event.text;
          }
        } catch {
          assembledAnswer += lineBuf;
        }
      }

      publish(assembledAnswer, assembledThinking, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${message}` }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function insertCodeFence() {
    setInput((value) => (value ? `${value}\n\n\`\`\`\n\n\`\`\`` : "```\n\n```"));
    textareaRef.current?.focus();
  }

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-panel">
        <div className="px-5 pb-3 pt-6">
          <h1 className="text-[22px] font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-muted">Choose an open source model.</p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {MODELS.map((item) => {
            const active = item.id === model;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setModel(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-blue-200 bg-accent-soft"
                    : "border-transparent bg-transparent hover:bg-zinc-50"
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                  style={{ background: item.accent }}
                >
                  {item.badge}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {item.provider}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="pt-4">
            <p className="px-1 text-[13px] font-medium text-zinc-800">Mode</p>
            <p className="mt-0.5 px-1 text-xs text-muted">Choose one.</p>
            <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Mode">
              {MODES.map((item) => {
                const active = item.id === mode;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-blue-200 bg-accent-soft font-medium"
                        : "border-transparent text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        active ? "border-accent" : "border-zinc-300"
                      }`}
                    >
                      {active ? (
                        <span className="h-2 w-2 rounded-full bg-accent" />
                      ) : null}
                    </span>
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-zinc-50"
          >
            <span className="flex items-center gap-2 text-zinc-700">
              <GearIcon />
              Model Settings
            </span>
            <ChevronIcon />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-panel">
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md text-center">
                <p className="text-lg font-medium tracking-tight">Start a conversation</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {selected.name}. Upload files on the right to
                  include their extracted text as context.<br/> Bought by Group 11 Project Phase 2.
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] leading-6 ${
                      message.role === "user"
                        ? "max-w-[85%] whitespace-pre-wrap bg-accent text-white"
                        : "w-full max-w-full border border-border bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <AssistantReply
                        content={message.content}
                        thinking={message.thinking}
                        streaming={busy && message.id === messages.at(-1)?.id}
                      />
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? (
          <div className="px-8 pb-2">
            <p className="mx-auto max-w-2xl rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          </div>
        ) : null}

        <div className="px-6 pb-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type your message..."
              rows={3}
              className="w-full resize-none bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-zinc-400"
            />
            <div className="mt-1 flex items-center justify-between px-1">
              <div className="flex items-center gap-1">
                <IconButton
                  label="Attach files"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PaperclipIcon />
                </IconButton>
                <IconButton label="Insert code block" onClick={insertCodeFence}>
                  <BracesIcon />
                </IconButton>
                <IconButton
                  label="Images are not used as context"
                  onClick={() =>
                    setError("This app extracts text only (PDF, TXT, DOCX, MD).")
                  }
                >
                  <ImageIcon />
                </IconButton>
              </div>
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </main>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-panel">
        <div className="px-5 pb-4 pt-6">
          <h2 className="text-[22px] font-semibold tracking-tight">Context</h2>
          <p className="mt-1 text-sm text-muted">Upload files to provide context.</p>
        </div>

        <div className="px-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
              dragOver
                ? "border-accent bg-accent-soft"
                : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <CloudIcon />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              Drag & drop files here
              <br />
              or click to browse.
            </p>
            <p className="mt-3 text-xs text-muted">Supports: PDF, TXT, DOCX, MD</p>
            <p className="mt-1 text-xs text-muted">Max file size: 20MB.</p>
            <input
              ref={contextInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between px-5">
          <p className="text-sm font-medium">Uploaded Files ({files.length})</p>
          <button
            type="button"
            onClick={() => setFiles([])}
            disabled={!files.length}
            className="text-sm font-medium text-accent disabled:opacity-40"
          >
            Clear All
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          {uploading ? (
            <p className="mb-3 text-xs text-muted">Extracting text…</p>
          ) : null}

          {files.length === 0 ? (
            <div className="flex gap-2 rounded-xl bg-accent-soft px-3 py-3 text-sm leading-5 text-blue-800">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-accent">
                i
              </span>
              Uploaded files will appear here and be used as additional context
              for the model.
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {file.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatSize(file.size)} · {file.text.length.toLocaleString()} chars
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-red-600"
                    onClick={() =>
                      setFiles((prev) => prev.filter((f) => f.id !== file.id))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {settingsOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Model Settings</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">{selected.name}</p>

            <label className="mt-5 block text-sm font-medium">
              Temperature ({temperature.toFixed(1)})
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              Max tokens ({maxTokens})
              <input
                type="range"
                min={256}
                max={4096}
                step={128}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
              />
            </label>

            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="mt-6 w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a8 8 0 0 0-1.7-1L15 3h-6l-.4 2.5a8 8 0 0 0-1.7 1L8.5 6 6.5 9.5 8.5 11a7.8 7.8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-.5a8 8 0 0 0 1.7 1L9 21h6l.4-2.5a8 8 0 0 0 1.7-1l2.4.5 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12.5 12.2 21a6 6 0 0 1-8.5-8.5L13 3.3a4 4 0 0 1 5.7 5.6L9.4 18.1a2 2 0 0 1-2.8-2.8l8.5-8.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BracesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 5c-2 0-3 1.2-3 3v2c0 1-1 1.5-2 2 1 .5 2 1 2 2v2c0 1.8 1 3 3 3M16 5c2 0 3 1.2 3 3v2c0 1 1 1.5 2 2-1 .5-2 1-2 2v2c0 1.8-1 3-3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path
        d="m21 16-5.5-5.5-8.5 8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 12 20 4.5 14 20l-2.5-6.5L3.5 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.5 18h9a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.5 1.7A3.5 3.5 0 0 0 7.5 18Z"
        stroke="#9ca3af"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 14V9m0 0-2 2m2-2 2 2"
        stroke="#9ca3af"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
