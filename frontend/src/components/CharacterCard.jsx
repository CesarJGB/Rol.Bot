import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Pencil } from "lucide-react";

export const CharacterCard = ({ character, lastSnippet }) => {
  const tags = (character.tags || []).slice(0, 3);
  return (
    <article
      data-testid={`character-card-${character.id}`}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111111] hover:border-[#C6A45C]/40 transition-all duration-300"
    >
      <Link to={`/chat/${character.id}`} className="block">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {character.avatar ? (
            <img src={character.avatar} alt={character.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
          ) : (
            <div className="w-full h-full grid place-items-center bg-gradient-to-br from-[#1C1C1C] to-[#0a0a0a]">
              <span className="font-display text-5xl text-[#C6A45C]/40">{(character.name || "?").slice(0, 1)}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute left-0 right-0 bottom-0 p-4">
            <h3 className="font-display text-2xl leading-tight text-[#EDEDED]">{character.name}</h3>
            {character.tagline && <p className="text-[13px] text-[#A1A1AA] mt-1 line-clamp-2">{character.tagline}</p>}
          </div>
        </div>
      </Link>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {tags.map((t) => (
            <span key={t} className="text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA] border border-white/10 rounded-full px-2 py-0.5">{t}</span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to={`/character/${character.id}/edit`}
            data-testid={`edit-character-${character.id}`}
            className="w-8 h-8 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 text-[#A1A1AA] hover:text-[#EDEDED] transition-all"
            aria-label="Editar personaje"
          >
            <Pencil size={14} />
          </Link>
          <Link
            to={`/chat/${character.id}`}
            data-testid={`open-chat-${character.id}`}
            className="w-8 h-8 grid place-items-center rounded-full bg-[#C6A45C] hover:bg-[#DBC184] text-[#111111] transition-all"
            aria-label="Abrir chat"
          >
            <MessageCircle size={14} />
          </Link>
        </div>
      </div>
      {lastSnippet && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-[#71717A] italic line-clamp-1">"{lastSnippet}"</p>
        </div>
      )}
    </article>
  );
};
