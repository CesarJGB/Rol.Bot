import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ensureSeed,
  loadChats, saveChats,
  loadProfile, saveProfile,
  loadSettings, saveSettings,
  saveCharacters,
} from "../lib/storage";

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

const blankChat = (character) => ({
  messages: [],
  summary: "",
  memories: [],
  scene: { ...(character?.sceneDefault || {}), current: "" },
  updatedAt: Date.now(),
});

export const AppProvider = ({ children }) => {
  const [characters, setCharacters] = useState(() => ensureSeed() || []);
  const [chats, setChats] = useState(() => loadChats());
  const [profile, setProfile] = useState(() => loadProfile());
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => { saveCharacters(characters); }, [characters]);
  useEffect(() => { saveChats(chats); }, [chats]);
  useEffect(() => { saveProfile(profile); }, [profile]);
  useEffect(() => { saveSettings(settings); }, [settings]);

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

  const getChat = useCallback((characterId) => chats[characterId], [chats]);

  const ensureChat = useCallback((characterId) => {
    setChats(prev => {
      if (prev[characterId]) return prev;
      const character = characters.find(c => c.id === characterId);
      return { ...prev, [characterId]: blankChat(character) };
    });
  }, [characters]);

  const updateChat = useCallback((characterId, updater) => {
    setChats(prev => {
      const current = prev[characterId] || blankChat(characters.find(c => c.id === characterId));
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [characterId]: { ...next, updatedAt: Date.now() } };
    });
  }, [characters]);

  const resetChat = useCallback((characterId) => {
    const character = characters.find(c => c.id === characterId);
    setChats(prev => ({ ...prev, [characterId]: blankChat(character) }));
  }, [characters]);

  const value = useMemo(() => ({
    characters, setCharacters,
    chats, setChats,
    profile, setProfile,
    settings, setSettings,
    upsertCharacter, deleteCharacter, getCharacter,
    getChat, ensureChat, updateChat, resetChat,
  }), [characters, chats, profile, settings, upsertCharacter, deleteCharacter, getCharacter, getChat, ensureChat, updateChat, resetChat]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
};
