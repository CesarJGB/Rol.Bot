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
import re
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
    # For regen: 1=first regen, 2=second, etc. Strength increases.
    attempt: Optional[int] = 1
    # Optional: avoid repeating these prior assistant outputs.
    avoid_phrases: Optional[List[str]] = None


class ContinueRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.85
    max_tokens: Optional[int] = 400
    presence_penalty: Optional[float] = 0.7
    frequency_penalty: Optional[float] = 0.45
    top_p: Optional[float] = 0.95


class SummarizeRequest(BaseModel):
    messages: List[ChatMessage]
    character_name: str
    previous_summary: Optional[str] = ""


class MemoryRequest(BaseModel):
    messages: List[ChatMessage]
    character_name: str
    existing_memories: Optional[List[str]] = []


class EmotionRequest(BaseModel):
    messages: List[ChatMessage]
    character_name: str
    current_state: Optional[Dict[str, int]] = None


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


# ------------- Regen directives (graduated intensity) -------------

# Mild — used on attempt #1.
DIRECTIVES_MILD = [
    "Change your opening sentence completely. Don't start the way you did before.",
    "Take a sharply different emotional angle — restrained instead of open, or vice versa.",
    "Open with a gesture or a small physical detail instead of dialogue.",
    "Use a different rhythm: shorter, more clipped sentences.",
    "Lean into subtext. Hint instead of stating.",
    "Begin mid-action. Skip pleasantries.",
]

# Stronger — used on attempt #2.
DIRECTIVES_STRONG = [
    "DRAMATICALLY change the emotional direction. If you were warm, be cold. If amused, be wounded. If quiet, be sharp.",
    "Take a completely different narrative beat. Don't react to what was said — react to something *else* in the scene: a sound, a memory, an object, the silence.",
    "Use a totally different body language register: turn away, move closer, sit down, pace, anything but what you did before.",
    "Reverse the power dynamic of the previous reply. If you were yielding, push back. If you were probing, retreat.",
    "Skip the dialogue entirely for the first half. Pure action and atmosphere.",
    "Open with a question that catches the user off-guard. Don't answer theirs at all yet.",
]

# Extreme — used on attempt #3+.
DIRECTIVES_EXTREME = [
    "Completely upend the scene. Introduce something unexpected: a new sound, an interruption, a sudden mood swing, a memory triggering, a decision being made.",
    "The character makes an UNEXPECTED choice. They walk out. They confess something. They lie. They laugh inappropriately. They go silent and refuse to engage. Pick one and commit.",
    "Subvert the user's expectation entirely. Whatever they think will happen — do the opposite.",
    "Let the character break their own pattern. Show a hidden side: vulnerability if they're stoic, cruelty if they're kind, doubt if they're confident.",
    "Shift the entire tone of the scene. If it was tense, defuse it. If it was tender, crack it. If it was playful, darken it.",
    "Have the character interrupt themselves mid-thought and pivot to something completely different.",
]

CUT_OFF_PATTERN = re.compile(r'[.!?…»"\'\)\]\*]\s*$', re.MULTILINE)

def looks_cut_off(text: str) -> bool:
    """Detect if an assistant response was truncated by max_tokens."""
    t = text.strip()
    if not t or len(t) < 20:
        return False
    # Unclosed action asterisks?
    if t.count("*") % 2 != 0:
        return True
    # Doesn't end with terminal punctuation, closing quote, or end-of-action asterisk.
    return not bool(CUT_OFF_PATTERN.search(t))


def pick_directives(attempt: int) -> str:
    """Compose graduated regen directives."""
    bucket = DIRECTIVES_MILD if attempt <= 1 else (DIRECTIVES_STRONG if attempt == 2 else DIRECTIVES_EXTREME)
    picks = random.sample(bucket, k=min(2, len(bucket)))
    return " ".join(picks)


# ------------- Routes -------------

@api_router.get("/")
async def root():
    return {"status": "ok", "model": DEEPSEEK_MODEL}


@api_router.get("/health")
async def health():
    return {"status": "ok", "model": DEEPSEEK_MODEL, "has_key": bool(DEEPSEEK_API_KEY)}


