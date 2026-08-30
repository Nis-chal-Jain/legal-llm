export const MODELS = [
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "Nemotron 3.5 Lightning",
    provider: "NVIDIA",
    badge: "N",
    accent: "#76b900",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Gemma 4 26B",
    provider: "Google",
    badge: "G",
    accent: "#4285f4",
  },
  {
    id: "minimax/minimax-m3:free",
    name: "MiniMax M3",
    provider: "MiniMax",
    badge: "M",
    accent: "#ef4444",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = MODELS[0].id;

export const ALLOWED_MODEL_IDS = new Set<string>(MODELS.map((m) => m.id));
