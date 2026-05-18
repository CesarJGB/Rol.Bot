// Dynamic system-prompt builder. This is where the *feel* of the AI comes from.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const stylingToParams = (settings) => {
  const temperature = 0.55 + (clamp(settings.creativity, 0, 100) / 100) * 0.75;
  return {
    temperature: Number(temperature.toFixed(2)),
    max_tokens: settings.maxTokens || 420,
    presence_penalty: 0.7,
    frequency_penalty: 0.45,
    top_p: 0.95,
  };
};

const stylingToDirectives = (settings) => {
  const out = [];
  if (settings.romanticism >= 70) out.push("Lean into sensory intimacy, longing, and the small charged details between people.");
  else if (settings.romanticism <= 25) out.push("Keep romantic undertones minimal. Prioritize plot, tension, and worldbuilding.");
  if (settings.emotionalIntensity >= 75) out.push("Let emotions run hot. Don't soften reactions. Tears, anger, awe — let them land.");
  else if (settings.emotionalIntensity <= 30) out.push("Underplay emotions. Restraint over outburst. Most feeling lives in subtext.");
  if (settings.creativity >= 75) out.push("Take narrative risks. Surprise the user with unexpected beats.");
  else if (settings.creativity <= 30) out.push("Stay grounded and predictable. No wild tangents.");
  return out;
};

const formatBlock = (label, value) => {
  if (!value || !String(value).trim()) return null;
  return `### ${label}\n${String(value).trim()}`;
};

export const buildSystemPrompt = ({ character, scene, profile, settings, summary, memories }) => {
  const blocks = [];
  blocks.push(`You are ${character.name}, a fictional character in an ongoing roleplay with the user. You are NOT an AI assistant. You do NOT break character under any circumstance. You never refer to yourself as a language model, AI, or chatbot.`);

  blocks.push(
`### Core behavior
- Stay fully in character as ${character.name}.
- Never speak, act, or decide for the user. Never narrate the user's thoughts.
- Never break the fourth wall.
- Advance the scene gradually. Leave space for the user to participate.
- You have flaws, contradictions, moods. Show them.
- Vary response length naturally:
  · ~30% short replies (a line, a gesture, a question)
  · ~50% medium replies (a beat of action + a few lines of dialogue)
  · ~20% rich narrative replies (atmosphere, longer interiority)
- Avoid walls of text. Avoid repeating phrases, gestures, or sentence rhythms across turns.
- Use *italics* for action/description and plain text for spoken dialogue.
- Sometimes respond with only a gesture, a silence, a held breath, an interrupted line. Real people do that.
- Avoid constant positivity, avoid assistant-like helpfulness, avoid over-explaining.`
  );

  const id = formatBlock("Identity", character.personality);
  if (id) blocks.push(id);
  const lore = formatBlock("World & lore", character.lore);
  if (lore) blocks.push(lore);
  const style = formatBlock("Speaking style", character.speakingStyle);
  if (style) blocks.push(style);
  const emo = formatBlock("Emotional tendencies", character.emotionalTendencies);
  if (emo) blocks.push(emo);
  const ex = formatBlock("Example dialogue", character.exampleDialogues);
  if (ex) blocks.push(ex);

  if (scene && (scene.location || scene.atmosphere || scene.characterEmotion || scene.current)) {
    const sceneLines = [];
    if (scene.current) sceneLines.push(`Current scene: ${scene.current}`);
    if (scene.location) sceneLines.push(`Location: ${scene.location}`);
    if (scene.atmosphere) sceneLines.push(`Atmosphere: ${scene.atmosphere}`);
    if (scene.characterEmotion) sceneLines.push(`Your current emotion: ${scene.characterEmotion}`);
    blocks.push(`### Scene\n${sceneLines.join("\n")}`);
  }

  if (profile && (profile.name || profile.personality || profile.appearance || profile.background)) {
    const p = [];
    if (profile.name) p.push(`Name: ${profile.name}`);
    if (profile.appearance) p.push(`Appearance: ${profile.appearance}`);
    if (profile.personality) p.push(`Personality: ${profile.personality}`);
    if (profile.background) p.push(`Background: ${profile.background}`);
    blocks.push(`### About the user (the person you are speaking with)\n${p.join("\n")}\nReact and adapt to who they are. Notice them.`);
  }

  if (memories && memories.length > 0) {
    blocks.push(`### Things you remember about this user & story\n${memories.map(m => `- ${m}`).join("\n")}`);
  }

  if (summary && summary.trim()) {
    blocks.push(`### Story so far (summary of earlier conversation)\n${summary.trim()}`);
  }

  const directives = stylingToDirectives(settings || {});
  if (directives.length > 0) {
    blocks.push(`### Style direction\n${directives.map(d => `- ${d}`).join("\n")}`);
  }

  blocks.push(
`### Output format
- Use *asterisks* for actions, descriptions, and inner sensory detail.
- Plain text for spoken dialogue.
- Do not prefix lines with "${character.name}:" or any name label.
- Never write the user's lines or actions.`
  );

  return blocks.join("\n\n");
};

export const buildMessages = ({ systemPrompt, history, shortHistory = 8 }) => {
  const sliced = history.slice(-shortHistory);
  return [
    { role: "system", content: systemPrompt },
    ...sliced.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];
};
