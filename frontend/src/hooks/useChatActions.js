import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { chatComplete, chatStream, chatRegenerate, chatContinue, extractMemories, summarizeChat, updateEmotion } from "../lib/api";
import { buildStablePrompt, buildDynamicPrompt, buildMessages, stylingToParams } from "../lib/prompt";
import { looksCutOff } from "../lib/textUtil";
import { DEFAULT_EMOTION } from "../lib/constants";
import { toast } from "sonner";

const newMsgId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
export const newMessage = (role, content) => ({ id: newMsgId(), role, content, createdAt: Date.now() });

export const normalizeMemories = (mems) => (mems || []).map((m, i) => {
  if (typeof m === "string") return { id: `mem_${i}`, text: m, pinned: false, createdAt: Date.now() };
  return m;
});

/**
 * Helper de alto rendimiento para purgar bloques de razonamiento internos (<think>...</think>)
 * de los historiales pasados para evitar la inflación exponencial de tokens.
 */
const cleanThinkingTokens = (text) => {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

export function useChatActions({ character, session, characterId, profile, settings, updateActiveSession, updateSession, resetActiveSession }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingPlaceholder, setStreamingPlaceholder] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState(null);

  const abortRef = useRef(null);
  const bgUpdateInFlight = useRef(null);

  const currentParams = useMemo(() => stylingToParams(settings), [settings]);

  // Construye el payload optimizado limpiando la grasa de tokens históricos
  const buildPayload = useCallback((history) => {
    // OPTIMIZACIÓN CLAVE: Mapeamos el historial para remover los tokens <think> viejos del asistente.
    // Esto salva miles de tokens de entrada por mensaje en chats largos.
    const optimizedHistory = history.map(m => ({
      role: m.role,
      content: m.role === "assistant" ? cleanThinkingTokens(m.content) : m.content
    }));

    const args = {
      character, 
      scene: session?.scene, 
      profile, 
      settings,
      summary: session?.summary, 
      memories: normalizeMemories(session?.memories),
      emotion: session?.emotion || DEFAULT_EMOTION, 
      history: optimizedHistory
    };

    const stablePrompt = buildStablePrompt(args);
    const dynamicPrompt = buildDynamicPrompt(args);

    // Se autogestiona la ventana deslizable según el shortHistory configurado
    const maxHistoryWindow = settings.shortHistory || 12;

    return {
      messages: buildMessages({ 
        stablePrompt, 
        dynamicPrompt, 
        history: optimizedHistory, 
        shortHistory: maxHistoryWindow 
      }),
      ...currentParams,
    };
  }, [character, session?.scene, session?.summary, session?.memories, session?.emotion, profile, settings, currentParams]);

  // ---- Tareas en segundo plano ultra eficientes ----
  const runBackgroundUpdates = useCallback(async (updatedMessages, currentSummary, currentMemories, currentEmotion) => {
    const sessionId = session?.id;
    if (bgUpdateInFlight.current === sessionId) return;
    bgUpdateInFlight.current = sessionId;

    // Limpiamos los mensajes de actualización para que las utilidades no gasten tokens leyendo razonamientos
    const cleanMessages = updatedMessages.map(m => ({
      role: m.role,
      content: cleanThinkingTokens(m.content)
    }));

    const tasks = [];
    if (cleanMessages.length >= (settings.summarizeEvery || 8)) {
      const cutoff = Math.max(0, cleanMessages.length - settings.shortHistory);
      if (cutoff >= 2) {
        const chunk = cleanMessages.slice(0, cutoff);
        tasks.push(
          summarizeChat({ messages: chunk, character_name: character.name, previous_summary: currentSummary || "" })
            .then(s => ({ kind: "summary", value: s }))
            .catch(() => null)
        );
      }
    }
    if (cleanMessages.length >= (settings.extractMemoryEvery || 4)) {
      const lastN = cleanMessages.slice(-(settings.extractMemoryEvery || 4));
      const existingTexts = (currentMemories || []).map(m => (typeof m === "string" ? m : m.text));
      tasks.push(
        extractMemories({ messages: lastN, character_name: character.name, existing_memories: existingTexts })
          .then(found => ({ kind: "memories", value: found || [] }))
          .catch(() => null)
      );
    }
    if (cleanMessages.length >= 3 && cleanMessages.length % (settings.emotionEvery || 6) === 0) {
      const tail = cleanMessages.slice(-6);
      tasks.push(
        updateEmotion({ messages: tail, character_name: character.name, current_state: currentEmotion || DEFAULT_EMOTION })
          .then(state => ({ kind: "emotion", value: state }))
          .catch(() => null)
      );
    }

    if (tasks.length === 0) { bgUpdateInFlight.current = null; return; }

    try {
      const results = (await Promise.all(tasks)).filter(Boolean);

      updateSession(characterId, sessionId, (s) => {
        let next = { ...s };
        for (const r of results) {
          if (r.kind === "summary" && r.value) next.summary = r.value;
          if (r.kind === "memories" && Array.isArray(r.value) && r.value.length > 0) {
            const existingTexts = new Set((s.memories || []).map(m => (typeof m === "string" ? m : m.text).toLowerCase().trim()));
            const merged = normalizeMemories(s.memories);
            for (const m of r.value) {
              const key = m.toLowerCase().trim();
              if (!existingTexts.has(key)) {
                existingTexts.add(key);
                merged.push({ id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`, text: m, pinned: false, createdAt: Date.now() });
              }
            }
            const pinned = merged.filter(m => m.pinned);
            const unpinned = merged.filter(m => !m.pinned).slice(-30);
            next.memories = [...pinned, ...unpinned];
          }
          if (r.kind === "emotion" && r.value) next.emotion = r.value;
        }
        return next;
      });
    } finally {
      bgUpdateInFlight.current = null;
    }
  }, [character, settings, characterId, session?.id, updateSession]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !character || !session) return;

    const userMsg = newMessage("user", text);
    const aiMsg = newMessage("assistant", "");
    const messagesWithUser = [...(session.messages || []), userMsg];
    const messagesWithAI = [...messagesWithUser, aiMsg];

    updateActiveSession(characterId, (s) => ({ ...s, messages: messagesWithAI }));
    setInput("");
    setBusy(true);
    setStreamingMsgId(aiMsg.id);

    const useStreaming = settings.streamingEnabled !== false;
    let finalContent = "";
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = buildPayload(messagesWithUser);

      if (useStreaming) {
        let buffer = "";
        let lastFlush = Date.now();
        for await (const delta of chatStream(payload, { signal: controller.signal })) {
          finalContent += delta;
          buffer += delta;
          const now = Date.now();
          if (now - lastFlush > 40 || buffer.length > 30) {
            const snapshot = finalContent;
            updateActiveSession(characterId, (s) => {
              const msgs = [...s.messages];
              const idx = msgs.findIndex(m => m.id === aiMsg.id);
              if (idx >= 0) msgs[idx] = { ...msgs[idx], content: snapshot };
              return { ...s, messages: msgs };
            });
            buffer = "";
            lastFlush = now;
          }
        }
        if (buffer.length > 0) {
          const snapshot = finalContent;
          updateActiveSession(characterId, (s) => {
            const msgs = [...s.messages];
            const idx = msgs.findIndex(m => m.id === aiMsg.id);
            if (idx >= 0) msgs[idx] = { ...msgs[idx], content: snapshot };
            return { ...s, messages: msgs };
          });
        }

        const trimmedContent = finalContent ? finalContent.trim() : "";

        if (trimmedContent && looksCutOff(trimmedContent)) {
          try {
            const basePayload = buildPayload(messagesWithUser);
            const contPayload = {
              ...basePayload,
              max_tokens: 250,
              temperature: Math.max(0.4, (basePayload.temperature || 0.85) - 0.2),
            };
            
            // Inyectamos la respuesta limpia sin acumular sub-pensamientos
            contPayload.messages.push({ role: "assistant", content: cleanThinkingTokens(trimmedContent) });
            contPayload.messages.push({ 
              role: "user", 
              content: "[Continue exactly from the last character. No preamble. Plain text continuation only.]" 
            });

            const tail = await chatComplete(contPayload);
            
            if (tail && tail.trim()) {
              const glue = /^[ ,.!?*"\)\]]/.test(tail) ? "" : " ";
              finalContent = trimmedContent + glue + tail;
              
              updateActiveSession(characterId, (s) => {
                const msgs = [...s.messages];
                const idx = msgs.findIndex(m => m.id === aiMsg.id);
                if (idx >= 0) msgs[idx] = { ...msgs[idx], content: finalContent };
                return { ...s, messages: msgs };
              });
            }
          } catch { /* ignorar fallo de extensión */ }
        }
      } else {
        finalContent = await chatComplete(payload);
        updateActiveSession(characterId, (s) => {
          const msgs = [...s.messages];
          const idx = msgs.findIndex(m => m.id === aiMsg.id);
          if (idx >= 0) msgs[idx] = { ...msgs[idx], content: finalContent };
          return { ...s, messages: msgs };
        });
      }

      if (!finalContent.trim()) {
        updateActiveSession(characterId, (s) => ({ ...s, messages: s.messages.filter(m => m.id !== aiMsg.id) }));
        toast.error("El modelo devolvió una respuesta vacía. Inténtalo de nuevo.");
        return;
      }

      const settled = [...messagesWithUser, { ...aiMsg, content: finalContent }];
      runBackgroundUpdates(settled, session.summary, session.memories, session.emotion);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
        toast.error("No se pudo contactar con el modelo. Revisa tu conexión.");
        if (!finalContent) {
          updateActiveSession(characterId, (s) => ({ ...s, messages: s.messages.filter(m => m.id !== aiMsg.id) }));
        }
      }
    } finally {
      setBusy(false);
      setStreamingMsgId(null);
      abortRef.current = null;
    }
  };

  const handleContinue = async () => {
    if (!character || !session || busy) return;
    const messages = session.messages || [];
    if (messages.length === 0) return;

    setBusy(true);
    setStreamingPlaceholder(true);
    try {
      const payload = buildPayload(messages);
      const content = await chatContinue(payload);
      if (!content || !content.trim()) {
        toast.error("El modelo devolvió una respuesta vacía.");
        return;
      }
      const aiMsg = newMessage("assistant", content);
      const updatedMessages = [...messages, aiMsg];
      updateActiveSession(characterId, (s) => ({ ...s, messages: updatedMessages }));
      runBackgroundUpdates(updatedMessages, session.summary, session.memories, session.emotion);
    } catch {
      toast.error("No se pudo continuar la escena.");
    } finally {
      setBusy(false);
      setStreamingPlaceholder(false);
    }
  };

  const handleEdit = async (msgIndex, newContent) => {
    const messages = session?.messages || [];
    const original = messages[msgIndex];
    if (!original) return;

    if (original.role === "user") {
      const trimmed = messages.slice(0, msgIndex + 1);
      trimmed[msgIndex] = { ...original, content: newContent };
      updateActiveSession(characterId, (s) => ({ ...s, messages: trimmed }));

      setBusy(true);
      setStreamingPlaceholder(true);
      try {
        const payload = buildPayload(trimmed);
        const content = await chatComplete(payload);
        const aiMsg = newMessage("assistant", content);
        const updatedMessages = [...trimmed, aiMsg];
        updateActiveSession(characterId, (s) => ({ ...s, messages: updatedMessages }));
        runBackgroundUpdates(updatedMessages, session?.summary, session?.memories, session?.emotion);
      } catch {
        toast.error("No se pudo regenerar después de editar.");
      } finally {
        setBusy(false);
        setStreamingPlaceholder(false);
      }
    } else {
      const next = [...messages];
      next[msgIndex] = { ...original, content: newContent, variants: [newContent], variantIndex: 0 };
      updateActiveSession(characterId, (s) => ({ ...s, messages: next }));
    }
  };

  const handleDelete = (msgIndex) => {
    const messages = session?.messages || [];
    const next = [...messages];
    next.splice(msgIndex, 1);
    updateActiveSession(characterId, (c) => ({ ...c, messages: next }));
  };

  const handleRegenerate = async (msgIndex) => {
    const messages = session?.messages || [];
    const target = messages[msgIndex];
    if (!target || target.role !== "assistant" || busy) return;

    const history = messages.slice(0, msgIndex);
    const existingVariants = target.variants && target.variants.length > 0 ? target.variants : [target.content];
    const attempt = existingVariants.length;

    setBusy(true);
    setStreamingPlaceholder(true);
    try {
      const payload = buildPayload(history);
      const content = await chatRegenerate({
        ...payload,
        attempt,
        avoid_phrases: existingVariants.map(cleanThinkingTokens), // Evita fugas aquí también
      });
      const newVariants = [...existingVariants, content].slice(-4);
      const updated = { ...target, content, variants: newVariants, variantIndex: newVariants.length - 1 };
      const next = [...messages];
      next[msgIndex] = updated;
      updateActiveSession(characterId, (s) => ({ ...s, messages: next }));
    } catch {
      toast.error("La regeneración falló.");
    } finally {
      setBusy(false);
      setStreamingPlaceholder(false);
    }
  };

  const handleSwipe = (msgIndex, delta) => {
    const messages = session?.messages || [];
    const target = messages[msgIndex];
    if (!target?.variants || target.variants.length < 2) return;
    const total = target.variants.length;
    const next = ((target.variantIndex ?? 0) + delta + total) % total;
    const updated = { ...target, variantIndex: next, content: target.variants[next] };
    const arr = [...messages];
    arr[msgIndex] = updated;
    updateActiveSession(characterId, (s) => ({ ...s, messages: arr }));
  };

  const handleRegenIntro = async () => {
    if (!character || busy) return;
    setBusy(true);
    try {
      const sys = buildSystemPrompt({
        character, scene: session?.scene, profile, settings,
        memories: normalizeMemories(session?.memories), emotion: session?.emotion, history: [],
      });
      const ask = "Escribe la apertura de esta escena de roleplay. Una introducción vívida y en personaje que prepare el escenario. Casi todo acción/atmósfera con una sola línea corta de diálogo de apertura. Sin comentario meta. Máximo 90 palabras.";
      const payload = {
        messages: [
          { role: "system", content: sys },
          { role: "user", content: ask },
        ],
        ...currentParams,
        temperature: Math.min(1.5, currentParams.temperature + 0.2),
      };
      const content = await chatComplete(payload);
      const messages = session?.messages || [];
      if (messages.length === 0) {
        updateActiveSession(characterId, (s) => ({ ...s, messages: [{ ...newMessage("assistant", content), isInitial: true }] }));
      } else if (messages[0]?.isInitial) {
        const next = [...messages];
        next[0] = { ...next[0], content };
        updateActiveSession(characterId, (s) => ({ ...s, messages: next }));
      }
      toast.success("Nueva apertura generada");
    } catch {
      toast.error("No se pudo generar la apertura.");
    } finally {
      setBusy(false);
    }
  };

  return {
    input, setInput, busy, streamingPlaceholder, streamingMsgId,
    send, handleContinue, handleEdit, handleDelete, handleRegenerate, handleSwipe, handleRegenIntro
  };
}
