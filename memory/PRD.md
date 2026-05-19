# PRD — Roleplay Sanctum (AI Roleplay App)

## Original problem statement
Build a modern AI roleplay web app optimized for DeepSeek V4 Flash with a high-quality Character.AI-style experience: natural conversations, immersion, persistence, low token cost, mobile-first (iPhone). Emotionally reactive, in-character, customizable, lightweight.

## Architecture
- **Frontend**: React (JS) + Tailwind + shadcn/ui + react-router. Mobile-first, dark "Jewel & Luxury" theme.
- **Backend**: FastAPI thin proxy to DeepSeek V4 Flash (chat/completions). Keeps the API key secret.
- **Persistence**: localStorage only (per user request). Characters, chats, memories, profile, settings.
- **Model**: `deepseek-v4-flash` via `https://api.deepseek.com/chat/completions`. Centralized as `DEEPSEEK_MODEL` constant.

## Tech choices
- DeepSeek API key: provided by user, stored in `/app/backend/.env` as `DEEPSEEK_API_KEY`.
- Fonts: Cormorant Garamond (display) + Outfit (body).
- Colors: Obsidian (#050505) base + warm amber (#C6A45C) accent. Dark theme.

## Core requirements (implemented)
- Character system: name, avatar, personality, lore, speaking style, emotional tendencies, example dialogue, tags, initial message, default scene. Each character has isolated memories/chats/summary.
- Chat: send, edit (trims subsequent), delete, regenerate, auto-save, restore.
- Initial message: editable, replaceable, regeneratable, persistent.
- Swipe variants: regeneration appends to variant list; user can swipe between 1..4 stored variants.
- Regeneration: hidden randomized directives, higher temperature, presence/freq penalties to force variation.
- User profile injected into system prompt.
- Scene editor (bottom sheet): location, atmosphere, character emotion, current scene.
- 3-layer memory: short history (last N raw) + summary (auto-generated) + persistent memories (auto-extracted JSON list with dedupe).
- Style sliders: creativity (→ temperature), romanticism, emotional intensity (→ hidden directives).
- Anti-repetition: presence_penalty 0.7, frequency_penalty 0.45, slider-derived temperature, regen directives.
- Token optimization: shortHistory limit, summary compression, dynamic max_tokens.
- Auto-save: every state mutation persists to localStorage via useEffect.
- Import/Export: full JSON export of everything, per-character export, import with overwrite.
- Mobile-first UI: bottom sheets for scene/memory, safe-area padding, visible (non-hover-only) message actions.

## Files
- `/app/backend/server.py` — proxy endpoints
- `/app/backend/.env` — secrets
- `/app/frontend/src/App.js` — router
- `/app/frontend/src/lib/{constants,storage,api,prompt}.js` — core logic
- `/app/frontend/src/context/AppContext.jsx` — state + localStorage persistence
- `/app/frontend/src/pages/{Gallery,CharacterEditor,Chat,Profile,Settings}.jsx`
- `/app/frontend/src/components/{TopBar,CharacterCard,MessageBubble,SceneSheet,MemorySheet}.jsx`

## What's been implemented (2026-02)
- Full app per spec. Functional end-to-end with real DeepSeek V4 Flash.

## Iteration 2 (2026-02) — Spanish UI + multi-chat + memory upgrades
- Complete Spanish translation across Gallery, Chat, CharacterEditor, Profile, Settings, MessageBubble, MemorySheet, SceneSheet, ChatsSheet, toasts.
- **Multi-chat per character**: each character now has `sessions[]` with `activeSessionId`. Create / rename / switch / delete sessions via new ChatsSheet. Backward-compatible auto-migration of old single-chat localStorage shape (no data loss).
- **"Continuar" button**: advances the scene with a new beat, distinct from regenerate. New `/api/chat/continue` endpoint.
- **Edit-after-delete bug fixed**: editing a user message ALWAYS trims subsequent + auto-regenerates a fresh AI reply, regardless of whether AI replies were previously deleted.
- **Cut-off auto-continuation**: backend detects `finish_reason=length` or no terminal punctuation / unbalanced asterisks → silently requests a continuation and glues it. Backend now also retries empty continuations.
- **Graduated regeneration**: attempt 1 → mild directive, attempt 2 → strong (reverse emotion, different beat), attempt 3+ → extreme (unexpected choice, tone shift). `avoid_phrases` sent so the model sees prior openings.
- **Memory upgrades**:
  - Pinned memories (★) always included in prompt with high priority.
  - Memory objects: `{id, text, pinned, createdAt}`. Auto-migrated from old strings.
  - Contextual retrieval: `selectMemories()` ranks by keyword overlap with last user/assistant turns; pinned always first; capped by `maxMemoriesPerTurn` setting.
- **Rolling summary**: now updates every 8 messages (was 12), weighted toward recent events with explicit instructions.
- **Memory extraction**: more aggressive prompt; runs every 4 messages (was 6); deduplicated; caps at 80 unpinned + all pinned.
- **Emotional state**: 5-axis tracker (trust/affection/tension/fear/hostility) updated by `/api/chat/emotion` and shown as bars in MemorySheet. Hidden directives in system prompt reflect the state.
- **Settings**: new `maxMemoriesPerTurn` slider for token budget control.

## Iteration 3 (2026-02) — Streaming + deployment refactor
- **Streaming SSE (P1)**: new `/api/chat/stream` endpoint forwards DeepSeek's SSE chunks as `{delta: "..."}` events. Frontend uses `fetch` ReadableStream + async generator. Chat bubble fills in token-by-token (~50ms flush throttling). Toggle to disable in Settings.
- **Thinking mode disabled by default**: DeepSeek V4 Flash's `thinking: {type: "disabled"}` is auto-set on all backend calls — eliminates ~2-5s reasoning preamble for instant streaming UX.
- **Deployment refactor**:
  - `frontend/src/config.js` — ÚNICA URL configurable. Reads `REACT_APP_API_BASE_URL` (preferred) or `REACT_APP_BACKEND_URL` (legacy), falls back to `http://localhost:8001`.
  - `frontend/src/lib/constants.js` and `api.js` now import from config (no hardcoded URLs anywhere).
  - Backend CORS expanded: explicit localhost dev origins + `allow_origin_regex` for `*.github.io`.
  - **HashRouter** in App.js → works on any static host (GitHub Pages, S3, etc.) without server-side SPA redirect config.
  - `public/404.html` SPA fallback for custom-domain deployments.
  - `.env.example` files for both frontend and backend.
  - `/app/README.md` — complete deployment guide (local + Render + GitHub Pages).
- **Settings → Diagnóstico section**: shows current API base URL + model. Useful to verify which backend you're hitting.
- localStorage logic untouched (no migration needed; iter2 multi-session shape preserved).

## Backlog / next priorities
- P1: Per-session emotional state graphs over time.
- P2: Share characters via URL-encoded JSON.
- P2: Character daily-journal feature (auto-generated diary entries from the character's POV).
- P2: Group roleplay with multiple AIs in one chat.
- P2: Voice input (Web Speech API).
