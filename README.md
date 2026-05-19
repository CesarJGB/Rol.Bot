# Roleplay Sanctum — AI Roleplay App

App de roleplay tipo Character.AI optimizada para **DeepSeek V4 Flash**.  
Frontend en **React** (estático, listo para GitHub Pages).  
Backend en **FastAPI** (listo para Render / Railway / Fly).  
Persistencia 100 % en `localStorage` del navegador.

---

## Cómo cambiar de backend (lo único que necesitas tocar)

Toda la configuración de URL del frontend vive en **un único archivo**:

```
frontend/src/config.js
```

Cambia la línea:

```js
const FALLBACK_API_BASE_URL = "http://localhost:8001";
```

…por la URL de tu backend en producción.  
O bien define la variable de entorno `REACT_APP_API_BASE_URL` antes de hacer build — esa gana siempre que esté presente.

---

## 1) Correr localmente

### Backend

```bash
cd backend
cp .env.example .env           # añade tu DEEPSEEK_API_KEY
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend escuchando en `http://localhost:8001`.  
Healthcheck: `curl http://localhost:8001/api/health`

### Frontend

```bash
cd frontend
cp .env.example .env           # ajusta REACT_APP_API_BASE_URL si quieres
yarn install
yarn start
```

Frontend en `http://localhost:3000`. Por defecto apunta a `http://localhost:8001`.

---

## 2) Desplegar en producción

### Backend → Render (o Railway / Fly / VPS)

Render (recomendado):

1. Crea un nuevo **Web Service** apuntando a tu repo.
2. Build command: `pip install -r backend/requirements.txt`
3. Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT --app-dir backend`
4. Variables de entorno:
   - `DEEPSEEK_API_KEY` = tu clave de https://platform.deepseek.com/api_keys
   - `DEEPSEEK_MODEL` = `deepseek-v4-flash`
   - `CORS_ORIGINS` = `https://TU-USUARIO.github.io` (o `*` si no te importa)
5. Despliega. Anota la URL pública (`https://mi-app.onrender.com`).

> CORS de `*.github.io` está permitido por regex en el código, no necesitas listarlo.

### Frontend → GitHub Pages

1. Edita `frontend/src/config.js` y cambia `FALLBACK_API_BASE_URL` a tu URL de Render.
2. Compila:

   ```bash
   cd frontend
   REACT_APP_API_BASE_URL="https://mi-app.onrender.com" yarn build
   ```
3. Publica `frontend/build/` en GitHub Pages.  
   La forma rápida con `gh-pages`:

   ```bash
   yarn add -D gh-pages
   ```

   En `package.json`:
   ```json
   "homepage": "https://TU-USUARIO.github.io/TU-REPO",
   "scripts": { "deploy": "yarn build && gh-pages -d build" }
   ```
   Y luego `yarn deploy`.

> La app usa **HashRouter**, así que funciona en cualquier hosting estático sin configurar redirecciones SPA del servidor. Las URLs se ven `https://tu.github.io/#/chat/seed-kira`.

---

## 3) Endpoints del backend

Todos bajo prefijo `/api`:

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/health` | GET | Healthcheck. |
| `/api/chat` | POST | Respuesta de una sola pasada (con auto-continuación si se corta). |
| `/api/chat/stream` | POST | Streaming SSE. Devuelve `data: {"delta":"..."}` chunks. |
| `/api/chat/regenerate` | POST | Regeneración con intensidad escalada según `attempt`. |
| `/api/chat/continue` | POST | Avanza la escena sin nuevo mensaje del usuario. |
| `/api/chat/summarize` | POST | Resumen rolling de la conversación. |
| `/api/chat/extract-memories` | POST | Extrae recuerdos durables como JSON array. |
| `/api/chat/emotion` | POST | Actualiza el vector emocional (5 ejes). |

---

## 4) Estructura

```
/app
├── backend/
│   ├── server.py            # FastAPI proxy a DeepSeek
│   ├── requirements.txt
│   ├── .env                 # secrets (no commit)
│   └── .env.example         # plantilla
└── frontend/
    ├── src/
    │   ├── config.js        # ⬅ ÚNICA URL CONFIGURABLE
    │   ├── lib/
    │   │   ├── api.js       # cliente HTTP (lee config.js)
    │   │   ├── constants.js # re-exporta config + defaults
    │   │   ├── storage.js   # localStorage + migraciones
    │   │   ├── prompt.js    # generador de system prompt
    │   │   └── textUtil.js  # detector de respuesta cortada
    │   ├── context/AppContext.jsx
    │   ├── pages/           # Gallery, Chat, CharacterEditor, Profile, Settings
    │   └── components/      # MessageBubble, SceneSheet, MemorySheet, ChatsSheet, TopBar, CharacterCard
    ├── public/404.html      # fallback para deep links en GH Pages
    ├── .env                 # REACT_APP_API_BASE_URL
    └── .env.example
```

---

## 5) Tecnologías

- React 19 + react-router-dom (HashRouter)
- Tailwind + shadcn/ui (componentes en `components/ui/`)
- FastAPI + httpx (async streaming a DeepSeek)
- DeepSeek V4 Flash (`deepseek-v4-flash` vía `https://api.deepseek.com/chat/completions`)

---

## 6) Notas

- La persistencia es 100 % cliente (`localStorage`). El backend nunca guarda nada.  
- Las claves de la API no se envían al cliente — siempre van vía el proxy del backend.  
- El frontend incluye una pantalla de **Diagnóstico** en *Ajustes* que muestra a qué backend está conectado actualmente.
