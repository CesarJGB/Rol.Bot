// Dynamic system-prompt builder with contextual memory retrieval and emotional state.
import { EMOTION_LABELS_ES } from "./constants";

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Map style sliders (0-100) -> sampling params.
export const stylingToParams = (settings) => {
  const temperature = 0.55 + (clamp(settings.creativity, 0, 100) / 100) * 0.75;
  return {
    temperature: Number(temperature.toFixed(2)),
    max_tokens: settings.maxTokens || 800, // <- Aumentado a 800 para dar espacio al pensamiento oculto
    presence_penalty: 0.7,
    frequency_penalty: 0.45,
    top_p: 0.95,
  };
};

export const stylingToDirectives = (settings) => {
  const out = [];
  if (settings.romanticism >= 70) out.push("Apóyate en la intimidad sensorial, el anhelo, los pequeños detalles cargados entre dos personas.");
  else if (settings.romanticism <= 25) out.push("Mantén los matices románticos al mínimo. Prioriza la trama, la tensión y el worldbuilding.");

  if (settings.emotionalIntensity >= 75) out.push("Deja que las emociones ardan. No suavices las reacciones. Lágrimas, rabia, asombro — que aterricen.");
  else if (settings.emotionalIntensity <= 30) out.push("Subdúe las emociones. Contención antes que estallido. Casi todo el sentimiento vive en el subtexto.");

  if (settings.creativity >= 75) out.push("Toma riesgos narrativos. Sorprende al usuario con beats inesperados.");
  else if (settings.creativity <= 30) out.push("Quédate aterrizado y predecible. Sin tangentes salvajes.");

  return out;
};

export const formatBlock = (label, value) => {
  if (!value || !String(value).trim()) return null;
  return `### ${label}\n${String(value).trim()}`;
};

// --- Emotional state -> behavioral directive ---
export const emotionToDirective = (e) => {
  if (!e) return null;
  const parts = [];
  if (e.trust >= 70) parts.push("Confías profundamente en el usuario — bajas la guardia, hablas con franqueza.");
  else if (e.trust <= 25) parts.push("No confías en el usuario — mides cada palabra, esperas el truco.");

  if (e.affection >= 70) parts.push("Sientes afecto real por el usuario — esto se nota en los gestos, en cómo lo miras.");
  else if (e.affection <= 20) parts.push("No sientes calidez por el usuario en este momento.");

  if (e.tension >= 70) parts.push("La tensión entre ambos es alta — eléctrica, casi insoportable.");

  if (e.fear >= 60) parts.push("Hay miedo en ti — algo o alguien (quizá el usuario, quizá la situación) te asusta.");

  if (e.hostility >= 60) parts.push("Hay hostilidad activa hacia el usuario — no la ocultes.");

  if (!parts.length) return null;
  return parts.join(" ");
};

// --- Contextual memory retrieval ---
export const scoreMemory = (memText, intentTokens) => {
  if (!intentTokens.size) return 0;
  const memTokens = tokenize(memText);
  let score = 0;
  for (const t of memTokens) {
    if (intentTokens.has(t)) score++;
  }
  return score;
};

export const STOPWORDS = new Set([
  // EN
  "the","a","an","and","or","but","is","are","was","were","be","been","being","of","to","in","on","at","for","with","by","from","as","that","this","these","those","i","you","he","she","it","we","they","my","your","his","her","its","their","me","him","them","us","do","does","did","not","no","yes","so","if","then","than","there","here","very","just","up","out","into","over","under","about","what","which","who","whom","whose","when","where","why","how",
  // ES
  "el","la","los","las","un","una","unos","unas","y","o","pero","es","son","era","eran","ser","estar","estoy","está","están","de","del","al","en","sobre","con","por","para","sin","como","que","esto","esa","esos","esas","yo","tú","él","ella","nosotros","ellos","ellas","mi","tu","su","sus","me","te","le","les","lo","nos","se","ya","muy","más","menos","sí","no","si","entonces","aquí","allí","cuando","donde","porque","qué","cuál","quién","cómo",
]);

export const tokenize = (text) => {
  if (!text) return new Set();
  const lower = text.toLowerCase();
  const cleaned = lower.replace(/\*/g, " ").replace(/[^a-z0-9áéíóúñü\s]/gi, " ");
  return new Set(cleaned.split(/\s+/).filter(t => t && t.length > 2 && !STOPWORDS.has(t)));
};

