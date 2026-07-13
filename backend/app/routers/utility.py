from fastapi import APIRouter, HTTPException
from app.schemas import SummarizeRequest, MemoryRequest, EmotionRequest, CompressRequest, AutoFillRequest
from app.config import DEEPSEEK_MODEL # Si puedes, usa un modelo sin razonamiento para estas utilidades (ej. DeepSeek-V3)
from app.core.client import deepseek_agent
import json
import yaml

router = APIRouter(prefix="/chat", tags=["AI Utility Operations"])

AUTO_FILL_DEFAULTS = {
    "name": "",
    "tagline": "",
    "personality": "",
    "appearance": "",
    "lore": "",
    "secondaryCharacters": "",
    "speakingStyle": "",
    "emotionalTendencies": "",
    "exampleDialogues": "",
    "tags": [],
    "initialMessage": "",
    "sceneDefault": {
        "location": "",
        "atmosphere": "",
        "characterEmotion": "",
    },
}

AUTO_FILL_KEYS = set(AUTO_FILL_DEFAULTS.keys()) | {"character_data"}


def _as_clean_text(value):
    return value.strip() if isinstance(value, str) else ""


def _as_text_block(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        compact = {k: v for k, v in value.items() if v not in (None, "", [], {})}
        if not compact:
            return ""
        return yaml.safe_dump(compact, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()
    if isinstance(value, list):
        compact = [item for item in value if item not in (None, "", [], {})]
        if not compact:
            return ""
        return yaml.safe_dump(compact, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()
    if value is None:
        return ""
    return str(value).strip()


def _strip_code_fences(text):
    raw = _as_clean_text(text)
    if not raw.startswith("```"):
        return raw

    lines = raw.splitlines()
    if lines and lines[0].startswith("```"):
        lines.pop(0)
    if lines and lines[-1].startswith("```"):
        lines.pop()
    return "\n".join(lines).strip()


def _pick(value, *keys):
    for key in keys:
        if isinstance(value, dict) and key in value and value.get(key) not in (None, ""):
            return value.get(key)
    return None


def _normalize_tags(value):
    if isinstance(value, list):
        return [str(tag).strip() for tag in value if str(tag).strip()]
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("-") or "\n- " in stripped:
            try:
                parsed = yaml.safe_load(stripped)
                if isinstance(parsed, list):
                    return [str(tag).strip() for tag in parsed if str(tag).strip()]
            except Exception:
                pass
        return [tag.strip() for tag in value.split(",") if tag.strip()]
    return []


def _normalize_scene_default(value):
    scene = AUTO_FILL_DEFAULTS["sceneDefault"].copy()
    if isinstance(value, str):
        try:
            parsed = yaml.safe_load(value)
            if isinstance(parsed, dict):
                value = parsed
        except Exception:
            return scene
    if not isinstance(value, dict):
        return scene
    scene["location"] = _as_clean_text(_pick(value, "location"))
    scene["atmosphere"] = _as_clean_text(_pick(value, "atmosphere"))
    scene["characterEmotion"] = _as_clean_text(_pick(value, "characterEmotion", "character_emotion", "emotion"))
    return scene


def _has_supported_character_shape(value):
    if not isinstance(value, dict):
        return False
    if isinstance(value.get("character_data"), dict):
        value = value["character_data"]
    return bool(set(value.keys()) & AUTO_FILL_KEYS)


def _try_parse_structured_character_data(raw_text):
    text = _strip_code_fences(raw_text)
    if not text:
        return None

    parsers = [json.loads, yaml.safe_load]
    for parser in parsers:
        try:
            parsed = parser(text)
        except Exception:
            continue
        if _has_supported_character_shape(parsed):
            return _normalize_character_data(parsed)
    return None


def _normalize_character_data(value):
    if isinstance(value, dict) and isinstance(value.get("character_data"), dict):
        value = value["character_data"]
    if not isinstance(value, dict):
        return {
            **AUTO_FILL_DEFAULTS,
            "tags": [],
            "sceneDefault": AUTO_FILL_DEFAULTS["sceneDefault"].copy(),
        }

    normalized = {
        "name": _as_clean_text(_pick(value, "name", "characterName")),
        "tagline": _as_clean_text(_pick(value, "tagline", "summaryLine")),
        "personality": _as_text_block(_pick(value, "personality", "identity")),
        "appearance": _as_text_block(_pick(value, "appearance", "physicalDescription")),
        "lore": _as_text_block(_pick(value, "lore", "worldLore", "context")),
        "secondaryCharacters": _as_text_block(_pick(value, "secondaryCharacters", "secondary_characters", "supportingCharacters")),
        "speakingStyle": _as_text_block(_pick(value, "speakingStyle", "speechStyle", "voiceStyle")),
        "emotionalTendencies": _as_text_block(_pick(value, "emotionalTendencies", "emotionalProfile")),
        "exampleDialogues": _as_text_block(_pick(value, "exampleDialogues", "exampleDialogue", "sampleDialogue")),
        "tags": _normalize_tags(_pick(value, "tags", "keywords")),
        "initialMessage": _as_text_block(_pick(value, "initialMessage", "openingMessage", "firstMessage")),
        "sceneDefault": _normalize_scene_default(_pick(value, "sceneDefault", "scene_default", "scene")),
    }
    return normalized

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
    structured = _try_parse_structured_character_data(req.base_description)
    if structured is not None:
        if not structured["initialMessage"] and req.initial_message:
            structured["initialMessage"] = _as_text_block(req.initial_message)
        return {"character_data": structured}

    sys = (
        "Eres un ingeniero experto en optimización de prompts para bots de roleplay. "
        "Analiza una ficha cruda, YAML, JSON o texto libre y repártela en un objeto JSON válido con estas llaves exactas:\n"
        "name, tagline, personality, appearance, lore, secondaryCharacters, speakingStyle, emotionalTendencies, exampleDialogues, tags, initialMessage, sceneDefault.\n"
        "Reglas:\n"
        "- Output JSON only.\n"
        "- tags debe ser un array de strings cortos.\n"
        "- sceneDefault debe ser un objeto con las llaves exactas: location, atmosphere, characterEmotion.\n"
        "- personality debe condensar identidad, contradicciones, deseos, miedos y límites si están presentes.\n"
        "- appearance debe ser un string compacto y semiestructurado con etiquetas útiles como: overall, face, hair, eyes, body, clothing, bodyLanguage, voice, specialFeatures.\n"
        "- Conserva rasgos no humanos o fantásticos dentro de la etiqueta specialFeatures y en los apartados donde correspondan.\n"
        "- secondaryCharacters debe ser un string en formato de lista YAML compacta. Para cada secundario recurrente incluye: name, relation, role, appearance, personality, speakingStyle, triggerConditions, turnRules, sampleLine. Si no hay secundarios relevantes, devuelve string vacío.\n"
        "- exampleDialogues debe mostrar la voz del personaje principal y, si procede, la de un secundario.\n"
        "- Rellena solo con información sustentada por el texto; si algo no aparece, usa string vacío en vez de inventar demasiado."
    )
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": f"Ficha base:\n{req.base_description}\n\nMensaje inicial sugerido:\n{req.initial_message}"}],
        "temperature": 0.3,
        "max_tokens": 1800,
        "response_format": {"type": "json_object"}, # 🚀 JSON MODE NATIVO
        "stream": False,
    }
    data = await deepseek_agent.post("/chat/completions", payload)
    content = data["choices"][0]["message"]["content"].strip()
    
    try:
        character_data = _normalize_character_data(json.loads(content))
    except json.JSONDecodeError:
        # Fallback de seguridad en caso de fallo de generación para que no crashee tu backend
        character_data = {
            **AUTO_FILL_DEFAULTS,
            "tags": [],
            "sceneDefault": AUTO_FILL_DEFAULTS["sceneDefault"].copy(),
        }
        
    return {"character_data": character_data}
