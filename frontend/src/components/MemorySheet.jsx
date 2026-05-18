import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Plus, X } from "lucide-react";

export const MemorySheet = ({ open, onOpenChange, memories, summary, onChangeMemories, onChangeSummary, onResetChat }) => {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChangeMemories([...(memories || []), v]);
    setDraft("");
  };
  const remove = (i) => onChangeMemories(memories.filter((_, idx) => idx !== i));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#0a0a0a] border-t border-white/[0.08] text-[#EDEDED] max-h-[85vh] overflow-y-auto scroll-thin">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">Memory</SheetTitle>
          <SheetDescription className="text-[#A1A1AA] text-sm">
            What this character remembers about you and the story so far.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5">
          <div className="label-eyebrow mb-2">Story summary</div>
          <textarea
            data-testid="memory-summary-textarea"
            className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-[#EDEDED] focus:outline-none focus:border-[#C6A45C]/60 min-h-[100px] resize-y"
            value={summary || ""}
            onChange={(e) => onChangeSummary(e.target.value)}
            placeholder="Auto-generated as the conversation grows. Editable."
          />
        </div>

        <div className="mt-6">
          <div className="label-eyebrow mb-2">Persistent memories</div>
          <div className="flex gap-2 mb-3">
            <input
              data-testid="memory-add-input"
              className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-full px-3.5 py-2 text-sm focus:outline-none focus:border-[#C6A45C]/60"
              placeholder="Add a memory…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button
              data-testid="memory-add-button"
              onClick={add}
              className="w-9 h-9 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] transition-all"
              aria-label="Add memory"
            >
              <Plus size={15} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {(memories || []).length === 0 && (
              <li className="text-xs text-[#71717A] italic">No memories yet. They'll be extracted automatically as you chat.</li>
            )}
            {(memories || []).map((m, i) => (
              <li
                key={i}
                data-testid={`memory-item-${i}`}
                className="group flex items-start gap-2 text-sm text-[#EDEDED] bg-[#111111] border border-white/[0.06] rounded-lg px-3 py-2"
              >
                <span className="flex-1 leading-relaxed">{m}</span>
                <button
                  data-testid={`memory-remove-${i}`}
                  onClick={() => remove(i)}
                  className="opacity-50 hover:opacity-100 text-[#A1A1AA] hover:text-[#C83A3A] transition-all"
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 pt-5 border-t border-white/[0.06]">
          <button
            data-testid="reset-chat-button"
            onClick={() => { if (window.confirm("Reset this conversation? Memories and summary will be cleared.")) onResetChat(); }}
            className="text-xs text-[#C83A3A] hover:text-red-400 transition-colors"
          >
            Reset conversation
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
