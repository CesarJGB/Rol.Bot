import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Plus, Check, Trash2, Pencil } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";

const formatDate = (ts) => {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

export const ChatsSheet = ({ open, onOpenChange, busy = false, sessions, activeSessionId, onSwitch, onCreate, onRename, onDelete }) => {
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const list = Object.values(sessions || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const startRename = (s) => { setRenamingId(s.id); setRenameDraft(s.name); };
  const confirmDelete = () => {
    if (busy || !deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
    onOpenChange(false);
  };

  const confirmRename = () => {
    if (busy) return;
    if (renameDraft.trim()) onRename(renamingId, renameDraft.trim());
    setRenamingId(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#0a0a0a] border-t border-white/[0.08] text-[#EDEDED] max-h-[85vh] overflow-y-auto scroll-thin">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">Conversaciones</SheetTitle>
          <SheetDescription className="text-[#A1A1AA] text-sm">
            Cada conversación con este personaje guarda su propia memoria, resumen y estado.
          </SheetDescription>
        </SheetHeader>

        <button
          data-testid="new-session-button"
          onClick={() => onCreate()}
          disabled={busy}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-[#C6A45C] hover:bg-[#DBC184] disabled:opacity-50 disabled:cursor-not-allowed text-[#111111] rounded-full px-4 py-2.5 text-sm font-medium transition-all"
        >
          <Plus size={15} /> Nuevo chat
        </button>

        <ul className="mt-5 space-y-2">
          {list.map((s) => {
            const isActive = s.id === activeSessionId;
            const msgCount = s.messages?.length || 0;
            const last = s.messages?.[s.messages.length - 1]?.content?.replace(/\*[^*]+\*/g, "").trim().slice(0, 70);
            return (
              <li
                key={s.id}
                data-testid={`session-row-${s.id}`}
                className={`rounded-xl border transition-all ${isActive ? "border-[#C6A45C]/40 bg-[#1a1308]" : "border-white/[0.06] bg-[#111111]"}`}
              >
                {renamingId === s.id ? (
                  <div className="p-3 flex items-center gap-2">
                    <input
                      autoFocus
                      value={renameDraft}
                      disabled={busy}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                      className="flex-1 bg-[#0a0a0a] border border-[#C6A45C]/40 rounded-lg px-3 py-1.5 text-sm focus:outline-none disabled:opacity-50"
                      data-testid={`rename-input-${s.id}`}
                    />
                    <button
                      onClick={confirmRename}
                      disabled={busy}
                      className="w-8 h-8 grid place-items-center rounded-full bg-[#C6A45C] text-[#111111] disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid={`rename-confirm-${s.id}`}
                      aria-label="Confirmar"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-stretch">
                    <button
                      data-testid={`switch-session-${s.id}`}
                      disabled={busy}
                      onClick={() => { onSwitch(s.id); onOpenChange(false); }}
                      className="flex-1 text-left px-4 py-3 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`font-display text-lg truncate ${isActive ? "text-[#C6A45C]" : "text-[#EDEDED]"}`}>{s.name}</span>
                        <span className="text-[10px] text-[#71717A] shrink-0">{formatDate(s.updatedAt)}</span>
                      </div>
                      <div className="text-xs text-[#71717A] mt-0.5">
                        {msgCount} {msgCount === 1 ? "mensaje" : "mensajes"}
                        {last && <> · <span className="italic">"{last}"</span></>}
                      </div>
                    </button>
                    <div className="flex flex-col border-l border-white/[0.06]">
                      <button
                        data-testid={`rename-session-${s.id}`}
                        disabled={busy}
                        onClick={() => startRename(s)}
                        className="px-3 py-2 text-[#A1A1AA] hover:text-[#EDEDED] hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Renombrar"
                        title="Renombrar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        data-testid={`delete-session-${s.id}`}
                        disabled={busy}
                        onClick={() => setDeleteTarget(s)}
                        className="px-3 py-2 text-[#A1A1AA] hover:text-[#C83A3A] hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="bg-[#111111] border border-white/[0.08] text-[#EDEDED] max-w-[calc(100%-2rem)] rounded-2xl">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#A1A1AA]">
              Se eliminará «{deleteTarget?.name || "esta conversación"}» y su historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 border-white/[0.12] text-[#EDEDED] hover:bg-white/5">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className="bg-[#C83A3A] text-white hover:bg-[#A82E2E] focus:ring-[#C83A3A]"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
