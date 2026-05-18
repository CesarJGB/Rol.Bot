"""DeepSeek V4 Flash proxy for the AI roleplay frontend.

The backend is intentionally thin: persistence lives in browser localStorage.
The backend's only job is to keep the API key secret and route chat-completion,
summarization, and memory-extraction requests to DeepSeek.
"""

from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
import random
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

app = FastAPI(title="Roleplay AI Proxy")
api_router = APIRouter(prefix="/api")


# ------------- Schemas -------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.85
    max_tokens: Optional[int] = 400
    presence_penalty: Optional[float] = 0.7
    frequency_penalty: Optional[float] = 0.45
    top_p: Optional[float] = 0.95
    n: Optional[int] = 1
    stop: Optional[List[str]] = None


class SummarizeRequest(BaseModel):
    messages: List[ChatMessage]
    character_name: str
    previous_summary: Optional[str] = ""


class MemoryRequest(BaseModel):
    messages: List[ChatMessage]
    character_name: str
    existing_memories: Optional[List[str]] = []


# ------------- DeepSeek HTTP -------------

async def deepseek_call(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"DeepSeek network error: {e}")

    if resp.status_code >= 400:
        try:
            err = resp.json()
        except Exception:
            err = {"raw": resp.text}
        raise HTTPException(status_code=resp.status_code, detail={"deepseek": err})

    return resp.json()


# ------------- Hidden regen directives -------------
REGEN_DIRECTIVES = [
    "Take a sharply different emotional angle than before — maybe restrained, maybe vulnerable.",
    "Change the pacing: open with silence, a gesture, or a small physical detail.",
    "Reply more tersely. Let what's unsaid carry the weight.",
    "Lean into subtext. Hint at feelings rather than declaring them.",
    "Begin mid-action. Skip pleasantries.",
    "Show a flaw, a hesitation, or a contradiction in the character.",
    "Shift the focus from dialogue to the environment for one beat.",
    "Use a different rhythm: short, clipped sentences.",
    "Use a different rhythm: a single longer, breath-held line.",
    "Open with a question instead of a statement.",
    "React with the body before the words.",
    "Let the character interrupt themselves.",
]


# ------------- Routes -------------

@api_router.get("/")
async def root():
    return {"status": "ok", "model": DEEPSEEK_MODEL}


@api_router.get("/health")
async def health():
    return {"status": "ok", "model": DEEPSEEK_MODEL, "has_key": bool(DEEPSEEK_API_KEY)}


@api_router.post("/chat")
async def chat(req: ChatRequest):
    """Single-shot chat completion."""
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "presence_penalty": req.presence_penalty,
        "frequency_penalty": req.frequency_penalty,
        "top_p": req.top_p,
        "stream": False,
    }
    if req.stop:
        payload["stop"] = req.stop

    data = await deepseek_call(payload)
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")
    return {"content": content, "usage": data.get("usage", {})}


@api_router.post("/chat/variants")
async def chat_variants(req: ChatRequest):
    """Generate N response variants for the swipe system (independent calls with different directives)."""
    n = max(1, min(req.n or 3, 4))
    variants: List[str] = []
    base_messages = [m.model_dump() for m in req.messages]

    for i in range(n):
        directive = random.choice(REGEN_DIRECTIVES)
        msgs = [dict(m) for m in base_messages]
        if msgs and msgs[0]["role"] == "system":
            msgs[0]["content"] = msgs[0]["content"] + f"\n\n[Variant guidance #{i+1}]: {directive}"
        else:
            msgs.insert(0, {"role": "system", "content": f"[Variant guidance]: {directive}"})

        payload = {
            "model": DEEPSEEK_MODEL,
            "messages": msgs,
            "temperature": min(1.7, (req.temperature or 0.85) + 0.25 + (i * 0.08)),
            "max_tokens": req.max_tokens,
            "presence_penalty": min(2.0, (req.presence_penalty or 0.7) + 0.1),
            "frequency_penalty": min(2.0, (req.frequency_penalty or 0.45) + 0.05),
            "top_p": req.top_p,
            "stream": False,
        }
        data = await deepseek_call(payload)
        try:
            variants.append(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError):
            continue

    if not variants:
        raise HTTPException(status_code=502, detail="No variants produced")
    return {"variants": variants}


@api_router.post("/chat/regenerate")
async def chat_regenerate(req: ChatRequest):
    """Single regenerated reply with forced creative shift."""
    directive = random.choice(REGEN_DIRECTIVES)
    msgs = [m.model_dump() for m in req.messages]
    if msgs and msgs[0]["role"] == "system":
        msgs[0]["content"] = msgs[0]["content"] + f"\n\n[Regeneration directive]: {directive} Avoid repeating prior phrasing, gestures, or sentence structure."
    else:
        msgs.insert(0, {"role": "system", "content": f"[Regeneration directive]: {directive}"})

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": msgs,
        "temperature": min(1.7, (req.temperature or 0.85) + 0.35),
        "max_tokens": req.max_tokens,
        "presence_penalty": min(2.0, (req.presence_penalty or 0.7) + 0.15),
        "frequency_penalty": min(2.0, (req.frequency_penalty or 0.45) + 0.1),
        "top_p": req.top_p,
        "stream": False,
    }
    data = await deepseek_call(payload)
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")
    return {"content": content}


@api_router.post("/chat/summarize")
async def summarize(req: SummarizeRequest):
    """Compress a chunk of conversation into a story-progression summary."""
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    sys = (
        "You are a story-keeper. Compress the following roleplay exchange into a "
        "tight 3-6 sentence summary that captures: who did/said what, the emotional "
        "beats, and any new commitments, secrets, or scene changes. Write it as "
        "third-person past tense narrative. No bullet points. No fluff."
    )
    user = (
        (f"Previous summary so far:\n{req.previous_summary}\n\n" if req.previous_summary else "")
        + f"New exchange between USER and {req.character_name}:\n{history_text}"
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "temperature": 0.4,
        "max_tokens": 220,
        "stream": False,
    }
    data = await deepseek_call(payload)
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")
    return {"summary": content}


@api_router.post("/chat/extract-memories")
async def extract_memories(req: MemoryRequest):
    """Extract durable facts as a JSON list."""
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    existing = "\n".join(f"- {m}" for m in (req.existing_memories or []))
    sys = (
        "You extract durable, character-relevant facts from a roleplay exchange.\n"
        "Return ONLY a JSON array of short strings (max 12 words each).\n"
        "Capture: names, relationships, preferences, fears, goals, important events, promises, secrets.\n"
        "Do NOT include trivia, weather, or one-off small talk.\n"
        "Do NOT repeat anything that is already in the existing memories list.\n"
        "If there is nothing worth saving, return [].\n"
        "Output JSON only. No prose. No code fences."
    )
    user = (
        f"Character: {req.character_name}\n\n"
        f"Existing memories (do not duplicate):\n{existing or '(none)'}\n\n"
        f"Recent exchange:\n{history_text}"
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 250,
        "stream": False,
    }
    data = await deepseek_call(payload)
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        memories = json.loads(content)
        if not isinstance(memories, list):
            memories = []
        memories = [str(m).strip() for m in memories if str(m).strip()]
    except json.JSONDecodeError:
        memories = []

    return {"memories": memories}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
