from fastapi import APIRouter, HTTPException
from app.schemas import SummarizeRequest, MemoryRequest, EmotionRequest, CompressRequest, AutoFillRequest
from app.config import DEEPSEEK_MODEL # Si puedes, usa un modelo sin razonamiento para estas utilidades (ej. DeepSeek-V3)
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
        "temperature": 0.3, # Temperatura baja para resúmenes más estables
        "max_tokens": 300,
        "stream": False,
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
        "Output JSON only. Do not wrap in markdown code blocks."
    )
    user = f"Character: {req.character_name}\n\nExisting memories:\n{existing or '(none)'}\n\nExchange:\n{history_text}"
    
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        "temperature": 0.1, # Casi determinista para evitar memorias duplicadas o raras
        "max_tokens": 200,
        "response_format": {"type": "json_object"}, # 🚀 JSON MODE NATIVO
        "stream": False,
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip()
    
    try:
        memories = json.loads(content)
        # Aseguramos que la respuesta venga dentro de una llave o sea una lista válida
        if isinstance(memories, dict) and "memories" in memories:
            memories = memories["memories"]
        if not isinstance(memories, list): 
            memories = []
    except (json.JSONDecodeError, TypeError):
        memories = []
    return {"memories": memories}

@router.post("/emotion")
async def update_emotion(req: EmotionRequest):
    history_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages)
    current = req.current_state or {"trust": 50, "affection": 50, "tension": 30, "fear": 20, "hostility": 20}
    sys = (
        "You track a fictional character's emotional state toward the user across a roleplay.\n"
        "Return a JSON object with the updated integers (0-100) for the keys provided.\n"
        "Keys: trust, affection, tension, fear, hostility. Output JSON only."
    )
    user = f"Character: {req.character_name}\n\nCurrent state: {json.dumps(current)}\n\nRecent exchange:\n{history_text}"
    
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        "temperature": 0.2,
        "max_tokens": 150,
        "response_format": {"type": "json_object"}, # 🚀 JSON MODE NATIVO
        "stream": False,
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip()
    
    try:
        state = json.loads(content)
        # Si el modelo anidó el JSON dentro de una llave primaria, intentamos extraerlo
        if "state" in state and isinstance(state["state"], dict):
            state = state["state"]
            
        out = {k: max(0, min(100, int(state.get(k, current.get(k, 50))))) for k in current.keys()}
        return {"state": out}
    except Exception:
        return {"state": current}

@router.post("/compress")
async def compress_character(req: CompressRequest):
    sys = (
        "Eres un experto en optimización de prompts para roleplay. Tu tarea es tomar la descripción "
        "de un personaje y comprimirla en un formato YAML estricto y denso (estilo W++).\n"
        "Devuelve SOLO el código YAML puro, sin explicaciones coloniales ni introducciones."
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": f"Comprime este perfil:\n\n{req.text}"}],
        "temperature": 0.2,
        "max_tokens": 600,
        "stream": False,
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip()
    
    # Limpieza segura para YAML (Los LLMs aman poner cercas de código si no se las quitas)
    if content.startswith("```"):
        lines = content.splitlines()
        if lines[0].startswith("```"): lines.pop(0)
        if lines and lines[-1].startswith("```"): lines.pop()
        content = "\n".join(lines).replace("yaml\n", "")
        
    return {"compressed": content.strip()}

@router.post("/character/auto-fill")
async def auto_fill_character(req: AutoFillRequest):
    sys = (
        "Eres un ingeniero experto en optimización de prompts para bots de roleplay. "
        "Analiza la descripción y repártela en un objeto JSON válido con estas llaves exactas:\n"
        "tagline, personality, lore, speakingStyle, emotionalTendencies, exampleDialogues, tags.\n"
        "Output JSON only."
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": f"Descripción:\n{req.base_description}\n\nMensaje:\n{req.initial_message}"}],
        "temperature": 0.3,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"}, # 🚀 JSON MODE NATIVO
        "stream": False,
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip()
    
    try:
        character_data = json.loads(content)
    except json.JSONDecodeError:
        # Fallback de seguridad en caso de fallo de generación para que no crashee tu backend
        character_data = {
            "tagline": "", "personality": "", "lore": "", 
            "speakingStyle": "", "emotionalTendencies": "", 
            "exampleDialogues": "", "tags": []
        }
        
    return {"character_data": character_data}
