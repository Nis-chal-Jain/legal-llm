const OPEN_TAGS = [
  "<think>",
  "<thinking>",
  "<thought>",
  "<|think|>",
  "◁think▷",
];
const CLOSE_TAGS = [
  "</think>",
  "</thinking>",
  "</thought>",
  "<|/think|>",
  "</|think|>",
  "◁/think▷",
];

const ANSWER_START_RE =
  /(?:^|\n)#{1,6}\s+(?:final\s+)?(?:answer|visible reply)\b[^\n]*/i;

const REASONING_HEADING_RE =
  /^(#{1,6})\s*(thinking process|thought process|chain of thought|internal reasoning|reasoning process|reasoning|scratchpad|topic selection rationale)\s*$/i;

const COT_SIGNALS = [
  /the user asked/i,
  /system prompt/i,
  /let'?s plan/i,
  /default layout/i,
  /visible reply/i,
  /think inside/i,
  /draft the thinking/i,
  /first,\s*think/i,
  /put all internal thinking/i,
  /after <\/think>/i,
  /i need to (?:structure|identify|check|map)/i,
  /topic selection rationale/i,
];

function startsWithAny(text: string, index: number, tags: string[]) {
  const slice = text.slice(index).toLowerCase();
  for (const tag of tags) {
    if (slice.startsWith(tag.toLowerCase())) return tag.length;
  }
  return 0;
}

function incompleteTagLength(text: string, index: number, tags: string[]) {
  const slice = text.slice(index).toLowerCase();
  if (!slice.startsWith("<") && !slice.startsWith("◁")) return 0;
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower.startsWith(slice) && slice.length < lower.length) {
      return slice.length;
    }
  }
  return 0;
}

export class ThinkingSplitter {
  private inThink = false;
  private carry = "";

  push(chunk: string) {
    const text = this.carry + chunk;
    this.carry = "";
    let thinking = "";
    let answer = "";
    let i = 0;

    while (i < text.length) {
      if (this.inThink) {
        const closeLen = startsWithAny(text, i, CLOSE_TAGS);
        if (closeLen) {
          this.inThink = false;
          i += closeLen;
          continue;
        }
        const hold = incompleteTagLength(text, i, CLOSE_TAGS);
        if (hold) {
          this.carry = text.slice(i);
          break;
        }
        thinking += text[i];
        i += 1;
        continue;
      }

      const openLen = startsWithAny(text, i, OPEN_TAGS);
      if (openLen) {
        this.inThink = true;
        i += openLen;
        continue;
      }
      const hold = incompleteTagLength(text, i, OPEN_TAGS);
      if (hold) {
        this.carry = text.slice(i);
        break;
      }
      answer += text[i];
      i += 1;
    }

    return { thinking, answer };
  }

  flush() {
    const leftover = this.carry;
    this.carry = "";
    if (!leftover) return { thinking: "", answer: "" };
    if (this.inThink) return { thinking: leftover, answer: "" };
    return { thinking: "", answer: leftover };
  }
}

function lastIndexOfRegex(text: string, re: RegExp) {
  const global = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : `${re.flags}g`,
  );
  let match: RegExpExecArray | null;
  let last = -1;
  while ((match = global.exec(text))) {
    last = match[0].startsWith("\n") ? match.index + 1 : match.index;
  }
  return last;
}

export function thinkingScore(text: string) {
  return COT_SIGNALS.reduce((score, re) => score + (re.test(text) ? 1 : 0), 0);
}

function peelReasoningHeadings(markdown: string) {
  const lines = markdown.split("\n");
  const answer: string[] = [];
  const thinking: string[] = [];
  let inReasoning = false;

  for (const line of lines) {
    if (REASONING_HEADING_RE.test(line.trim())) {
      inReasoning = true;
      continue;
    }
    if (
      inReasoning &&
      /^#{1,6}\s+\S/.test(line.trim()) &&
      !REASONING_HEADING_RE.test(line.trim())
    ) {
      inReasoning = false;
    }
    if (inReasoning) thinking.push(line);
    else answer.push(line);
  }

  return {
    answer: answer.join("\n").trim(),
    thinking: thinking.join("\n").trim(),
  };
}

function joinParts(...parts: string[]) {
  return parts.filter((p) => p.trim()).join("\n\n");
}

export function separateThinkingAndAnswer(
  rawAnswer: string,
  rawThinking = "",
  streaming = false,
) {
  let thinking = rawThinking;
  let answer = rawAnswer;

  const headingAt = lastIndexOfRegex(answer, ANSWER_START_RE);

  if (headingAt > 0) {
    thinking = joinParts(thinking, answer.slice(0, headingAt));
    answer = answer.slice(headingAt);
  } else if (headingAt < 0) {
    if (streaming || thinkingScore(answer) >= 2) {
      thinking = joinParts(thinking, answer);
      answer = "";
    }
  }

  const peeled = peelReasoningHeadings(answer);
  answer = peeled.answer;
  if (peeled.thinking) thinking = joinParts(thinking, peeled.thinking);

  return {
    thinking: thinking.trim(),
    answer: answer.trim(),
  };
}

export function peelReasoningSections(markdown: string) {
  return separateThinkingAndAnswer(markdown, "", false);
}
