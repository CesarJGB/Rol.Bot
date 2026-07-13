import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessagesSquare, Theater, Brain } from "lucide-react";

import { useApp } from "../context/AppContext";
import { useChatActions, newMessage, normalizeMemories } from "../hooks/useChatActions";

import { TopBar } from "../components/TopBar";
import { SceneSheet } from "../components/SceneSheet";
import { MemorySheet } from "../components/MemorySheet";
import { ChatsSheet } from "../components/ChatsSheet";

import { ChatMessagesList } from "../components/chat/ChatMessagesList";
import { ChatComposer } from "../components/chat/ChatComposer";
import { DEFAULT_EMOTION } from "../lib/constants";
import { toast } from "sonner";

export default function Chat() {
  const { id: characterId } = useParams();
  const navigate = useNavigate();
  
  const {
    getCharacter, getBundle, getActiveSession, ensureSession, createSession, 
    switchSession, renameSession, deleteSession, updateActiveSession, 
    updateSession, resetActiveSession, flushChats, profile, settings,
  } = useApp();

  const character = getCharacter(characterId);
  const bundle = getBundle(characterId);
  const session = getActiveSession(characterId);

  const [sceneOpen, setSceneOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);

  // Despachamos toda la lógica pesada al hook dedicado
  const chatActions = useChatActions({
    character, session, characterId, profile, settings,
    updateSession
  });

  useEffect(() => {
    return () => flushChats();
  }, [characterId, flushChats]);

  useEffect(() => {
    if (!character) return;
    ensureSession(characterId);
  }, [character, characterId, ensureSession]);

  useEffect(() => {
    if (!character || !session) return;
    if (session.messages.length === 0 && character.initialMessage?.trim()) {
      updateActiveSession(characterId, (s) => ({
        ...s,
        messages: [{ ...newMessage("assistant", character.initialMessage), isInitial: true }],
      }));
    }
  }, [character, session, characterId, updateActiveSession]);

  if (!character) {
    return (
      <div className="min-h-screen app-bg grid place-items-center">
        <div className="text-center">
          <div className="font-display text-2xl text-[#EDEDED] mb-2">Personaje no encontrado</div>
          <button onClick={() => navigate("/")} className="text-[#C6A45C] underline">Volver a la galería</button>
        </div>
      </div>
    );
  }

  const messages = session?.messages || [];
  const sessionCount = Object.keys(bundle.sessions || {}).length;

  return (
    <div className="min-h-screen app-bg flex flex-col">
      <TopBar
        title={character.name}
        subtitle={session?.name ? `${session.name}${sessionCount > 1 ? ` · ${sessionCount} chats` : ""}` : (session?.scene?.location || character.sceneDefault?.location || "en escena")}
        right={
          <div className="flex items-center gap-1.5">
            <button
              data-testid="open-chats-button"
              onClick={() => setChatsOpen(true)}
              className="relative w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Conversaciones"
              title="Conversaciones"
            >
              <MessagesSquare size={15} />
              {sessionCount > 1 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 grid place-items-center bg-[#C6A45C] text-[#111111] rounded-full text-[9px] font-medium tabular-nums">
                  {sessionCount}
                </span>
              )}
            </button>
            <button
              data-testid="open-scene-button"
              onClick={() => setSceneOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Escena"
              title="Escena"
            >
              <Theater size={15} />
            </button>
            <button
              data-testid="open-memory-button"
              onClick={() => setMemoryOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full border border-white/[0.06] hover:bg-white/5 transition-all"
              aria-label="Memoria"
              title="Memoria"
            >
              <Brain size={15} />
            </button>
          </div>
        }
      />

      <ChatMessagesList
        messages={messages}
        busy={chatActions.busy}
        streamingPlaceholder={chatActions.streamingPlaceholder}
        streamingMsgId={chatActions.streamingMsgId}
        character={character}
        sessionId={session?.id}
        handleEdit={chatActions.handleEdit}
        handleDelete={chatActions.handleDelete}
        handleRegenerate={chatActions.handleRegenerate}
        handleSwipe={chatActions.handleSwipe}
        handleRegenIntro={chatActions.handleRegenIntro}
        handleContinue={chatActions.handleContinue}
      />

      <ChatComposer
        input={chatActions.input}
        setInput={chatActions.setInput}
        onSend={chatActions.send}
        busy={chatActions.busy}
        characterName={character.name}
      />

      <SceneSheet
        open={sceneOpen}
        onOpenChange={setSceneOpen}
        scene={session?.scene || {}}
        onChange={(s) => updateActiveSession(characterId, (sess) => ({ ...sess, scene: s }))}
      />
      
      <MemorySheet
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        memories={normalizeMemories(session?.memories)}
        summary={session?.summary || ""}
        emotion={session?.emotion || DEFAULT_EMOTION}
        onChangeMemories={(m) => updateActiveSession(characterId, (s) => ({ ...s, memories: m }))}
        onChangeSummary={(sum) => updateActiveSession(characterId, (s) => ({ ...s, summary: sum }))}
        onResetChat={() => { resetActiveSession(characterId); setMemoryOpen(false); toast.success("Conversación reiniciada"); }}
      />
      
      <ChatsSheet
        open={chatsOpen}
        onOpenChange={setChatsOpen}
        busy={chatActions.busy}
        sessions={bundle.sessions || {}}
        activeSessionId={bundle.activeSessionId}
        onSwitch={(sid) => switchSession(characterId, sid)}
        onCreate={() => { createSession(characterId); setChatsOpen(false); toast.success("Nueva conversación creada"); }}
        onRename={(sid, name) => renameSession(characterId, sid, name)}
        onDelete={(sid) => { deleteSession(characterId, sid); toast.success("Conversación eliminada"); }}
      />
    </div>
  );
}
