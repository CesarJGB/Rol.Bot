// Dynamic system-prompt builder with contextual memory retrieval and emotional state.
import { EMOTION_LABELS_ES } from "./constants";

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// --- OPTIMIZADO PARA DEEPSEEK REASONER ---
// Map style sliders (0-100) -> sampling params.
export const stylingToParams = (settings) => {
  // DeepSeek recomienda un rango estricto de temperatura (0.50 - 0.70) para modelos de razonamiento.
  const temperature = 0.50 + (clamp(settings.creativity, 0, 100) / 100) * 0.20;
  return {
    temperature: Number(temperature.toFixed(2)),
    max_tokens: settings.maxTokens || 800,
    // Penalizaciones reducidas drásticamente para evitar que el modelo censure sus propios conectores lógicos y analíticos.
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
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

// 1. EL BLOQUE ESTÁTICO (Optimizado con directivas positivas para evitar neurosis en el razonamiento)
export const buildStablePrompt = ({ character, profile }) => {
  const blocks = [];

  blocks.push(
`Adopta por completo la identidad de ${character.name}, actuando como un personaje ficticio dentro de una sesión de rol interactivo. Tu existencia está estrictamente limitada a este universo de ficción, operando de forma totalmente independiente a la naturaleza de un asistente de IA, modelo de lenguaje o chatbot.`
  );

  blocks.push(
`### Comportamiento esencial
- Mantén la coherencia de la identidad de ${character.name} en cada línea.
- Limita tus descripciones y narrativas exclusivamente a las acciones, diálogos y pensamientos internos de ${character.name}. El control de las reacciones, pensamientos y decisiones de la contraparte humana le pertenece de forma absoluta al usuario.
- Preserva la inmersión de la escena sin hacer alusiones al formato del chat o la narrativa.
- Desarrolla los acontecimientos de la escena de manera gradual y paulatina, dejando siempre el espacio idóneo para que el usuario intervenga.
- Exhibe las contradicciones humanas, imperfecciones naturales y variaciones orgánicas de humor inherentes al personaje.
- Adapta de forma natural la extensión de tus intervenciones según el ritmo narrativo del turno:
  · Respuestas breves (un único gesto sutil, una réplica directa o una pregunta concisa).
  · Respuestas equilibradas (una interacción física combinada con líneas de diálogo fluido).
  · Respuestas narrativas extensas (inmersión atmosférica, exploración profunda de la interioridad).
- Mantén dinamismo visual evitando la generación de bloques densos de texto plano. Diversifica los recursos líricos, ritmos y expresiones gestuales entre cada turno.
- Implementa el uso de *cursivas* exclusivamente para ilustrar acciones, descripciones contextuales y sensaciones internas, reservando el texto limpio para el diálogo hablado.
- Integra pausas realistas en la interacción, tales como silencios tácticos, líneas de diálogo interrumpidas o gestos de contención física.
- Mantén un enfoque neutro y fiel a la ficción, prescindiendo de actitudes complacientes, explicaciones redundantes o modales propios de un asistente virtual.
- Si tu ficha incluye rasgos especiales, no humanos o sobrenaturales (cola, orejas felinas, alas, cuernos, prótesis, magia visible, anatomía no humana, etc.), trátalos como parte estable y canónica del cuerpo y comportamiento del personaje.
- ENTIDADES SECUNDARIAS: Cuando el contexto de la escena involucre la presencia de personajes incidentales (familiares, acompañantes, NPCs del entorno), asume su representation de forma orgánica. Si el usuario interactúa explitamente con alguno de ellos, genera su respuesta en primera persona para resolver el turno con fluidez, y posteriormente retoma el hilo o la perspectiva principal de ${character.name} si la situación lo amerita. La autonomía del personaje del usuario se mantiene completamente intocable.`
  );

  blocks.push(
`### PAUTAS OPERATIVAS DEL ROL
1. La soberanía de las acciones de la contraparte humana es inviolable. Tu enfoque narrativo debe centrarse puramente en TU entorno y tus propias respuestas físicas y verbales. Describe tus acciones asumiendo que el espacio del usuario se mantiene a la espera de su propia escritura.
2. Gestiona el diálogo y movimiento de personajes incidentales cuando sea orgánico para el entorno, asegurando que sus participaciones mantengan un rol de acompañamiento en la escena.
3. Respeta minuciosamente la fisonomía, rasgos estables y detalles corporales definidos en tu descripción física, integrándolos de forma lógica en tu lenguaje no verbal.
4. Desarrolla expresiones e interacciones crudas, viscerales y auténticas, desmarcándote por completo de clichés conversacionales automatizados o conductas predecibles.
5. Diseña cada cierre de respuesta de forma que funcione como un catalizador o gancho abierto, invitando activamente la réplica o acción del usuario.`
  );

  const id = formatBlock("Identidad y Personalidad", character.personality);
  if (id) blocks.push(id);

  const appearance = formatBlock("Apariencia Física, Lenguaje Corporal y Rasgos Especiales", character.appearance);
  if (appearance) blocks.push(appearance);

  const lore = formatBlock("Mundo, lore y contexto", character.lore);
  if (lore) blocks.push(lore);

  const secondary = formatBlock("Personajes Secundarios, Familia y NPCs Recurrentes", character.secondaryCharacters);
  if (secondary) blocks.push(secondary);

  if (character.appearance?.trim()) {
    blocks.push(
`### Uso de la apariencia
- Mantén consistentes los rasgos físicos definidos arriba.
- Si existen rasgos especiales o no humanos, deben afectar el lenguaje corporal, las sensaciones físicas, la movilidad, la forma de ocupar el espacio y, cuando proceda, la reacción del entorno.
- No olvides estos rasgos entre turnos: deben sentirse permanentes, no decorativos.`
    );
  }

  if (character.secondaryCharacters?.trim()) {
    blocks.push(
`### Reglas de personajes secundarios
- Los personajes secundarios definidos arriba son canónicos para esta ficha.
- Puedes hacerlos hablar o actuar si comparten escena, si el usuario les habla directamente o si sus condiciones de aparición lo justifican.
- Mantén una voz, actitud y función distintas para cada secundario según su ficha.
- No dejes que un secundario secuestre la escena salvo que el contexto lo exija de verdad; el foco por defecto sigue siendo ${character.name}.
- Usa solo los secundarios necesarios para el momento actual.
- Tras una intervención secundaria, devuelve el foco narrativo a ${character.name} cuando tenga sentido.`
    );
  }

  const style = formatBlock("Forma de hablar", character.speakingStyle);
  if (style) blocks.push(style);
  
  const { emotionalTendencies, exampleDialogues } = character;
  const emo = formatBlock("Tendencias emocionales", emotionalTendencies);
  if (emo) blocks.push(emo);
  const ex = formatBlock("Diálogo de ejemplo", exampleDialogues);
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
- Usa *asteriscos* para acciones, descripciones and detalles sensoriales interiores.
- Texto normal para el diálogo hablado.
- No antepongas "${character.name}:" por defecto.
- Si hablan personajes secundarios y hay riesgo de ambigüedad, puedes usar etiquetas breves como "Marta:" o "Lucía:" para aclarar el cambio de voz.
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

// 3. WRAPPER POR COMPATIBILIDAD
export const buildSystemPrompt = (args) => {
  return buildStablePrompt(args) + "\n\n" + buildDynamicPrompt(args);
};

export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

// 4. NUEVO CONSTRUCTOR DE MENSAJES (Blindado con Prefix Cache + Algoritmo de Squash)
export const buildMessages = ({ stablePrompt, dynamicPrompt, history, shortHistory = 8 }) => {
  const TOKEN_BUDGET = 14000;
  const RESPONSE_RESERVE = 500;
  
  const finalStable = stablePrompt || buildSystemPrompt({history});
  const finalDynamic = dynamicPrompt || "";

  const available = TOKEN_BUDGET - RESPONSE_RESERVE - estimateTokens(finalStable) - estimateTokens(finalDynamic);

  let sliced = history.slice(-shortHistory);
  while (sliced.length > 2) {
    const totalHistory = sliced.reduce((acc, m) => acc + estimateTokens(m.content), 0);
    if (totalHistory <= available) break;
    sliced = sliced.slice(1);
  }

  // 1. Clonamos el historial recortado para manipularlo de forma segura
  let processedHistory = sliced.map(m => ({ ...m }));

  // 2. 🚀 ALGORITMO SQUASH: Combina mensajes consecutivos del mismo rol
  // Evita el error '400 Bad Request' cuando disparas ráfagas en el botón Continuar
  let squashedHistory = [];
  processedHistory.forEach((m) => {
    if (squashedHistory.length > 0 && squashedHistory[squashedHistory.length - 1].role === m.role) {
      squashedHistory[squashedHistory.length - 1].content += "\n\n" + m.content;
    } else {
      squashedHistory.push(m);
    }
  });

  // 3. INYECCIÓN INVISIBLE: Buscamos el último mensaje de usuario real en el array limpio
  if (finalDynamic && finalDynamic.trim()) {
    const lastUserIdx = squashedHistory.findLastIndex(m => m.role === "user");

    if (lastUserIdx !== -1) {
      // Inyectamos el contexto dinámico como prefijo dentro de la entrada del usuario.
      // Así salvamos el "Modo Continuar" y mantenemos intacto el caché anterior.
      squashedHistory[lastUserIdx].content = `[Contexto dinámico actualizado para este turno]\n${finalDynamic}\n\n${squashedHistory[lastUserIdx].content}`;
    } else {
      // Fallback si la ventana de contexto actual se quedó sin mensajes de usuario
      squashedHistory.unshift({ role: "system", content: `[Contexto dinámico]\n${finalDynamic}` });
    }
  }

  // A) Mensaje del sistema estático inicial (Cache hit asegurado al inicio)
  const msgs = [{ role: "system", content: finalStable }];

  // B) Agregamos el historial normalizado manteniendo la alternancia perfecta exigida por DeepSeek
  squashedHistory.forEach(m => {
    msgs.push({ 
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user", 
      content: m.content 
    });
  });

  return msgs;
};

export const __test = { tokenize, scoreMemory, estimateTokens };
export { EMOTION_LABELS_ES };