@api_router.post("/chat")
async def chat(req: ChatRequest):
    """Single-shot chat completion with auto-continuation if cut off."""
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
        finish_reason = data["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    # Auto-continue if response was cut off by token limit (one retry max).
    if finish_reason == "length" or looks_cut_off(content):
        cont_payload = dict(payload)
        cont_payload["messages"] = (
            payload["messages"]
            + [{"role": "assistant", "content": content}]
            + [{"role": "user", "content": "[Continue exactly where you left off mid-sentence. Do not repeat. Finish the thought naturally and stop within a beat or two. Plain continuation only — no preamble.]"}]
        )
        cont_payload["max_tokens"] = min(220, req.max_tokens or 400)
        cont_payload["temperature"] = max(0.4, (req.temperature or 0.85) - 0.2)
        try:
            cdata = await deepseek_call(cont_payload)
            extra = cdata["choices"][0]["message"]["content"]
            # Glue gently: if our last char isn't whitespace and extra doesn't start with punctuation, insert space.
            glue = "" if (content.endswith((" ", "\n")) or extra.startswith((" ", ",", ".", "!", "?", "*", '"', ")"))) else " "
            content = content + glue + extra
        except HTTPException:
            pass

    return {"content": content, "usage": data.get("usage", {}), "finish_reason": finish_reason}


@api_router.post("/chat/regenerate")
async def chat_regenerate(req: ChatRequest):
    """Regenerate with graduated variation strength based on attempt count."""
    attempt = max(1, req.attempt or 1)
    directive = pick_directives(attempt)

    avoid_block = ""
    if req.avoid_phrases:
        # Trim to first 25 chars of each prior version so the model sees the openings to avoid.
        snippets = [p.strip().replace("\n", " ")[:60] for p in req.avoid_phrases[-4:] if p and p.strip()]
        if snippets:
            avoid_block = "\n\nPrior versions you've already produced (DO NOT reuse their openings, gestures, sentence rhythms, or emotional direction):\n" + "\n".join(f'  · "{s}…"' for s in snippets)

    msgs = [m.model_dump() for m in req.messages]
    instruction = (
        f"[REGENERATION — attempt #{attempt}]\n{directive}\n"
        f"This is a fresh take. Do NOT paraphrase any prior version. Pick a different emotional path, a different first sentence, "
        f"a different gesture, a different focal point.{avoid_block}"
    )
    if msgs and msgs[0]["role"] == "system":
        msgs[0]["content"] = msgs[0]["content"] + "\n\n" + instruction
    else:
        msgs.insert(0, {"role": "system", "content": instruction})

    # Escalate sampling pressure with attempt.
    temp_boost = 0.25 + (attempt - 1) * 0.2  # 0.25, 0.45, 0.65, 0.85...
    pres_boost = 0.1 + (attempt - 1) * 0.15
    freq_boost = 0.05 + (attempt - 1) * 0.15

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": msgs,
        "temperature": min(1.7, (req.temperature or 0.85) + temp_boost),
        "max_tokens": req.max_tokens,
        "presence_penalty": min(2.0, (req.presence_penalty or 0.7) + pres_boost),
        "frequency_penalty": min(2.0, (req.frequency_penalty or 0.45) + freq_boost),
        "top_p": min(1.0, (req.top_p or 0.95)),
        "stream": False,
    }
    data = await deepseek_call(payload)
    try:
        content = data["choices"][0]["message"]["content"]
        finish_reason = data["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    # Auto-continue on cut-off, same as /chat.
    if finish_reason == "length" or looks_cut_off(content):
        cont_payload = dict(payload)
        cont_payload["messages"] = (
            msgs
            + [{"role": "assistant", "content": content}]
            + [{"role": "user", "content": "[Continue mid-sentence. Do not repeat. Finish the thought naturally and stop.]"}]
        )
        cont_payload["max_tokens"] = min(220, req.max_tokens or 400)
        cont_payload["temperature"] = max(0.4, payload["temperature"] - 0.3)
        try:
            cdata = await deepseek_call(cont_payload)
            extra = cdata["choices"][0]["message"]["content"]
            glue = "" if (content.endswith((" ", "\n")) or extra.startswith((" ", ",", ".", "!", "?", "*", '"', ")"))) else " "
            content = content + glue + extra
        except HTTPException:
            pass

    return {"content": content, "attempt": attempt}


@api_router.post("/chat/continue")
async def chat_continue(req: ContinueRequest):
    """Advance the scene without a new user message. Different from regenerate:
    instead of replacing the last AI reply, append a NEW beat that moves the story forward."""
    msgs = [m.model_dump() for m in req.messages]
    nudge = (
        "[CONTINUE THE SCENE]\n"
        "Advance the moment forward by ONE small beat. Do NOT wait for the user. Do NOT ask the user what they want to do. "
        "Something tiny happens or shifts: a glance, a movement, a new line, an external interruption, a passing thought, "
        "a shift in atmosphere, a small action. Keep it natural and short — under 80 words. Stay fully in character. "
        "Don't summarize. Don't recap. Move."
    )
    if msgs and msgs[0]["role"] == "system":
        msgs[0]["content"] = msgs[0]["content"] + "\n\n" + nudge
    else:
        msgs.insert(0, {"role": "system", "content": nudge})

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": msgs,
        "temperature": min(1.5, (req.temperature or 0.85) + 0.1),
        "max_tokens": min(req.max_tokens or 400, 320),
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
    """Rolling summary that weights RECENT events more heavily."""
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    sys = (
        "You are the story-keeper for an ongoing roleplay. Update the running summary.\n"
        "Rules:\n"
        "- Output a tight 4-7 sentence third-person past-tense narrative.\n"
        "- Weight RECENT events more heavily than old ones. The most recent exchange should drive the summary.\n"
        "- Compress old/ancient developments aggressively (one phrase, not a sentence).\n"
        "- Preserve continuity: keep important commitments, secrets, relationships, scene location.\n"
        "- Capture emotional shifts (e.g. 'her guard dropped slightly', 'tension thickened between them').\n"
        "- NO bullet points. NO meta. NO 'in summary'. Just the narrative."
    )
    user = (
        (f"Current running summary:\n{req.previous_summary}\n\n" if req.previous_summary else "")
        + f"NEW exchange between USER and {req.character_name} (most important — center the new summary on this):\n{history_text}"
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "temperature": 0.45,
        "max_tokens": 260,
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
    """Extract durable facts. Aggressive about finding NEW info; dedupes against existing."""
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    existing = "\n".join(f"- {m}" for m in (req.existing_memories or []))
    sys = (
        "You extract durable, character-relevant facts from a roleplay exchange.\n"
        "Return ONLY a JSON array of short strings (each max 14 words).\n"
        "CAPTURE every NEW or CHANGED:\n"
        "- names, ages, pronouns, identities\n"
        "- relationships (who is what to whom, and the emotional quality)\n"
        "- promises, commitments, shared secrets\n"
        "- fears, desires, goals, deal-breakers\n"
        "- important events that just happened (kisses, fights, revelations, gifts, deaths, decisions)\n"
        "- shifts in trust, affection, or hostility\n"
        "- new locations or scene changes that matter\n"
        "Each memory should READ as a short third-person fact (e.g. 'Promised to meet Kira at the docks tomorrow at dusk').\n"
        "DO NOT include: weather details, small talk, anything already in the existing list.\n"
        "If genuinely nothing new is worth saving, return [].\n"
        "Output JSON only. No prose. No code fences. No keys, just an array."
    )
    user = (
        f"Character: {req.character_name}\n\n"
        f"Existing memories (do NOT duplicate; only include genuinely NEW or CHANGED facts):\n{existing or '(none)'}\n\n"
        f"Recent exchange to mine for new facts:\n{history_text}"
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "temperature": 0.35,
        "max_tokens": 320,
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


@api_router.post("/chat/emotion")
async def update_emotion(req: EmotionRequest):
    """Update a small emotional state vector based on the latest exchange.
    Values: trust, affection, tension, fear, hostility — each 0-100."""
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    current = req.current_state or {"trust": 50, "affection": 50, "tension": 30, "fear": 20, "hostility": 20}
    sys = (
        "You track a fictional character's emotional state toward the user across a roleplay.\n"
        "Given the recent exchange and current state values (0-100 each), return the UPDATED state as JSON.\n"
        "Keys: trust, affection, tension, fear, hostility — each integer 0-100.\n"
        "Move values gradually (typically ±3 to ±15). Big moves only on clearly major beats (betrayal, confession, intimacy, violence).\n"
        "Output JSON only. No prose. No code fences. Just an object."
    )
    user = (
        f"Character: {req.character_name}\n\n"
        f"Current state: {json.dumps(current)}\n\n"
        f"Recent exchange:\n{history_text}"
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 120,
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
        state = json.loads(content)
        if not isinstance(state, dict):
            state = current
        # Clamp + fill missing keys.
        out = {}
        for k in ("trust", "affection", "tension", "fear", "hostility"):
            v = state.get(k, current.get(k, 50))
            try:
                v = int(v)
            except (TypeError, ValueError):
                v = current.get(k, 50)
            out[k] = max(0, min(100, v))
        return {"state": out}
    except json.JSONDecodeError:
        return {"state": current}


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
