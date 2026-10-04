export const MODELS = [
  {
    id: "qwen/qwen3.8-27b:free",
    name: "Qwen3.8 27B",
    provider: "Qwen",
    badge: "Q",
    accent: "#6366f1",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Gemma 4 26B",
    provider: "Google",
    badge: "G",
    accent: "#4285f4",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "qwen/qwen3.8-27b:free";

export const MODES = [
  { id: "auto", name: "Auto" },
  { id: "concept-explanation", name: "Concept explanation" },
  { id: "argument-drafting", name: "Argument drafting" },
  { id: "case-summary", name: "Case summary" },
] as const;

export type ModeId = (typeof MODES)[number]["id"];

export const DEFAULT_MODE: ModeId = "auto";

export const ALLOWED_MODEL_IDS = new Set<string>(MODELS.map((m) => m.id));
