// Backend API client. All HTTP calls to FastAPI live here.
// The API base URL is centralized in /src/config.js — change it there, not here.
import axios from "axios";
import { API } from "../config";

const client = axios.create({ baseURL: API, timeout: 120000 });

// ---- Non-streaming endpoints ----

export const chatComplete = async (payload) => {
  const { data } = await client.post("/chat", payload);
  return data.content;
};

export const chatRegenerate = async (payload) => {
  const { data } = await client.post("/chat/regenerate", payload);
  return data.content;
};

export const chatContinue = async (payload) => {
  const { data } = await client.post("/chat/continue", payload);
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

export const updateEmotion = async ({ messages, character_name, current_state }) => {
  const { data } = await client.post("/chat/emotion", { messages, character_name, current_state });
  return data.state;
};

export const checkHealth = async () => {
  const { data } = await client.get("/health");
  return data;
};

// ---- Streaming endpoint ----
// Yields text deltas as they arrive from DeepSeek. The caller accumulates them
// to render a typewriter effect. Supports cancellation via AbortController.
//
// Usage:
//   const controller = new AbortController();
//   for await (const delta of chatStream(payload, { signal: controller.signal })) {
//     appendToMessage(delta);
//   }
export async function* chatStream(payload, { signal } = {}) {
  const resp = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`stream failed: ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE events are separated by \n\n; each event has one or more `data: ...` lines.
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const raw of event.split("\n")) {
          if (!raw.startsWith("data:")) continue;
          const data = raw.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.delta) yield parsed.delta;
          } catch (e) {
            // ignore malformed chunk
          }
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* noop */ }
  }
}
