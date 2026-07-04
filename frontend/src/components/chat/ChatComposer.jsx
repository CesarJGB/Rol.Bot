import React from "react";
import { Send } from "lucide-react";

export function ChatComposer({ input, setInput, onSend, busy, characterName }) {
  return (
    <div className="sticky bottom-0 safe-bottom backdrop-blur-xl bg-[#050505]/90 border-t border-white/[0.06]">
      <div className="max-w-3xl mx-auto px-3 py-3 flex items-end gap-2">
        <textarea
          data-testid="message-composer"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={`Hablar con ${characterName}…`}
          rows={1}
          className="flex-1 resize-none bg-[#111111] border border-white/[0.08] rounded-2xl px-4 py-3 text-[15px] text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/50 max-h-32 overflow-y-auto scroll-thin"
          style={{ minHeight: 44 }}
        />
        <button
          data-testid="send-button"
          onClick={onSend}
          disabled={busy || !input.trim()}
          className="shrink-0 w-11 h-11 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] disabled:bg-[#1C1C1C] disabled:text-[#71717A] text-[#111111] transition-all"
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
