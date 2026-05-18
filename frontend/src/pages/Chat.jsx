import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, Sparkles, Theater, Brain, RotateCw } from "lucide-react";
import { useApp } from "../context/AppContext";
import { TopBar } from "../components/TopBar";
import { MessageBubble } from "../components/MessageBubble";
import { SceneSheet } from "../components/SceneSheet";
import { MemorySheet } from "../components/MemorySheet";
import { buildSystemPrompt, buildMessages, stylingToParams } from "../lib/prompt";
import { chatComplete, chatRegenerate, extractMemories, summarizeChat } from "../lib/api";
import { toast } from "sonner";

const newMsgId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const newMessage = (role, content) => ({ id: newMsgId(), role, content, createdAt: Date.now() });

export default function Chat() {
  const { id: characterId } = useParams();
  const navigate = useNavigate();
  const { getCharacter, getChat, ensureChat, updateChat, resetChat, profile, settings } = useApp();

  const character = getCharacter(characterId);
  const chat = getChat(characterId);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [streamingPlaceholder, setStreamingPlaceholder] = useState(false);

  const scrollerRef = useRef(null);

  useEffect(() => {
    if (!character) return;
    ensureChat(characterId);
  }, [character, characterId, ensureChat]);

  // Seed initial message if needed.
  useEffect(() => {
    if (!character || !chat) return;
    if (chat.messages.length === 0 && character.initialMessage?.trim()) {
      updateChat(characterId, (c) => ({
        ...c,
        messages: [{ ...newMessage("assistant", character.initialMessage), isInitial: true }],
      }));
    }
  }, [character, chat, characterId, updateChat]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [chat?.messages?.length, streamingPlaceholder]);

  const currentParams = useMemo(() => stylingToParams(settings), [settings]);

  const buildPayload = useCallback((history) => {
    const systemPrompt = buildSystemPrompt({
      character,
      scene: chat?.scene,
      profile,
      settings,
      summary: chat?.summary,
      memories: chat?.memories,
    });
    return {
      messages: buildMessages({ systemPrompt, history, shortHistory: settings.shortHistory }),
      ...currentParams,
    };
  }, [character, chat?.scene, chat?.summary, chat?.memories, profile, settings, currentParams]);

  const maybeSummarize = useCallback(async (messages, prevSummary) => {
    if (messages.length < (settings.summarizeEvery || 12)) return prevSummary;
    const cutoff = messages.length - settings.shortHistory;
    if (cutoff < 4) return prevSummary;
    const chunk = messages.slice(0, cutoff).map(m => ({ role: m.role, content: m.content }));
    try {
      return await summarizeChat({ messages: chunk, character_name: character.name, previous_summary: prevSummary || "" });
    } catch {
      return prevSummary;
    }
  }, [character, settings.summarizeEvery, settings.shortHistory]);

  const maybeExtractMemories = useCallback(async (messages, existing) => {
    if (messages.length < (settings.extractMemoryEvery || 6)) return existing;
    const lastN = messages.slice(-settings.extractMemoryEvery).map(m => ({ role: m.role, content: m.content }));
    try {
      const found = await extractMemories({ messages: lastN, character_name: character.name, existing_memories: existing });
      if (!found || found.length === 0) return existing;
      const set = new Set((existing || []).map(s => s.toLowerCase().trim()));
      const merged = [...(existing || [])];
      for (const m of found) {
        const key = m.toLowerCase().trim();
        if (!set.has(key)) { set.add(key); merged.push(m); }
      }
      return merged.slice(-60);
    } catch {
      return existing;
    }
  }, [character, settings.extractMemoryEvery]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !character) return;

    const userMsg = newMessage("user", text);
    const nextMessages = [...(chat?.messages || []), userMsg];
    updateChat(characterId, (c) => ({ ...c, messages: nextMessages }));
    setInput("");
    setBusy(true);
    setStreamingPlaceholder(true);

    try {
      const payload = buildPayload(nextMessages);
      const content = await chatComplete(payload);
      const aiMsg = newMessage("assistant", content);
      const updatedMessages = [...nextMessages, aiMsg];
      updateChat(characterId, (c) => ({ ...c, messages: updatedMessages }));

      const [maybeSum, maybeMem] = await Promise.all([
        maybeSummarize(updatedMessages, chat?.summary),
        maybeExtractMemories(updatedMessages, chat?.memories),
      ]);
      updateChat(characterId, (c) => ({ ...c, summary: maybeSum, memories: maybeMem }));
    } catch (err) {
      console.error(err);
      toast.error("Could not reach the model. Check your DeepSeek key.");
    } finally {
      setBusy(false);
      setStreamingPlaceholder(false);
    }
  };

  const handleEdit = async (msgIndex, newContent) => {
    const messages = chat?.messages || [];
    const original = messages[msgIndex];
    if (!original) return;

    const trimmed = messages.slice(0, msgIndex + 1);
    trimmed[msgIndex] = { ...original, content: newContent };
    updateChat(characterId, (c) => ({ ...c, messages: trimmed }));

    if (original.role === "user") {
      setBusy(true);
      setStreamingPlaceholder(true);
      try {
        const payload = buildPayload(trimmed);
        const content = await chatComplete(payload);
        const aiMsg = newMessage("assistant", content);
        updateChat(characterId, (c) => ({ ...c, messages: [...trimmed, aiMsg] }));
      } catch {
        toast.error("Could not regenerate after edit.");
      } finally {
        setBusy(false);
        setStreamingPlaceholder(false);
      }
    }
  };

  const handleDelete = (msgIndex) => {
    const messages = chat?.messages || [];
    const next = [...messages];
    next.splice(msgIndex, 1);
    updateChat(characterId, (c) => ({ ...c, messages: next }));
  };

  const handleRegenerate = async (msgIndex) => {
    const messages = chat?.messages || [];
    const target = messages[msgIndex];
    if (!target || target.role !== "assistant" || busy) return;

    const history = messages.slice(0, msgIndex);
    setBusy(true);
    setStreamingPlaceholder(true);
    try {
      const payload = buildPayload(history);
      const content = await chatRegenerate(payload);
      const existingVariants = target.variants && target.variants.length > 0 ? target.variants : [target.content];
      const newVariants = [...existingVariants, content].slice(-4);
      const updated = { ...target, content, variants: newVariants, variantIndex: newVariants.length - 1 };
      const next = [...messages];
      next[msgIndex] = updated;
      updateChat(characterId, (c) => ({ ...c, messages: next }));
    } catch {
      toast.error("Regeneration failed.");
    } finally {
      setBusy(false);
      setStreamingPlaceholder(false);
    }
  };

  const handleSwipe = (msgIndex, delta) => {
    const messages = chat?.messages || [];
    const target = messages[msgIndex];
    if (!target?.variants || target.variants.length < 2) return;
    const total = target.variants.length;
    const next = ((target.variantIndex ?? 0) + delta + total) % total;
    const updated = { ...target, variantIndex: next, content: target.variants[next] };
    const arr = [...messages];
    arr[msgIndex] = updated;
    updateChat(characterId, (c) => ({ ...c, messages: arr }));
  };

  const handleRegenIntro = async () => {
    if (!character || busy) return;
    setBusy(true);
    try {
      const sys = buildSystemPrompt({ character, scene: chat?.scene, profile, settings });
      const ask = "Write the opening scene for this roleplay. A vivid in-character introduction setting the stage. Mostly action/atmosphere with one short opening line of dialogue. No meta commentary. Keep it under 90 words.";
      const payload = {
        messages: [
          { role: "system", content: sys },
          { role: "user", content: ask },
        ],
        ...currentParams,
        temperature: Math.min(1.5, currentParams.temperature + 0.2),
      };
      const content = await chatComplete(payload);
      const messages = chat?.messages || [];
      if (messages.length === 0) {
        updateChat(characterId, (c) => ({ ...c, messages: [{ ...newMessage("assistant", content), isInitial: true }] }));
      } else if (messages[0]?.isInitial) {
        const next = [...messages];
        next[0] = { ...next[0], content };
        updateChat(characterId, (c) => ({ ...c, messages: next }));
      }
      toast.success("New opening generated");
    } catch {
      toast.error("Couldn't generate intro.");
    } finally {
      setBusy(false);
    }
  };

  if (!character) {
    return (
      <div className="min-h-screen app-bg grid place-items-center">
        <div className="text-center">
          <div className="font-display text-2xl text-[#EDEDED] mb-2">Character not found</div>
          <button onClick={() => navigate("/")} className="text-[#C6A45C] underline">Back to gallery</button>
        </div>
      </div>
    );
  }

  const messages = chat?.messages || [];
  const hasIntro = messages[0]?.isInitial;

  return (
    <div className="min-h-screen app-bg flex flex-col">
      <TopBar
        title={character.name}
        subtitle={chat?.scene?.location || character.sceneDefault?.location || "in scene"}
        right={
          <div className="flex items-center gap-1.5">
            <button
              data-testid="open-scene-button"
              onClick={() => setSceneOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Scene"
              title="Scene"
            >
              <Theater size={15} />
            </button>
            <button
              data-testid="open-memory-button"
              onClick={() => setMemoryOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Memory"
              title="Memory"
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
              <p className="text-[#A1A1AA] mb-4">No opening scene yet.</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  data-testid="generate-intro-button"
                  onClick={handleRegenIntro}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 bg-[#C6A45C] hover:bg-[#DBC184] disabled:opacity-50 text-[#111111] rounded-full px-4 py-2 text-sm font-medium transition-all"
                >
                  <Sparkles size={14} /> Generate opening
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
                <RotateCw size={11} /> Regenerate opening
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
            placeholder={`Speak to ${character.name}…`}
            rows={1}
            className="flex-1 resize-none bg-[#111111] border border-white/[0.08] rounded-2xl px-4 py-3 text-[15px] text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/50 max-h-32 overflow-y-auto scroll-thin"
            style={{ minHeight: 44 }}
          />
          <button
            data-testid="send-button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 w-11 h-11 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] disabled:bg-[#1C1C1C] disabled:text-[#71717A] text-[#111111] transition-all"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <SceneSheet
        open={sceneOpen}
        onOpenChange={setSceneOpen}
        scene={chat?.scene || {}}
        onChange={(s) => updateChat(characterId, (c) => ({ ...c, scene: s }))}
      />
      <MemorySheet
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        memories={chat?.memories || []}
        summary={chat?.summary || ""}
        onChangeMemories={(m) => updateChat(characterId, (c) => ({ ...c, memories: m }))}
        onChangeSummary={(s) => updateChat(characterId, (c) => ({ ...c, summary: s }))}
        onResetChat={() => { resetChat(characterId); setMemoryOpen(false); toast.success("Conversation reset"); }}
      />
    </div>
  );
}
