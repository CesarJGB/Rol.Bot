// Backend API client. All HTTP calls to FastAPI live here.
// The API base URL is centralized in /src/config.js — change it there, not here.
import axios from "axios";
import { API } from "../config";

const client = axios.create({ baseURL: API, timeout: 120000 });

// ---- Retry automático para llamadas no-streaming ----
// Hasta 2 reintentos extra en error de red (sin respuesta) o 5xx.
// El delay crece con cada intento: 1.5s, 3s.
const withRetry = async (fn, retries = 2, delayMs = 1500) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isNetwork = !err.response;        // sin respuesta = caída de red
      const isRetryable = err.response?.status >= 500;
      if ((isNetwork || isRetryable) && i < retries) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
};

// ---- Non-streaming endpoints ----

export const chatComplete = async (payload) => {
  const { data } = await withRetry(() => client.post("/chat", payload));
  return data.content;
};

export const chatRegenerate = async (payload) => {
  const { data } = await withRetry(() => client.post("/chat/regenerate", payload));
  return data.content;
};

export const chatContinue = async (payload) => {
  const { data } = await withRetry(() => client.post("/chat/continue", payload));
  return data.content;
};

export const summarizeChat = async ({ messages, character_name, previous_summary }) => {
  const { data } = await withRetry(() =>
    client.post("/chat/summarize", { messages, character_name, previous_summary })
  );
  return data.summary;
};

export const extractMemories = async ({ messages, character_name, existing_memories }) => {
  const { data } = await withRetry(() =>
    client.post("/chat/extract-memories", { messages, character_name, existing_memories })
  );
  return data.memories || [];
};

export const updateEmotion = async ({ messages, character_name, current_state }) => {
  const { data } = await withRetry(() =>
    client.post("/chat/emotion", { messages, character_name, current_state })
  );
  return data.state;
};

export const checkHealth = async () => {
  const { data } = await client.get("/health");
  return data;
};

// ---- Helpers para mensajes de error legibles ----
// Usa esto en Chat.jsx en lugar del mensaje genérico de "verifica tu key".
//   import { friendlyError } from "../lib/api";
//   toast.error(friendlyError(err));
export const friendlyError = (err) => {
  if (err?.response?.status === 401) return "Clave de DeepSeek inválida. Revísala en configuración.";
  if (err?.response?.status === 429) return "Demasiadas peticiones. Espera un momento e inténtalo de nuevo.";
  if (err?.response?.status >= 500) return "El servidor tuvo un problema. Reintentando…";
  if (!err?.response) return "Error de conexión. Comprueba tu red e inténtalo de nuevo.";
  return "Algo salió mal. Inténtalo de nuevo.";
};

// ---- Streaming endpoint ----
// Yields text deltas as they arrive from DeepSeek. The caller accumulates them
// to render a typewriter effect. Supports cancellation via AbortController.
// Reintenta automáticamente hasta 2 veces si la conexión se cae (excepto
// cancelaciones explícitas del usuario con AbortController).
//
// Usage:
//   const controller = new AbortController();
//   for await (const delta of chatStream(payload, { signal: controller.signal })) {
//     appendToMessage(delta);
//   }
export async function* chatStream(payload, { signal } = {}) {
  let attempts = 0;

  while (attempts < 2) {
    try {
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
                // Re-lanzar errores reales del servidor; ignorar chunks malformados.
                if (e.message && !e.message.includes("JSON")) throw e;
              }
            }
          }
        }
        return; // stream terminó limpiamente
      } finally {
        try { reader.cancel(); } catch { /* noop */ }
      }

    } catch (err) {
      // Cancelación explícita del usuario — no reintentar nunca.
      if (err.name === "AbortError") throw err;

      attempts++;
      if (attempts >= 2) throw err;

      // Esperar antes de reintentar.
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
