// Centralized constants. Re-exports API config from /src/config.js.
// To change the backend URL, edit /src/config.js (NOT this file).

export { DEEPSEEK_MODEL, API, API_BASE_URL, API_PREFIX } from "../config";

export const DEFAULT_AVATARS = [
  "https://static.prod-images.emergentagent.com/jobs/c4338545-5522-42fe-a235-e8ec9c90ba5a/images/bec4f093627937edcb21232c2f4ad3748955c4a2aef3dbf5245a61833051acd7.png",
  "https://static.prod-images.emergentagent.com/jobs/c4338545-5522-42fe-a235-e8ec9c90ba5a/images/291b9b700cd8c81252d6e06612f1fd6257b56ce16b1669758da75b10cdde5bd0.png",
  "https://static.prod-images.emergentagent.com/jobs/c4338545-5522-42fe-a235-e8ec9c90ba5a/images/404508a675caaebc92c04f8033d24f183ab920c1f0b48ac6a673548df04dd175.png",
];

export const STORAGE_KEYS = {
  characters: "rp.characters.v1",
  chats: "rp.chats.v1",
  profile: "rp.profile.v1",
  settings: "rp.settings.v1",
};

export const DEFAULT_SETTINGS = {
  creativity: 60,
  romanticism: 40,
  emotionalIntensity: 55,
  maxTokens: 800,
  shortHistory: 8,
  summarizeEvery: 8,
  extractMemoryEvery: 4,
  emotionEvery: 6,
  maxMemoriesPerTurn: 8,
  // Streaming: typewriter effect. Set to false for one-shot responses.
  streamingEnabled: true,
};

export const DEFAULT_PROFILE = {
  name: "",
  personality: "",
  appearance: "",
  background: "",
};

export const DEFAULT_EMOTION = {
  trust: 50,
  affection: 50,
  tension: 30,
  fear: 20,
  hostility: 20,
};

export const EMOTION_LABELS_ES = {
  trust: "Confianza",
  affection: "Afecto",
  tension: "Tensión",
  fear: "Miedo",
  hostility: "Hostilidad",
};
