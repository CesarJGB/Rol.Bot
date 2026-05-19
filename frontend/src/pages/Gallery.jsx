import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Settings, User, Upload, Download } from "lucide-react";
import { useApp } from "../context/AppContext";
import { CharacterCard } from "../components/CharacterCard";
import { exportAll, importAll } from "../lib/storage";
import { toast } from "sonner";

export default function Gallery() {
  const { characters, chats } = useApp();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return characters;
    const q = query.toLowerCase();
    return characters.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.tagline?.toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [characters, query]);

  // Pick last snippet from the active session of each character.
  const lastSnippetFor = (charId) => {
    const bundle = chats[charId];
    const session = bundle?.sessions?.[bundle?.activeSessionId];
    const lastMsg = session?.messages?.slice(-1)[0];
    return lastMsg?.content?.replace(/\*[^*]+\*/g, "").trim().slice(0, 80);
  };

  const handleExport = () => {
    const data = exportAll();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roleplay-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Descarga lista");
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importAll(reader.result);
        toast.success("Importado. Recargando…");
        setTimeout(() => window.location.reload(), 800);
      } catch {
        toast.error("Archivo JSON inválido");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen app-bg grain pb-24">
      <div className="relative z-10 px-5 pt-10 pb-6 max-w-5xl mx-auto safe-top">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="label-eyebrow text-[#C6A45C] mb-2">un santuario de roleplay</div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-[#EDEDED] leading-[0.95] tracking-tight">
              Entra en la<br />
              <span className="italic text-[#C6A45C]">historia</span>.
            </h1>
            <p className="text-[#A1A1AA] mt-3 max-w-md text-sm sm:text-base">
              Elige un personaje, o escribe el tuyo. Te recordarán.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/profile"
              data-testid="nav-profile"
              className="w-10 h-10 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Perfil"
            >
              <User size={16} />
            </Link>
            <Link
              to="/settings"
              data-testid="nav-settings"
              className="w-10 h-10 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Ajustes"
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              data-testid="character-search-input"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar personajes, etiquetas…"
              className="w-full bg-[#111111] border border-white/[0.08] rounded-full pl-10 pr-4 py-2.5 text-sm text-[#EDEDED] placeholder:text-[#71717A] focus:outline-none focus:border-[#C6A45C]/50 transition-all"
            />
          </div>
          <Link
            to="/character/new"
            data-testid="create-character-button"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] px-5 py-2.5 text-sm font-medium transition-all"
          >
            <Plus size={16} /> Nuevo personaje
          </Link>
        </div>
      </div>

      <div className="relative z-10 px-5 max-w-5xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#71717A]">
            <p className="font-display text-2xl text-[#A1A1AA] mb-1">Aquí no hay nadie aún.</p>
            <p className="text-sm">Crea tu primer personaje para empezar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map(c => (
              <CharacterCard key={c.id} character={c} lastSnippet={lastSnippetFor(c.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 px-5 mt-10 max-w-5xl mx-auto flex items-center justify-center gap-3 text-xs text-[#71717A]">
        <button
          data-testid="export-all-button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 hover:text-[#C6A45C] transition-colors"
        >
          <Download size={12} /> Exportar todo
        </button>
        <span className="opacity-30">·</span>
        <label className="inline-flex items-center gap-1.5 hover:text-[#C6A45C] transition-colors cursor-pointer">
          <Upload size={12} /> Importar
          <input
            data-testid="import-all-input"
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
