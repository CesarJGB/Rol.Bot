// Centralized model constant per spec.
export const DEEPSEEK_MODEL = "deepseek-v4-flash";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

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
  maxTokens: 420,
  shortHistory: 8,
  summarizeEvery: 12,
  extractMemoryEvery: 6,
};

export const DEFAULT_PROFILE = {
  name: "",
  personality: "",
  appearance: "",
  background: "",
};
