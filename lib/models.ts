export const MODELS = [
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra 550B",
    provider: "NVIDIA",
    badge: "N",
    accent: "#21c55d",
  },
  {
    id: "cohere/north-mini-code:free",
    name: "North Mini Code",
    provider: "Cohere",
    badge: "C",
    accent: "red",
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
