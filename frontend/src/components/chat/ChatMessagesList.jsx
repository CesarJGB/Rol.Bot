import React, { useEffect, useRef, useState } from "react";
import { RotateCw, Sparkles, FastForward, ArrowDown } from "lucide-react";
import { MessageBubble } from "../MessageBubble";

export function ChatMessagesList({
  messages, busy, streamingPlaceholder, streamingMsgId, character, sessionId,
  handleEdit, handleDelete, handleRegenerate, handleSwipe, handleRegenIntro, handleContinue
}) {
  const scrollerRef = useRef(null);
  const userNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const hasIntro = messages[0]?.isInitial;

  const scrollToLatest = (behavior = "smooth") => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    userNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  };

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;

    node.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => node.removeEventListener("scroll", handleScroll);
  }, [sessionId]);

  // Reacciona también a cambios de contenido durante el streaming.
  useEffect(() => {
    if (userNearBottomRef.current) scrollToLatest("auto");
  }, [messages, streamingPlaceholder, streamingMsgId, sessionId]);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        data-testid="messages-scroll-area"
        className="h-full overflow-y-auto overscroll-contain scroll-thin"
      >
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
          const isStreamingThis = streamingMsgId === m.id;
          if (isStreamingThis && (!m.content || m.content.length === 0)) return null;
          
          return (
            <MessageBubble
              key={m.id}
              message={m}
              disabled={busy}
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

        {(streamingPlaceholder || (streamingMsgId && !messages.find(m => m.id === streamingMsgId)?.content)) && (
          <div className="flex gap-3 anim-fade-up">
            <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden border border-white/[0.08] bg-[#111111]">
              {character.avatar && <img src={character.avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="bg-[#111111] border border-white/[0.06] rounded-2xl px-4 py-3">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}

        {!busy && !streamingMsgId && messages.length >= 1 && (
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

      {showJumpToLatest && (
        <button
          type="button"
          data-testid="jump-to-latest-button"
          onClick={() => {
            userNearBottomRef.current = true;
            setShowJumpToLatest(false);
            scrollToLatest("smooth");
          }}
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#111111]/95 px-3 py-2 text-xs text-[#EDEDED] shadow-lg backdrop-blur-md transition-colors hover:border-[#C6A45C]/50 hover:text-[#C6A45C]"
          aria-label="Ir al último mensaje"
        >
          <ArrowDown size={14} />
          Último mensaje
        </button>
      )}
    </div>
    </div>
  );
}
