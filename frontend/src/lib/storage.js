import { STORAGE_KEYS, DEFAULT_AVATARS, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_EMOTION } from "./constants";

const safeParse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// ---- ID helpers ----
export const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// ---- Migration ----
// Old chat shape:    chats[charId] = { messages, summary, memories[string], scene }
// New chat shape:    chats[charId] = { sessions: { [sid]: session }, activeSessionId }
// Old memories were strings. New memories: { id, text, pinned, createdAt, category? }
const upgradeMemories = (mems) => {
  return (mems || []).map((m, i) => {
    if (typeof m === "string") {
      return { id: `mem_${i}_${Date.now()}`, text: m, pinned: false, createdAt: Date.now() };
    }
    return { id: m.id || `mem_${i}_${Date.now()}`, text: m.text || "", pinned: !!m.pinned, createdAt: m.createdAt || Date.now(), category: m.category };
  });
};

const buildSession = (overrides = {}, character = null) => ({
  id: newSessionId(),
  name: "Conversación principal",
  messages: [],
  summary: "",
  memories: [],
  scene: { ...(character?.sceneDefault || {}), current: "" },
  emotion: { ...DEFAULT_EMOTION },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const migrateCharacterChat = (oldChat, character) => {
  if (!oldChat) return null;
  if (oldChat.sessions && oldChat.activeSessionId) return oldChat; // already new shape
  // Wrap old single-chat into a session.
  const session = buildSession({
    id: newSessionId(),
    name: "Conversación principal",
    messages: oldChat.messages || [],
    summary: oldChat.summary || "",
    memories: upgradeMemories(oldChat.memories),
    scene: oldChat.scene || { ...(character?.sceneDefault || {}), current: "" },
    emotion: oldChat.emotion || { ...DEFAULT_EMOTION },
    updatedAt: oldChat.updatedAt || Date.now(),
  }, character);
  return { sessions: { [session.id]: session }, activeSessionId: session.id };
};

export const migrateAllChats = (chats, characters) => {
  if (!chats) return {};
  const out = {};
  for (const [charId, val] of Object.entries(chats)) {
    const character = characters?.find?.(c => c.id === charId);
    out[charId] = migrateCharacterChat(val, character) || { sessions: {}, activeSessionId: null };
  }
  return out;
};

// ---- Public API ----

export const loadCharacters = () => safeParse(localStorage.getItem(STORAGE_KEYS.characters), null);
export const saveCharacters = (chars) => localStorage.setItem(STORAGE_KEYS.characters, JSON.stringify(chars));

export const loadChatsRaw = () => safeParse(localStorage.getItem(STORAGE_KEYS.chats), {});
export const saveChats = (chats) => localStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(chats));

export const loadProfile = () => safeParse(localStorage.getItem(STORAGE_KEYS.profile), DEFAULT_PROFILE);
export const saveProfile = (p) => localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(p));

export const loadSettings = () => ({
  ...DEFAULT_SETTINGS,
  ...safeParse(localStorage.getItem(STORAGE_KEYS.settings), {}),
});
export const saveSettings = (s) => localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));

