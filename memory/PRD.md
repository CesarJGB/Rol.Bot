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

## Backlog / next priorities
- P1: Streaming responses (SSE) for faster perceived latency.
- P1: Theme picker (light variant for daytime use).
- P2: Multiple chats per character (currently 1 chat per character).
- P2: Character community / share import URL.
- P2: Voice input via Web Speech API.
- P2: Group roleplay (>1 character in one chat).
