import { ALLOWED_MODEL_IDS, DEFAULT_MODEL } from "@/lib/models";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { ThinkingSplitter } from "@/lib/thinking";
import type { ContextFile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  let body: {
    model?: string;
    messages?: ChatMessage[];
    files?: ContextFile[];
    temperature?: number;
    maxTokens?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const model =
    body.model && ALLOWED_MODEL_IDS.has(body.model)
      ? body.model
      : DEFAULT_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const files = Array.isArray(body.files) ? body.files : [];

  if (messages.length === 0) {
    return Response.json({ error: "Messages are required." }, { status: 400 });
  }

  const temperature =
    typeof body.temperature === "number"
      ? Math.min(2, Math.max(0, body.temperature))
      : 0.7;
  const maxTokens =
    typeof body.maxTokens === "number"
      ? Math.min(8192, Math.max(64, Math.round(body.maxTokens)))
      : 2048;

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_SITE_NAME ?? "Legal LLM",
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      include_reasoning: true,
      messages: [
        { role: "system", content: buildSystemPrompt(files) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    let message = "OpenRouter request failed.";
    try {
      const parsed = JSON.parse(errText) as {
        error?: { message?: string };
      };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      if (errText) message = errText.slice(0, 400);
    }
    return Response.json({ error: message }, { status: upstream.status });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const splitter = new ThinkingSplitter();
      let buffer = "";

      const emit = (type: "thinking" | "answer", text: string) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type, text })}\n`),
        );
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data) as {
                choices?: {
                  delta?: {
                    content?: string | null;
                    reasoning?: string | null;
                    reasoning_content?: string | null;
                    reasoning_details?: {
                      type?: string;
                      text?: string;
                      summary?: string;
                    }[];
                  };
                }[];
              };
              const delta = json.choices?.[0]?.delta;
              const detailText = Array.isArray(delta?.reasoning_details)
                ? delta.reasoning_details
                    .map((d) => d.text ?? d.summary ?? "")
                    .join("")
                : "";
              const reasoning =
                (typeof delta?.reasoning === "string" ? delta.reasoning : "") +
                (typeof delta?.reasoning_content === "string"
                  ? delta.reasoning_content
                  : "") +
                detailText;
              if (reasoning) emit("thinking", reasoning);
              if (typeof delta?.content === "string" && delta.content) {
                const split = splitter.push(delta.content);
                if (split.thinking) emit("thinking", split.thinking);
                if (split.answer) emit("answer", split.answer);
              }
            } catch {
              // ignore malformed SSE chunks
            }
          }
        }

        const flushed = splitter.flush();
        if (flushed.thinking) emit("thinking", flushed.thinking);
        if (flushed.answer) emit("answer", flushed.answer);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream interrupted.";
        emit("answer", `\n\n[${message}]`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
