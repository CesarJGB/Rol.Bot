import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, Sparkles, Theater, Brain, RotateCw, MessagesSquare, FastForward } from "lucide-react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { MessageBubble } from "../components/MessageBubble";
import { SceneSheet } from "../components/SceneSheet";
import { MemorySheet } from "../components/MemorySheet";
import { ChatsSheet } from "../components/ChatsSheet";
import { buildSystemPrompt, buildMessages, stylingToParams } from "../lib/prompt";
import { chatComplete, chatRegenerate, chatContinue, extractMemories, summarizeChat, updateEmotion } from "../lib/api";
import { DEFAULT_EMOTION } from "../lib/constants";
import { toast } from "sonner";

const newMsgId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const newMessage = (role, content) => ({ id: newMsgId(), role, content, createdAt: Date.now() });

// Normalize memories so prompt builder gets consistent shape.
const normalizeMemories = (mems) => (mems || []).map((m, i) => {
  if (typeof m === "string") return { id: `mem_${i}`, text: m, pinned: false, createdAt: Date.now() };
  return m;
});

export default function Chat() {
  const { id: characterId } = useParams();
  const navigate = useNavigate();
  const {
    getCharacter, getBundle, getActiveSession,
    ensureSession, createSession, switchSession, renameSession, deleteSession,
    updateActiveSession, resetActiveSession,
    profile, settings,
  } = useApp();

  const character = getCharacter(characterId);
  const bundle = getBundle(characterId);
  const session = getActiveSession(characterId);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [streamingPlaceholder, setStreamingPlaceholder] = useState(false);

  const scrollerRef = useRef(null);

  // Ensure character has an active session.
  useEffect(() => {
    if (!character) return;
    ensureSession(characterId);
  }, [character, characterId, ensureSession]);

  // Seed the initial message on a fresh session.
  useEffect(() => {
    if (!character || !session) return;
    if (session.messages.length === 0 && character.initialMessage?.trim()) {
      updateActiveSession(characterId, (s) => ({
        ...s,
        messages: [{ ...newMessage("assistant", character.initialMessage), isInitial: true }],
      }));
    }
  }, [character, session, characterId, updateActiveSession]);

  // Auto-scroll.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [session?.messages?.length, streamingPlaceholder, session?.id]);

  const currentParams = useMemo(() => stylingToParams(settings), [settings]);

  const buildPayload = useCallback((history) => {
    const systemPrompt = buildSystemPrompt({
      character,
      scene: session?.scene,
      profile,
      settings,
      summary: session?.summary,
      memories: normalizeMemories(session?.memories),
      emotion: session?.emotion || DEFAULT_EMOTION,
      history,
    });
    return {
      messages: buildMessages({ systemPrompt, history, shortHistory: settings.shortHistory }),
      ...currentParams,
    };
  }, [character, session?.scene, session?.summary, session?.memories, session?.emotion, profile, settings, currentParams]);

  // ---- Background updates (memory / summary / emotion) ----
  const runBackgroundUpdates = useCallback(async (updatedMessages, currentSummary, currentMemories, currentEmotion) => {
    const tasks = [];
    // Summary: more frequently than before; centers on RECENT exchange.
    if (updatedMessages.length >= (settings.summarizeEvery || 8)) {
      const cutoff = Math.max(0, updatedMessages.length - settings.shortHistory);
      if (cutoff >= 2) {
        const chunk = updatedMessages.slice(0, cutoff).map(m => ({ role: m.role, content: m.content }));
        tasks.push(
          summarizeChat({ messages: chunk, character_name: character.name, previous_summary: currentSummary || "" })
            .then(s => ({ kind: "summary", value: s }))
            .catch(() => null)
        );
      }
    }
    // Memory: continuously updated. Look at last N messages, dedupe against existing.
    if (updatedMessages.length >= (settings.extractMemoryEvery || 4)) {
      const lastN = updatedMessages.slice(-(settings.extractMemoryEvery || 4)).map(m => ({ role: m.role, content: m.content }));
      const existingTexts = (currentMemories || []).map(m => (typeof m === "string" ? m : m.text));
      tasks.push(
        extractMemories({ messages: lastN, character_name: character.name, existing_memories: existingTexts })
          .then(found => ({ kind: "memories", value: found || [] }))
          .catch(() => null)
      );
    }
    // Emotion: periodic update.
    if (updatedMessages.length >= 3 && updatedMessages.length % (settings.emotionEvery || 6) === 0) {
      const tail = updatedMessages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      tasks.push(
        updateEmotion({ messages: tail, character_name: character.name, current_state: currentEmotion || DEFAULT_EMOTION })
          .then(state => ({ kind: "emotion", value: state }))
          .catch(() => null)
      );
    }

    if (tasks.length === 0) return;
    const results = (await Promise.all(tasks)).filter(Boolean);

    updateActiveSession(characterId, (s) => {
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
          // Cap: keep all pinned + last 80 unpinned.
          const pinned = merged.filter(m => m.pinned);
          const unpinned = merged.filter(m => !m.pinned).slice(-80);
          next.memories = [...pinned, ...unpinned];
        }
        if (r.kind === "emotion" && r.value) next.emotion = r.value;
      }
      return next;
    });
  }, [character, settings, characterId, updateActiveSession]);

  // ---- Actions ----

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !character || !session) return;

    const userMsg = newMessage("user", text);
    const nextMessages = [...(session.messages || []), userMsg];
    updateActiveSession(characterId, (s) => ({ ...s, messages: nextMessages }));
    setInput("");
    setBusy(true);
    setStreamingPlaceholder(true);

    try {
      const payload = buildPayload(nextMessages);
      const content = await chatComplete(payload);
      const aiMsg = newMessage("assistant", content);
      const updatedMessages = [...nextMessages, aiMsg];
      updateActiveSession(characterId, (s) => ({ ...s, messages: updatedMessages }));

      runBackgroundUpdates(updatedMessages, session.summary, session.memories, session.emotion);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo contactar con el modelo. Revisa tu clave de DeepSeek.");
    } finally {
      setBusy(false);
      setStreamingPlaceholder(false);
    }
  };

  // Continue scene without user input. Different from regenerate.
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
        toast.error("El modelo devolvió una respuesta vacía. Inténtalo de nuevo.");
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

  // EDIT message — robust against the "deleted AI then edit doesn't regen" bug.
  // Behavior:
  //   - If editing a USER message: trim everything after it, then generate a fresh AI reply.
  //   - If editing an ASSISTANT message: just update its content in-place (do not auto-regen).
  const handleEdit = async (msgIndex, newContent) => {
    const messages = session?.messages || [];
    const original = messages[msgIndex];
    if (!original) return;

    if (original.role === "user") {
      // Trim AFTER this user message — but keep the user message itself.
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
      // Editing AI message — just update in place. Variants are reset.
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

  // Regenerate — only the LAST AI message. Graduated intensity by attempt count.
  const handleRegenerate = async (msgIndex) => {
    const messages = session?.messages || [];
    const target = messages[msgIndex];
    if (!target || target.role !== "assistant" || busy) return;

    const history = messages.slice(0, msgIndex);
    const existingVariants = target.variants && target.variants.length > 0 ? target.variants : [target.content];
    const attempt = existingVariants.length; // 1st regen -> attempt=1, 2nd -> 2, etc.

    setBusy(true);
    setStreamingPlaceholder(true);
    try {
      const payload = buildPayload(history);
      const content = await chatRegenerate({
        ...payload,
        attempt,
        avoid_phrases: existingVariants,
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

  if (!character) {
    return (
      <div className="min-h-screen app-bg grid place-items-center">
        <div className="text-center">
          <div className="font-display text-2xl text-[#EDEDED] mb-2">Personaje no encontrado</div>
          <button onClick={() => navigate("/")} className="text-[#C6A45C] underline">Volver a la galería</button>
        </div>
      </div>
    );
  }

  const messages = session?.messages || [];
  const hasIntro = messages[0]?.isInitial;
  const sessionCount = Object.keys(bundle.sessions || {}).length;

  return (
    <div className="min-h-screen app-bg flex flex-col">
      <TopBar
        title={character.name}
        subtitle={session?.name ? `${session.name}${sessionCount > 1 ? ` · ${sessionCount} chats` : ""}` : (session?.scene?.location || character.sceneDefault?.location || "en escena")}
        right={
          <div className="flex items-center gap-1.5">
            <button
              data-testid="open-chats-button"
              onClick={() => setChatsOpen(true)}
              className="relative w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Conversaciones"
              title="Conversaciones"
            >
              <MessagesSquare size={15} />
              {sessionCount > 1 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 grid place-items-center bg-[#C6A45C] text-[#111111] rounded-full text-[9px] font-medium tabular-nums">
                  {sessionCount}
                </span>
              )}
            </button>
            <button
              data-testid="open-scene-button"
              onClick={() => setSceneOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Escena"
              title="Escena"
            >
              <Theater size={15} />
            </button>
            <button
              data-testid="open-memory-button"
              onClick={() => setMemoryOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Memoria"
              title="Memoria"
            >
              <Brain size={15} />
            </button>
          </div>
        }
      />

      <div ref={scrollerRef} data-testid="messages-scroll-area" className="flex-1 overflow-y-auto scroll-thin">
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
          {messages.length === 0 && !hasIntro && (
            <div className="text-center py-12">
              <p className="text-[#A1A1AA] mb-4">Esta conversación aún no tiene escena de apertura.</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  data-testid="generate-intro-button"
                  onClick={handleRegenIntro}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 bg-[#C6A45C] hover:bg-[#DBC184] disabled:opacity-50 text-[#111111] rounded-full px-4 py-2 text-sm font-medium transition-all"
                >
                  <Sparkles size={14} /> Generar apertura
                </button>
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const isLastAI = m.role === "assistant" && idx === messages.length - 1;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isUser={m.role === "user"}
                isInitial={!!m.isInitial}
                characterAvatar={character.avatar}
                characterName={character.name}
                isLast={isLastAI}
                onEdit={(content) => handleEdit(idx, content)}
                onDelete={() => handleDelete(idx)}
                onRegenerate={() => handleRegenerate(idx)}
                onSwipe={(delta) => handleSwipe(idx, delta)}
              />
            );
          })}

          {hasIntro && messages.length === 1 && (
            <div className="flex gap-2 flex-wrap pl-12">
              <button
                data-testid="regen-intro-button"
                onClick={handleRegenIntro}
                disabled={busy}
                className="text-[11px] uppercase tracking-wider text-[#A1A1AA] hover:text-[#C6A45C] inline-flex items-center gap-1 px-2 py-1 transition-colors disabled:opacity-50"
              >
                <RotateCw size={11} /> Regenerar apertura
              </button>
            </div>
          )}

          {streamingPlaceholder && (
            <div className="flex gap-3 anim-fade-up">
              <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden border border-white/[0.08] bg-[#111111]">
                {character.avatar && <img src={character.avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="bg-[#111111] border border-white/[0.06] rounded-2xl px-4 py-3">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}

          {/* "Continuar chat" — visible when there are messages and we're idle. */}
          {!streamingPlaceholder && messages.length >= 1 && messages[messages.length - 1]?.role === "assistant" && (
            <div className="flex justify-center pt-1">
              <button
                data-testid="continue-chat-button"
                onClick={handleContinue}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#A1A1AA] hover:text-[#C6A45C] border border-white/[0.08] hover:border-[#C6A45C]/40 rounded-full px-3 py-1.5 transition-all disabled:opacity-50"
                title="Avanza la escena sin enviar un mensaje"
              >
                <FastForward size={11} /> Continuar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 safe-bottom backdrop-blur-xl bg-[#050505]/90 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-end gap-2">
          <textarea
            data-testid="message-composer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Hablar con ${character.name}…`}
            rows={1}
            className="flex-1 resize-none bg-[#111111] border border-white/[0.08] rounded-2xl px-4 py-3 text-[15px] text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/50 max-h-32 overflow-y-auto scroll-thin"
            style={{ minHeight: 44 }}
          />
          <button
            data-testid="send-button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 w-11 h-11 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] disabled:bg-[#1C1C1C] disabled:text-[#71717A] text-[#111111] transition-all"
            aria-label="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <SceneSheet
        open={sceneOpen}
        onOpenChange={setSceneOpen}
        scene={session?.scene || {}}
        onChange={(s) => updateActiveSession(characterId, (sess) => ({ ...sess, scene: s }))}
      />
      <MemorySheet
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        memories={normalizeMemories(session?.memories)}
        summary={session?.summary || ""}
        emotion={session?.emotion || DEFAULT_EMOTION}
        onChangeMemories={(m) => updateActiveSession(characterId, (s) => ({ ...s, memories: m }))}
        onChangeSummary={(sum) => updateActiveSession(characterId, (s) => ({ ...s, summary: sum }))}
        onResetChat={() => { resetActiveSession(characterId); setMemoryOpen(false); toast.success("Conversación reiniciada"); }}
      />
      <ChatsSheet
        open={chatsOpen}
        onOpenChange={setChatsOpen}
        sessions={bundle.sessions || {}}
        activeSessionId={bundle.activeSessionId}
        onSwitch={(sid) => switchSession(characterId, sid)}
        onCreate={() => { createSession(characterId); setChatsOpen(false); toast.success("Nueva conversación creada"); }}
        onRename={(sid, name) => renameSession(characterId, sid, name)}
        onDelete={(sid) => { deleteSession(characterId, sid); toast.success("Conversación eliminada"); }}
      />
    </div>
  );
}
