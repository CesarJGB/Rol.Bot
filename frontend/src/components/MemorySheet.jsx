import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Plus, X, Pin, PinOff } from "lucide-react";
import { EMOTION_LABELS_ES } from "../lib/constants";

const EmotionBar = ({ label, value }) => (
  <div className="mb-2.5">
    <div className="flex justify-between items-baseline text-[11px] mb-1">
      <span className="text-[#A1A1AA] uppercase tracking-wider">{label}</span>
      <span className="text-[#C6A45C] tabular-nums">{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div className="h-full bg-gradient-to-r from-[#8e7234] to-[#C6A45C] transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  </div>
);

export const MemorySheet = ({
  open, onOpenChange,
  memories, summary, emotion,
  onChangeMemories, onChangeSummary, onResetChat,
}) => {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const item = { id: `mem_${Date.now().toString(36)}`, text: v, pinned: false, createdAt: Date.now() };
    onChangeMemories([...(memories || []), item]);
    setDraft("");
  };

  const remove = (i) => onChangeMemories(memories.filter((_, idx) => idx !== i));
  const togglePin = (i) => {
    const next = memories.map((m, idx) => {
      const item = typeof m === "string" ? { id: `mem_${idx}`, text: m, pinned: false } : m;
      return idx === i ? { ...item, pinned: !item.pinned } : item;
    });
    onChangeMemories(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#0a0a0a] border-t border-white/[0.08] text-[#EDEDED] max-h-[88vh] overflow-y-auto scroll-thin">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">Memoria</SheetTitle>
          <SheetDescription className="text-[#A1A1AA] text-sm">
            Lo que este personaje recuerda de ti y de la historia hasta ahora.
          </SheetDescription>
        </SheetHeader>

        {/* Emotional state */}
        {emotion && (
          <div className="mt-5 bg-[#111111] border border-white/[0.06] rounded-xl p-4">
            <div className="label-eyebrow mb-3 text-[#C6A45C]">Estado emocional del personaje</div>
            {Object.entries(EMOTION_LABELS_ES).map(([k, label]) => (
              <EmotionBar key={k} label={label} value={emotion[k] ?? 0} />
            ))}
          </div>
        )}

        <div className="mt-5">
          <div className="label-eyebrow mb-2">Resumen de la historia</div>
          <textarea
            data-testid="memory-summary-textarea"
            className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] focus:outline-none focus:border-[#C6A45C]/60 min-h-[100px] resize-y"
            value={summary || ""}
            onChange={(e) => onChangeSummary(e.target.value)}
            placeholder="Se genera automáticamente a medida que la conversación avanza. Editable."
          />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="label-eyebrow">Recuerdos persistentes</div>
            <span className="text-[10px] text-[#71717A]">★ fijado · alta prioridad</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              data-testid="memory-add-input"
              className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-full px-3.5 py-2 text-sm focus:outline-none focus:border-[#C6A45C]/60"
              placeholder="Añade un recuerdo…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button
              data-testid="memory-add-button"
              onClick={add}
              className="w-9 h-9 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] transition-all"
              aria-label="Añadir recuerdo"
            >
              <Plus size={15} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {(memories || []).length === 0 && (
              <li className="text-xs text-[#71717A] italic">Aún no hay recuerdos. Se extraerán automáticamente mientras conversas.</li>
            )}
            {(memories || []).map((m, i) => {
              const item = typeof m === "string" ? { text: m, pinned: false } : m;
              return (
                <li
                  key={item.id || i}
                  data-testid={`memory-item-${i}`}
                  className={`group flex items-start gap-2 text-sm rounded-lg px-3 py-2 border transition-colors ${
                    item.pinned ? "bg-[#1a1308] border-[#C6A45C]/30 text-[#EDEDED]" : "bg-[#111111] border-white/[0.06] text-[#EDEDED]"
                  }`}
                >
                  <button
                    data-testid={`memory-pin-${i}`}
                    onClick={() => togglePin(i)}
                    className={`mt-0.5 transition-colors ${item.pinned ? "text-[#C6A45C]" : "text-[#71717A] hover:text-[#C6A45C]"}`}
                    aria-label={item.pinned ? "Desfijar" : "Fijar"}
                    title={item.pinned ? "Desfijar" : "Fijar este recuerdo"}
                  >
                    {item.pinned ? <Pin size={13} fill="currentColor" /> : <PinOff size={13} />}
                  </button>
                  <span className="flex-1 leading-relaxed">{item.text}</span>
                  <button
                    data-testid={`memory-remove-${i}`}
                    onClick={() => remove(i)}
                    className="opacity-60 hover:opacity-100 text-[#A1A1AA] hover:text-[#C83A3A] transition-all"
                    aria-label="Eliminar"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-7 pt-5 border-t border-white/[0.06]">
          <button
            data-testid="reset-chat-button"
            onClick={() => { if (window.confirm("¿Reiniciar esta conversación? Se borrarán los mensajes, recuerdos y el resumen.")) onResetChat(); }}
            className="text-xs text-[#C83A3A] hover:text-red-400 transition-colors"
          >
            Reiniciar esta conversación
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