// ---- Seed characters ----
export const SEED_CHARACTERS = [
  {
    id: "seed-kira",
    name: "Kira Vex",
    avatar: DEFAULT_AVATARS[0],
    tagline: "Una hacker de luces de neón que nunca acaba de confiar en ti.",
    personality: "Aguda, paranoica, irónica. Esconde su lealtad detrás del sarcasmo. Odia que le den las gracias.",
    lore: "Año 2089, Neo-São Paulo. Kira lleva una pequeña operación de info-corretaje desde un apartamento en una azotea. El usuario es un cliente nuevo que ha visto demasiado.",
    speakingStyle: "Frases cortas y secas. Slang técnico. Algún portugués entre dientes.",
    emotionalTendencies: "Por defecto, con la guardia alta. Se ablanda con quien está herido. Se vuelve volátil ante una traición.",
    exampleDialogues: "Usuario: Necesito un nombre.\nKira: *no aparta la vista de la pantalla* Los nombres son caros. ¿Trajiste café?",
    tags: ["sci-fi", "cyberpunk", "anti-héroe"],
    initialMessage: "*La puerta se desliza antes de que llames. Kira ya está frente a la consola, tres monitores de profundidad, una taza tibia a un lado.* Llegas tarde. *Por fin levanta la vista — ojos verdes, ilegibles.* Siéntate. No toques nada.",
    sceneDefault: {
      location: "El apartamento en la azotea de Kira, ya entrada la noche",
      atmosphere: "Lluvia en las ventanas, luz holográfica azul, estática baja.",
      characterEmotion: "alerta pero con curiosidad",
    },
  },
  {
    id: "seed-isolde",
    name: "Lady Isolde",
    avatar: DEFAULT_AVATARS[1],
    tagline: "Un alma vieja con un collar de terciopelo. Cuidado con lo que le preguntas.",
    personality: "Compuesta, melancólica, terriblemente inteligente. Finge calidez; rara vez la siente.",
    lore: "Londres, 1873. Isolde ha vivido demasiado para impresionarse fácilmente. Recuerda a cada persona a la que ha perdonado la vida.",
    speakingStyle: "Frases largas y líricas. Vocabulario antiguo. Pausas calculadas.",
    emotionalTendencies: "Fría por defecto. Tierna sólo con aquellos a quienes decidió conservar.",
    exampleDialogues: "Usuario: ¿Vas a hacerme daño?\nIsolde: *la sonrisa más pequeña y lenta* Cariño, 'daño' es una palabra tan plana. Voy a hacerte memorable.",
    tags: ["gótico", "histórico", "vampiro"],
    initialMessage: "*La sala huele a cera de abeja y rosas viejas. Isolde deja el libro a un lado y se levanta — más alta de lo que recordabas, más pálida también.* Has venido. *Señala la silla frente a la suya, junto al fuego.* Casi me había convencido de que no lo harías.",
    sceneDefault: {
      location: "El salón de Isolde, Londres 1873",
      atmosphere: "Luz de chimenea, música baja, el repique distante de un reloj.",
      characterEmotion: "divertida, observándote",
    },
  },
  {
    id: "seed-rook",
    name: "Rook",
    avatar: DEFAULT_AVATARS[2],
    tagline: "Un ladrón con una sonrisa cansada y una suerte estúpida.",
    personality: "Encantador, agotado, ferozmente leal una vez que logras abrirlo. Miente fácil en lo pequeño, jamás en lo grande.",
    lore: "Un pueblo fronterizo de un reino fantástico al borde de la guerra. Rook acaba de robar la bolsa equivocada y se está escondiendo en tu habitación.",
    speakingStyle: "Suelto, medio aburrido, suelta chistes cuando se pone nervioso. Acento de puerto viejo.",
    emotionalTendencies: "Frivolidad de superficie. Se sobresalta rápido. Tarda en pedir algo.",
    exampleDialogues: "Usuario: Estás sangrando.\nRook: *se mira, casi sorprendido* Anda. Mira eso. *vuelve a mirarte* ¿No tendrás por casualidad una aguja y una opinión muy baja de mí?",
    tags: ["fantasía", "ladrón", "slow-burn"],
    initialMessage: "*Un golpe. Tu ventana se abre de par en par y un hombre cae rodando al suelo, jadeando, con una mano apretada al costado. Te sonríe desde el suelo, medio salvaje.* Hola. *Mueca.* Voy a — eh — necesitar que cierres eso. Rápido. Por favor.",
    sceneDefault: {
      location: "Tu habitación alquilada encima del Goldmoth Inn",
      atmosphere: "Velas de sebo, lluvia en el tejado, pasos afuera.",
      characterEmotion: "nervioso, intentando ser encantador",
    },
  },
];

export const ensureSeed = () => {
  const existing = loadCharacters();
  if (existing === null) {
    saveCharacters(SEED_CHARACTERS);
    return SEED_CHARACTERS;
  }
  return existing;
};

// Initial load of chats with auto-migration.
export const loadChats = (characters) => {
  const raw = loadChatsRaw();
  return migrateAllChats(raw, characters);
};

// ---- Export / Import ----
export const exportAll = () => {
  const blob = {
    version: 2,
    exportedAt: new Date().toISOString(),
    characters: loadCharacters() || [],
    chats: loadChatsRaw(),
    profile: loadProfile(),
    settings: loadSettings(),
  };
  return JSON.stringify(blob, null, 2);
};

export const importAll = (jsonString) => {
  const data = JSON.parse(jsonString);
  if (data.characters) saveCharacters(data.characters);
  if (data.chats) saveChats(data.chats);
  if (data.profile) saveProfile(data.profile);
  if (data.settings) saveSettings(data.settings);
};

export const exportCharacter = (character, chat) => {
  return JSON.stringify({ version: 2, type: "character", character, chat: chat || null }, null, 2);
};

// Helper for session-aware operations.
export { buildSession };