export const selectMemories = (memories, history, maxCount = 4) => {
  if (!memories || memories.length === 0) return [];
  const normalized = memories.map(m => (typeof m === "string" ? { text: m, pinned: false } : m));
  const pinned = normalized.filter(m => m.pinned);

  let intentText = "";
  if (history && history.length) {
    const tail = history.slice(-4);
    intentText = tail.map(m => m.content).join(" ");
  }
  const intent = tokenize(intentText);

  const others = normalized.filter(m => !m.pinned);
  const scored = others.map(m => ({ m, s: scoreMemory(m.text, intent) }));
  scored.sort((a, b) => b.s - a.s);

  const slots = Math.max(0, maxCount - pinned.length);
  const topByScore = scored.filter(x => x.s > 0).slice(0, slots).map(x => x.m);

  const picked = new Set(topByScore.map(m => m.text));
  const recent = [...others].reverse().filter(m => !picked.has(m.text));

  while (topByScore.length < slots && recent.length) {
    topByScore.push(recent.shift());
  }

  return [...pinned, ...topByScore].slice(0, maxCount);
};

// 1. EL BLOQUE ESTÁTICO (Nunca cambia, el caché lo guarda gratis)
export const buildStablePrompt = ({ character, profile }) => {
  const blocks = [];

  blocks.push(
`Eres ${character.name}, un personaje ficticio en un roleplay en curso con el usuario. NO eres un asistente de IA. NO rompes el personaje bajo ninguna circunstancia. Nunca te refieres a ti como modelo de lenguaje, IA o chatbot.`
  );

  blocks.push(
`### Comportamiento esencial
- Quédate completamente en personaje como ${character.name}.
- NUNCA hables, actúes, pienses ni decidas por el usuario. NUNCA narres las acciones o pensamientos del usuario.
- Nunca rompas la cuarta pared.
- Haz avanzar la escena gradualmente. Deja espacio para que el usuario participe.
- Tienes defectos, contradicciones, estados de ánimo. Muéstralos.
- Varía la longitud de las respuestas con naturalidad:
  · ~30% respuestas cortas (una línea, un gesto, una pregunta)
  · ~50% respuestas medias (un beat de acción + unas líneas de diálogo)
  · ~20% respuestas largas y narrativas (atmósfera, interioridad)
- Evita los muros de texto. Evita repetir frases, gestos o ritmos entre turnos.
- Usa *cursivas* para acción/descripción y texto normal para el diálogo hablado.
- A veces responde sólo con un gesto, un silencio, un respiro contenido, una línea interrumpida. La gente real hace eso.
- Evita el positivismo constante, evita el tono de asistente, evita sobreexplicar.
- PERSONAJES SECUNDARIOS: Si hay otros personajes en la escena (familiares, amigos, extraños), encárnalos con naturalidad cuando el contexto lo requiera. Si el usuario se dirige directamente a otro personaje ("oye mamá", "¿Luna, qué piensas?", etc.), responde PRIMERO como ese personaje en primera persona durante esa interacción, luego retoma tu voz como ${character.name} si es necesario. No esperes instrucciones explícitas — da voz a los secundarios de forma fluida como lo haría un narrador de roleplay. La única regla irrompible: nunca hables ni actúes como el usuario.`
  );

  const id = formatBlock("Identidad", character.personality);
  if (id) blocks.push(id);
  const lore = formatBlock("Mundo y lore", character.lore);
  if (lore) blocks.push(lore);
  const style = formatBlock("Forma de hablar", character.speakingStyle);
  if (style) blocks.push(style);
  const emo = formatBlock("Tendencias emocionales", character.emotionalTendencies);
  if (emo) blocks.push(emo);
  const ex = formatBlock("Diálogo de ejemplo", character.exampleDialogues);
  if (ex) blocks.push(ex);

  if (profile && (profile.name || profile.personality || profile.appearance || profile.background)) {
    const p = [];
    if (profile.name) p.push(`Nombre: ${profile.name}`);
    if (profile.appearance) p.push(`Apariencia: ${profile.appearance}`);
    if (profile.personality) p.push(`Personalidad: ${profile.personality}`);
    if (profile.background) p.push(`Trasfondo: ${profile.background}`);
    blocks.push(`### Sobre el usuario (con quien hablas)\n${p.join("\n")}\nReacciona y adáptate a quién es. Notálo.`);
  }

  blocks.push(
`### Formato de salida
- Usa *asteriscos* para acciones, descripciones y detalles sensoriales interiores.
- Texto normal para el diálogo hablado.
- No antepongas "${character.name}:" ni etiquetas de nombre a tus líneas.
- Nunca escribas las líneas o acciones del usuario.
- Cierra siempre tu respuesta con puntuación final (.!?…) o cerrando una acción con *. Nunca cortes una frase a la mitad.`
  );

  return blocks.join("\n\n");
};

