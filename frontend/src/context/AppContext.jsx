import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ensureSeed,
  loadChats, saveChats,
  loadProfile, saveProfile,
  loadSettings, saveSettings,
  saveCharacters,
  newSessionId,
  buildSession,
} from "../lib/storage";
import { DEFAULT_EMOTION } from "../lib/constants";
import { toast } from "sonner";

const AppContext = createContext(null);

const newId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const blankCharacter = (overrides = {}) => ({
  id: newId(),
  name: "",
  avatar: "",
  tagline: "",
  personality: "",
  lore: "",
  speakingStyle: "",
  emotionalTendencies: "",
  exampleDialogues: "",
  tags: [],
  initialMessage: "",
  sceneDefault: { location: "", atmosphere: "", characterEmotion: "" },
  ...overrides,
});

const emptyChatBundle = () => ({ sessions: {}, activeSessionId: null });

// Wrapper que captura el error de storage lleno y avisa al usuario
// en lugar de dejar la app en pantalla negra.
const trySave = (saveFn, args) => {
  try {
    saveFn(args);
  } catch (e) {
    if (e.isStorageFull) {
      toast.error(
        "⚠️ Almacenamiento lleno. Exporta tu progreso desde ajustes y elimina conversaciones antiguas para liberar espacio.",
        { duration: 8000 }
      );
    } else {
      throw e;
    }
  }
};

export const AppProvider = ({ children }) => {
  const [characters, setCharacters] = useState(() => ensureSeed() || []);
  const [chats, setChats] = useState(() => loadChats(ensureSeed() || []));
  const [profile, setProfile] = useState(() => loadProfile());
  const [settings, setSettings] = useState(() => loadSettings());

  const chatsSaveTimer = useRef(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const flushChats = useCallback(() => {
    if (chatsSaveTimer.current) {
      clearTimeout(chatsSaveTimer.current);
      chatsSaveTimer.current = null;
      trySave(saveChats, chatsRef.current);
    }
  }, []);

  useEffect(() => { trySave(saveCharacters, characters); }, [characters]);
  useEffect(() => {
    if (chatsSaveTimer.current) clearTimeout(chatsSaveTimer.current);
    chatsSaveTimer.current = setTimeout(() => { chatsSaveTimer.current = null; trySave(saveChats, chats); }, 800);
    return () => { if (chatsSaveTimer.current) clearTimeout(chatsSaveTimer.current); };
  }, [chats]);
  useEffect(() => {
    const handleBeforeUnload = () => flushChats();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushChats]);
  useEffect(() => { trySave(saveProfile, profile); }, [profile]);
  useEffect(() => { trySave(saveSettings, settings); }, [settings]);

  // ---- characters ----
  const upsertCharacter = useCallback((c) => {
    setCharacters(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = c;
        return copy;
      }
      return [c, ...prev];
    });
  }, []);

  const deleteCharacter = useCallback((id) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    setChats(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, []);

  const getCharacter = useCallback((id) => characters.find(c => c.id === id), [characters]);

  // ---- chat bundle helpers ----
  const getBundle = useCallback((characterId) => chats[characterId] || emptyChatBundle(), [chats]);

  const getActiveSession = useCallback((characterId) => {
    const bundle = chats[characterId];
    if (!bundle?.activeSessionId) return null;
    return bundle.sessions[bundle.activeSessionId] || null;
  }, [chats]);

  const ensureSession = useCallback((characterId) => {
    setChats(prev => {
      const bundle = prev[characterId] || emptyChatBundle();
      if (bundle.activeSessionId && bundle.sessions[bundle.activeSessionId]) return prev;
      const sessionIds = Object.keys(bundle.sessions);
      if (sessionIds.length > 0) {
        const newest = sessionIds.sort((a, b) => (bundle.sessions[b].updatedAt || 0) - (bundle.sessions[a].updatedAt || 0))[0];
        return { ...prev, [characterId]: { ...bundle, activeSessionId: newest } };
      }
      const character = characters.find(c => c.id === characterId);
      const session = buildSession({ name: "Conversación principal" }, character);
      return {
        ...prev,
        [characterId]: { sessions: { [session.id]: session }, activeSessionId: session.id },
      };
    });
  }, [characters]);

  const createSession = useCallback((characterId, name) => {
    const character = characters.find(c => c.id === characterId);
    const session = buildSession({ name: name || `Conversación ${Object.keys(getBundle(characterId).sessions).length + 1}` }, character);
    setChats(prev => {
      const bundle = prev[characterId] || emptyChatBundle();
      return {
        ...prev,
        [characterId]: {
          sessions: { ...bundle.sessions, [session.id]: session },
          activeSessionId: session.id,
        },
      };
    });
    return session.id;
  }, [characters, getBundle]);

  const switchSession = useCallback((characterId, sessionId) => {
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.sessions?.[sessionId]) return prev;
      return { ...prev, [characterId]: { ...bundle, activeSessionId: sessionId } };
    });
  }, []);

  const renameSession = useCallback((characterId, sessionId, name) => {
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.sessions?.[sessionId]) return prev;
      return {
        ...prev,
        [characterId]: {
          ...bundle,
          sessions: { ...bundle.sessions, [sessionId]: { ...bundle.sessions[sessionId], name, updatedAt: Date.now() } },
        },
      };
    });
  }, []);

  const deleteSession = useCallback((characterId, sessionId) => {
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.sessions?.[sessionId]) return prev;
      const { [sessionId]: _, ...rest } = bundle.sessions;
      const remainingIds = Object.keys(rest);
      let activeSessionId = bundle.activeSessionId;
      if (sessionId === activeSessionId) {
        activeSessionId = remainingIds[0] || null;
      }
      if (!activeSessionId) {
        const character = characters.find(c => c.id === characterId);
        const fresh = buildSession({ name: "Conversación principal" }, character);
        return {
          ...prev,
          [characterId]: { sessions: { [fresh.id]: fresh }, activeSessionId: fresh.id },
        };
      }
      return { ...prev, [characterId]: { sessions: rest, activeSessionId } };
    });
  }, [characters]);

  const updateActiveSession = useCallback((characterId, updater) => {
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.activeSessionId) return prev;
      const current = bundle.sessions[bundle.activeSessionId];
      const next = typeof updater === "function" ? updater(current) : updater;
      return {
        ...prev,
        [characterId]: {
          ...bundle,
          sessions: { ...bundle.sessions, [bundle.activeSessionId]: { ...next, updatedAt: Date.now() } },
        },
      };
    });
  }, []);

  const resetActiveSession = useCallback((characterId) => {
    const character = characters.find(c => c.id === characterId);
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.activeSessionId) return prev;
      const current = bundle.sessions[bundle.activeSessionId];
      const fresh = buildSession({
        id: current.id,
        name: current.name,
        emotion: { ...DEFAULT_EMOTION },
      }, character);
      return {
        ...prev,
        [characterId]: {
          ...bundle,
          sessions: { ...bundle.sessions, [bundle.activeSessionId]: fresh },
        },
      };
    });
  }, [characters]);

  const value = useMemo(() => ({
    characters, setCharacters,
    chats, setChats,
    profile, setProfile,
    settings, setSettings,
    upsertCharacter, deleteCharacter, getCharacter,
    getBundle, getActiveSession,
    ensureSession, createSession, switchSession, renameSession, deleteSession,
    updateActiveSession, resetActiveSession,
    flushChats,
  }), [characters, chats, profile, settings, upsertCharacter, deleteCharacter, getCharacter, getBundle, getActiveSession, ensureSession, createSession, switchSession, renameSession, deleteSession, updateActiveSession, resetActiveSession, flushChats]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
};
