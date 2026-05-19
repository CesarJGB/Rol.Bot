import React, { useState } from "react";
import { Pencil, Trash2, RotateCw, ChevronLeft, ChevronRight, Check, X } from "lucide-react";

const renderContent = (text) => {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) {
      return <span key={i} className="italic text-[#A1A1AA]">{p.slice(1, -1)}</span>;
    }
    return <span key={i}>{p}</span>;
  });
};

export const MessageBubble = ({
  message,
  isUser,
  characterAvatar,
  characterName,
  onEdit,
  onDelete,
  onRegenerate,
  onSwipe,
  isLast,
  isInitial,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const variantCount = message.variants?.length || 0;
  const currentVariant = message.variantIndex ?? 0;

  const submitEdit = () => {
    if (draft.trim() === message.content.trim()) { setEditing(false); return; }
    onEdit?.(draft);
    setEditing(false);
  };

  return (
    <div data-testid={`message-${message.id}`} className={`anim-fade-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden border border-white/[0.08] bg-[#111111] mt-1">
          {characterAvatar ? (
            <img src={characterAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center font-display text-[#C6A45C]">
              {(characterName || "?").slice(0, 1)}
            </div>
          )}
        </div>
      )}

      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        {isInitial && <div className="label-eyebrow text-[#C6A45C]/70 mb-1.5">Apertura · escena</div>}
        {!editing ? (
          <div
            className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? "bg-transparent border border-white/[0.10] text-[#EDEDED]"
                : "bg-[#111111] border border-white/[0.06] text-[#EDEDED]"
            } ${isInitial ? "border-[#C6A45C]/25 bg-[#1a1308]" : ""}`}
          >
            {renderContent(message.content)}
          </div>
        ) : (
          <div className="w-full max-w-[88%] sm:max-w-[80%]">
            <textarea
              data-testid={`edit-message-textarea-${message.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="w-full bg-[#0a0a0a] border border-[#C6A45C]/40 rounded-2xl px-4 py-3 text-[15px] text-[#EDEDED] focus:outline-none focus:border-[#C6A45C] min-h-[100px] resize-y"
            />
            <div className="flex gap-2 mt-2 justify-end">
              <button
                data-testid={`cancel-edit-${message.id}`}
                onClick={() => { setEditing(false); setDraft(message.content); }}
                className="text-xs text-[#A1A1AA] hover:text-[#EDEDED] px-3 py-1.5 rounded-full border border-white/[0.08] transition-all inline-flex items-center gap-1"
              >
                <X size={12} /> Cancelar
              </button>
              <button
                data-testid={`confirm-edit-${message.id}`}
                onClick={submitEdit}
                className="text-xs text-[#111111] bg-[#C6A45C] hover:bg-[#DBC184] px-3 py-1.5 rounded-full transition-all inline-flex items-center gap-1"
              >
                <Check size={12} /> Guardar
              </button>
            </div>
          </div>
        )}

        {!editing && (
          <div className={`mt-1.5 flex items-center gap-1 flex-wrap ${isUser ? "justify-end" : ""}`}>
            {!isUser && variantCount > 1 && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  data-testid={`swipe-prev-${message.id}`}
                  onClick={() => onSwipe?.(-1)}
                  className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/5 text-[#A1A1AA] hover:text-[#C6A45C] transition-all"
                  aria-label="Variante anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] tabular-nums text-[#71717A] min-w-[28px] text-center">
                  {currentVariant + 1}/{variantCount}
                </span>
                <button
                  data-testid={`swipe-next-${message.id}`}
                  onClick={() => onSwipe?.(1)}
                  className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/5 text-[#A1A1AA] hover:text-[#C6A45C] transition-all"
                  aria-label="Variante siguiente"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <button
              data-testid={`edit-message-${message.id}`}
              onClick={() => setEditing(true)}
              className="text-[11px] uppercase tracking-wider text-[#71717A] hover:text-[#EDEDED] px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
            >
              <Pencil size={11} /> Editar
            </button>
            {!isUser && isLast && (
              <button
                data-testid={`regen-message-${message.id}`}
                onClick={() => onRegenerate?.()}
                className="text-[11px] uppercase tracking-wider text-[#71717A] hover:text-[#C6A45C] px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
              >
                <RotateCw size={11} /> Regenerar
              </button>
            )}
            <button
              data-testid={`delete-message-${message.id}`}
              onClick={() => onDelete?.()}
              className="text-[11px] uppercase tracking-wider text-[#71717A] hover:text-[#C83A3A] px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
            >
              <Trash2 size={11} /> Borrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