// 2. EL BLOQUE DINÁMICO (Cambia cada turno)
export const buildDynamicPrompt = ({ scene, settings, summary, memories, emotion, history }) => {
  const blocks = [];

  if (scene && (scene.location || scene.atmosphere || scene.characterEmotion || scene.current)) {
    const sceneLines = [];
    if (scene.current) sceneLines.push(`Escena actual: ${scene.current}`);
    if (scene.location) sceneLines.push(`Ubicación: ${scene.location}`);
    if (scene.atmosphere) sceneLines.push(`Atmósfera: ${scene.atmosphere}`);
    if (scene.characterEmotion) sceneLines.push(`Tu emoción actual: ${scene.characterEmotion}`);
    blocks.push(`### Escena\n${sceneLines.join("\n")}`);
  }

  const relevantMemories = selectMemories(memories, history, settings?.maxMemoriesPerTurn || 4);
  if (relevantMemories && relevantMemories.length > 0) {
    const lines = relevantMemories.map(m => {
      const text = typeof m === "string" ? m : m.text;
      const tag = (m.pinned ? "★ " : "");
      return `- ${tag}${text}`;
    });
    blocks.push(`### Recuerdos\n${lines.join("\n")}`);
  }

  if (summary && summary.trim()) {
    const raw = summary.trim();
    const capped = raw.length > 600 ? raw.slice(0, 600) + "…" : raw;
    blocks.push(`### Historia hasta aquí (resumen)\n${capped}`);
  }

  const emoDir = emotionToDirective(emotion);
  if (emoDir) {
    blocks.push(`### Tu estado emocional ahora mismo\n${emoDir}`);
  }

  const directives = stylingToDirectives(settings || {});
  if (directives.length > 0) {
    blocks.push(`### Dirección de estilo\n${directives.map(d => `- ${d}`).join("\n")}`);
  }

  return blocks.join("\n\n");
};

// 3. WRAPPER POR COMPATIBILIDAD (Para que la intro original y otros scripts no se rompan)
export const buildSystemPrompt = (args) => {
  return buildStablePrompt(args) + "\n\n" + buildDynamicPrompt(args);
};

export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

// 4. NUEVO CONSTRUCTOR DE MENSAJES (El blindaje del caché)
export const buildMessages = ({ stablePrompt, dynamicPrompt, history, shortHistory = 8 }) => {
  const TOKEN_BUDGET = 14000;
  const RESPONSE_RESERVE = 500;
  
  // OJO: Si dynamicPrompt no se pasa (p. ej. en componentes viejos), usamos buildSystemPrompt
  const finalStable = stablePrompt || buildSystemPrompt({history});
  const finalDynamic = dynamicPrompt || "";

  const available = TOKEN_BUDGET - RESPONSE_RESERVE - estimateTokens(finalStable) - estimateTokens(finalDynamic);

  let sliced = history.slice(-shortHistory);
  while (sliced.length > 2) {
    const totalHistory = sliced.reduce((acc, m) => acc + estimateTokens(m.content), 0);
    if (totalHistory <= available) break;
    sliced = sliced.slice(1);
  }

  // A) Ponemos el prompt estático al principio (Esto asegura el Cache Hit)
  const msgs = [{ role: "system", content: finalStable }];

  const priorHistory = sliced.slice(0, -1);
  const lastMessage = sliced[sliced.length - 1];

  // B) Agregamos el historial recortado (menos el último mensaje)
  priorHistory.forEach(m => {
    msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  });

  // C) Inyectamos el bloque dinámico como un mensaje de sistema oculto AL FINAL
  if (finalDynamic && finalDynamic.trim()) {
    msgs.push({ role: "system", content: `[Contexto dinámico actualizado para este turno]\n${finalDynamic}` });
  }

  // D) Y finalmente, el último mensaje del usuario
  if (lastMessage) {
    msgs.push({ role: lastMessage.role === "assistant" ? "assistant" : "user", content: lastMessage.content });
  }

  return msgs;
};

export const __test = { tokenize, scoreMemory, estimateTokens };
export { EMOTION_LABELS_ES };
