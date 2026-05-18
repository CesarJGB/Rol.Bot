import axios from "axios";
import { API } from "./constants";

const client = axios.create({ baseURL: API, timeout: 95000 });

export const chatComplete = async (payload) => {
  const { data } = await client.post("/chat", payload);
  return data.content;
};

export const chatVariants = async (payload) => {
  const { data } = await client.post("/chat/variants", payload);
  return data.variants;
};

export const chatRegenerate = async (payload) => {
  const { data } = await client.post("/chat/regenerate", payload);
  return data.content;
};

export const summarizeChat = async ({ messages, character_name, previous_summary }) => {
  const { data } = await client.post("/chat/summarize", { messages, character_name, previous_summary });
  return data.summary;
};

export const extractMemories = async ({ messages, character_name, existing_memories }) => {
  const { data } = await client.post("/chat/extract-memories", { messages, character_name, existing_memories });
  return data.memories || [];
};

export const checkHealth = async () => {
  const { data } = await client.get("/health");
  return data;
};
