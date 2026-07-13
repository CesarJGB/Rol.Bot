import React, { useEffect, useRef } from "react";
import { RotateCw, Sparkles, FastForward } from "lucide-react";
import { MessageBubble } from "../MessageBubble";

export function ChatMessagesList({
  messages, busy, streamingPlaceholder, streamingMsgId, character, sessionId,
  handleEdit, handleDelete, handleRegenerate, handleSwipe, handleRegenIntro, handleContinue
}) {
  const scrollerRef = useRef(null);
  const hasIntro = messages[0]?.isInitial;

  // Auto-scroll reactivo e inteligente
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, streamingPlaceholder, streamingMsgId, sessionId]);

  return (
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
    </div>
  );
}
