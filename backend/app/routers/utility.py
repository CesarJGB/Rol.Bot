from fastapi import APIRouter
from app.schemas import SummarizeRequest, MemoryRequest, EmotionRequest, CompressRequest, AutoFillRequest
from app.config import DEEPSEEK_MODEL
from app.core.client import deepseek_agent
import json

router = APIRouter(prefix="/chat", tags=["AI Utility Operations"])

@router.post("/summarize")
async def summarize(req: SummarizeRequest):
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    sys = (
        "You are the story-keeper for an ongoing roleplay. Update the running summary.\n"
        "Rules:\n- Output a tight 4-7 sentence third-person past-tense narrative.\n"
        "- Weight RECENT events more heavily than old ones.\n"
        "- Compress old developments aggressively.\n"
        "- NO bullet points. NO meta. Just the narrative."
    )
    user = ((f"Current running summary:\n{req.previous_summary}\n\n" if req.previous_summary else "")
            + f"NEW exchange between USER and {req.character_name}:\n{history_text}")
    
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        "temperature": 0.45,
        "max_tokens": 260,
        "stream": False,
        "thinking": {"type": "disabled"},
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    return {"summary": data["choices"][0]["message"]["content"].strip()}

@router.post("/extract-memories")
async def extract_memories(req: MemoryRequest):
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    existing = "\n".join(f"- {m}" for m in (req.existing_memories or []))
    sys = (
        "You extract ONLY the most essential, durable facts from a roleplay exchange.\n"
        "Return a JSON array of short strings (each max 12 words). Be VERY selective — aim for 0-3 items max.\n"
        "Output JSON only."
    )
    user = f"Character: {req.character_name}\n\nExisting memories:\n{existing or '(none)'}\n\nExchange:\n{history_text}"
    
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        "temperature": 0.35,
        "max_tokens": 160,
        "stream": False,
        "thinking": {"type": "disabled"},
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip().strip("`").replace("json", "").strip()
    try:
        memories = json.loads(content)
        if not isinstance(memories, list): memories = []
    except json.JSONDecodeError:
        memories = []
    return {"memories": memories}

@router.post("/emotion")
async def update_emotion(req: EmotionRequest):
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    current = req.current_state or {"trust": 50, "affection": 50, "tension": 30, "fear": 20, "hostility": 20}
    sys = (
        "You track a fictional character's emotional state toward the user across a roleplay.\n"
        "Keys: trust, affection, tension, fear, hostility — each integer 0-100. Output JSON only."
    )
    user = f"Character: {req.character_name}\n\nCurrent state: {json.dumps(current)}\n\nRecent exchange:\n{history_text}"
    
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        "temperature": 0.3,
        "max_tokens": 120,
        "stream": False,
        "thinking": {"type": "disabled"},
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip().strip("`").replace("json", "").strip()
    try:
        state = json.loads(content)
        out = {k: max(0, min(100, int(state.get(k, current.get(k, 50))))) for k in current.keys()}
        return {"state": out}
    except Exception:
        return {"state": current}

@router.post("/compress")
async def compress_character(req: CompressRequest):
    sys = (
        "Eres un experto en optimización de prompts para roleplay. Tu tarea es tomar la descripción "
        "de un personaje y comprimirla en un formato YAML estricto y denso (estilo W++).\n"
        "Devuelve SOLO el código YAML puro, sin code fences (```) ni explicaciones."
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": f"Comprime este perfil:\n\n{req.text}"}],
        "temperature": 0.2,
        "max_tokens": 500,
        "stream": False,
        "thinking": {"type": "disabled"}
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip().strip("`").replace("yaml", "").strip()
    return {"compressed": content}

# Reubicado bajo el prefijo correcto de ruta semántica
@router.post("/character/auto-fill")
async def auto_fill_character(req: AutoFillRequest):
    sys = (
        "Eres un ingeniero experto en optimización de prompts para bots de roleplay. "
        "Analiza la descripción y repártela en un objeto JSON válido con estas llaves exactas:\n"
        "tagline, personality, lore, speakingStyle, emotionalTendencies, exampleDialogues, tags.\n"
        "Output JSON only. No prose. No code fences."
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": f"Descripción:\n{req.base_description}\n\nMensaje:\n{req.initial_message}"}],
        "temperature": 0.3,
        "max_tokens": 1500,
        "stream": False,
        "thinking": {"type": "disabled"}
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip().strip("`").replace("json", "").strip()
    return {"character_data": json.loads(content)}
