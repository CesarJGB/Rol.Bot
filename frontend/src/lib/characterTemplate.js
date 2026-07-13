const yamlString = (value = "") => JSON.stringify(String(value || ""));

export const CHARACTER_TEMPLATE_FILE_NAME = "rolbot-character-template.yaml";

export const buildCharacterTemplate = ({ name = "" } = {}) => [
  "# Rol.Bot Character Blueprint",
  "# Uso recomendado:",
  "# 1) Rellena este YAML con un modelo externo o manualmente.",
  "# 2) Puedes copiar cada bloque a su campo correspondiente dentro del editor.",
  "# 3) O pegar el YAML completo en un campo largo (por ejemplo Personalidad) y usar Auto-Rellenar.",
  "# 4) Mantén las claves top-level tal como están para no perder información.",
  `name: ${yamlString(name)}`,
  'tagline: ""',
  "personality: |",
  "  core_traits:",
  "  contradictions:",
  "  desires:",
  "  fears:",
  "  habits:",
  "  moral_limits:",
  "appearance: |",
  "  overall:",
  "  face:",
  "  hair:",
  "  eyes:",
  "  body:",
  "  clothing:",
  "  bodyLanguage:",
  "  voice:",
  "  specialFeatures:",
  "lore: |",
  "  setting:",
  "  current_status:",
  "  backstory:",
  "  current_conflict:",
  "secondaryCharacters: |",
  "  - name:",
  "    relation:",
  "    role:",
  "    appearance:",
  "    personality:",
  "    speakingStyle:",
  "    triggerConditions:",
  "    turnRules:",
  "    boundaries:",
  "    sampleLine:",
  "speakingStyle: |",
  "  rhythm:",
  "  vocabulary:",
  "  verbalTics:",
  "  tabooPhrases:",
  "  intimacyMode:",
  "emotionalTendencies: |",
  "  baseline:",
  "  softSpots:",
  "  angerTriggers:",
  "  fearTriggers:",
  "  attachmentPattern:",
  "exampleDialogues: |",
  "  User: ...",
  "  Main Character: ...",
  "  Secondary Character: ...",
  "tags:",
  "  - genre",
  "  - trope",
  "initialMessage: |",
  "  *Describe la apertura de la escena y la primera línea del personaje.*",
  "sceneDefault:",
  '  location: ""',
  '  atmosphere: ""',
  '  characterEmotion: ""',
  "",
].join("\n");

export const downloadCharacterTemplate = (options = {}) => {
  const content = buildCharacterTemplate(options);
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = CHARACTER_TEMPLATE_FILE_NAME;
  a.click();
  URL.revokeObjectURL(url);
};
