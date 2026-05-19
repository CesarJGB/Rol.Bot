// ============================================================================
// CONFIGURACIÓN CENTRAL DEL FRONTEND
// ============================================================================
// CAMBIA AQUÍ LA URL DE TU BACKEND (esto es lo único que necesitas tocar para
// apuntar la app a un servidor distinto):
//
//   - Desarrollo local:  http://localhost:8001
//   - Producción:        https://mi-backend.onrender.com (o railway, fly, etc.)
//
// El orden de prioridad es:
//   1) Variable de entorno REACT_APP_API_BASE_URL (recomendada para CI/CD)
//   2) El valor por defecto definido más abajo en `FALLBACK_API_BASE_URL`
//
// Para GitHub Pages: ejecuta `REACT_APP_API_BASE_URL="https://..." yarn build`
// o edita el valor por defecto y haz commit antes de hacer deploy.
// ============================================================================

// ⬇️ ÚNICA URL QUE NECESITAS CAMBIAR PARA APUNTAR A OTRO BACKEND ⬇️
const FALLBACK_API_BASE_URL = "http://localhost:8001";

// Compatibilidad con el .env previo (REACT_APP_BACKEND_URL). Si está definido,
// gana — no tienes que cambiar nada en la plataforma de Emergent ni en local.
const ENV_BACKEND_URL =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_BACKEND_URL;

export const API_BASE_URL = (ENV_BACKEND_URL || FALLBACK_API_BASE_URL).replace(/\/+$/, "");

// Prefijo de la API. Todos los endpoints del backend FastAPI viven bajo /api.
export const API_PREFIX = "/api";

// URL completa lista para concatenar rutas:  `${API}/chat`
export const API = `${API_BASE_URL}${API_PREFIX}`;

// Indica si la app está corriendo bajo HTTPS — útil para warnings y mixed-content checks.
export const IS_HTTPS = typeof window !== "undefined" && window.location.protocol === "https:";

// `basename` del router. Útil cuando la app está servida bajo un subpath
// (p. ej. https://usuario.github.io/mi-repo/). Se toma de PUBLIC_URL en build.
export const ROUTER_BASENAME = (process.env.PUBLIC_URL || "").replace(/\/+$/, "") || "/";

// Modelo expuesto al frontend sólo para mostrarse en UI / depuración.
export const DEEPSEEK_MODEL = "deepseek-v4-flash";

// Útil para debug:
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  // eslint-disable-next-line no-console
  console.info("[config] API base URL:", API_BASE_URL);
}
