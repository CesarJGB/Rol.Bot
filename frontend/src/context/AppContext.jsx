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

// ============================================================================
// 🚀 MIGRACIÓN DE DATOS ADAPTADA A TU STRUCT DE BUNDLES Y SESSIONS
// ============================================================================
const APP_VERSION = "2.0.0"; // Incrementa esto cuando cambies propiedades lógicas

const migrateLocalStorage = () => {
  if (typeof window === "undefined") return;

  try {
    const currentVersion = localStorage.getItem("app_version");

    if (currentVersion !== APP_VERSION) {
      console.log(`[Migrador] Versión antigua detectada (${currentVersion || "Ninguna"}). Reestructurando...`);

      // 1. Migración de Personajes (Inyección de nuevas llaves visuales/prompts)
      const rawCharacters = localStorage.getItem("characters");
      if (rawCharacters) {
        const characters = JSON.parse(rawCharacters);
        if (Array.isArray(characters)) {
          const migratedCharacters = characters.map(char => ({
            ...char,
            secondaryCharacters: char.secondaryCharacters || "",
            appearance: char.appearance || "",
            speakingStyle: char.speakingStyle || "",
          }));
          localStorage.setItem("characters", JSON.stringify(migratedCharacters));
        }
      }

      // 2. Migración del Diccionario de Chats (Estructura: chats -> characterId -> sessions -> sessionId)
      const rawChats = localStorage.getItem("chats"); 
      if (rawChats) {
        const chats = JSON.parse(rawChats);
        
        // Iteramos sobre cada personaje dentro del mapa global de chats
        for (const characterId in chats) {
          if (!Object.prototype.hasOwnProperty.call(chats, characterId)) continue;
          
          const bundle = chats[characterId];
          if (bundle && bundle.sessions) {
            // Iteramos sobre cada sesión de conversación de ese personaje específico
            for (const sessionId in bundle.sessions) {
              if (!Object.prototype.hasOwnProperty.call(bundle.sessions, sessionId)) continue;
              
              const session = bundle.sessions[sessionId];
              if (session) {
                // Aseguramos formato correcto de recuerdos
                if (!Array.isArray(session.memories)) {
                  session.memories = [];
                }
                
                // Normalizamos el historial de mensajes de la sesión para soportar Swipes / Variantes
                if (Array.isArray(session.messages)) {
                  session.messages = session.messages.map(msg => {
                    if (msg.role === "assistant") {
                      return {
                        ...msg,
                        variants: Array.isArray(msg.variants) ? msg.variants : [msg.content],
                        variantIndex: typeof msg.variantIndex === "number" ? msg.variantIndex : 0,
                      };
                    }
                    return msg;
                  });
                }
              }
            }
          }
        }
        localStorage.setItem("chats", JSON.stringify(chats));
      }

      // Marcar versión como completada
      localStorage.setItem("app_version", APP_VERSION);
      console.log("[Migrador] ¡Estructura de base de datos local actualizada con éxito!");
    }
  } catch (error) {
    console.error("[Migrador] Fallo en la reestructuración automática de datos locales:", error);
  }
};

// Se ejecuta de forma síncrona en el hilo principal antes de inicializar los useState de abajo
migrateLocalStorage();
// ============================================================================

const AppContext = createContext(null);

const newId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const blankCharacter = (overrides = {}) => ({
  id: newId(),
  name: "",
  avatar: "",
  tagline: "",
  personality: "",
  appearance: "",
  lore: "",
  secondaryCharacters: "",
  speakingStyle: "",
  emotionalTendencies: "",
  exampleDialogues: "",
  tags: [],
  initialMessage: "",
  sceneDefault: { location: "", atmosphere: "", characterEmotion: "" },
  ...overrides,
});

const emptyChatBundle = () => ({ sessions: {}, activeSessionId: null });

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
  // Nota: Al ejecutarse el migrador arriba, estas funciones de lectura ya leerán el JSON reparado.
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

  const updateSession = useCallback((characterId, sessionId, updater) => {
    setChats(prev => {
      const bundle = prev[characterId];
      if (!bundle?.sessions?.[sessionId]) return prev;
      const current = bundle.sessions[sessionId];
      const next = typeof updater === "function" ? updater(current) : updater;
      return {
        ...prev,
        [characterId]: {
          ...bundle,
          sessions: { ...bundle.sessions, [sessionId]: { ...next, updatedAt: Date.now() } },
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
    updateActiveSession, updateSession, resetActiveSession,
    flushChats,
  }), [characters, chats, profile, settings, upsertCharacter, deleteCharacter, getCharacter, getBundle, getActiveSession, ensureSession, createSession, switchSession, renameSession, deleteSession, updateActiveSession, updateSession, resetActiveSession, flushChats]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
};
