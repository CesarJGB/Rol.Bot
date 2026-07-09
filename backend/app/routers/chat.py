from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, ContinueRequest
from app.config import DEEPSEEK_MODEL
from app.core.client import deepseek_agent
from app.core.directives import pick_directives, looks_cut_off
import json

router = APIRouter(prefix="/chat", tags=["Chat Operations"])

async def _verify_and_auto_continue(content: str, finish_reason: str, base_payload: dict, original_temp: float) -> str:
    """Helper DRY para manejar textos cortados a mitad de frase."""
    if finish_reason == "length" or looks_cut_off(content):
        cont_payload = dict(base_payload)
        
        # Copiamos el array para no mutar el original
        extended_messages = list(base_payload["messages"])
        extended_messages.append({"role": "assistant", "content": content})
        extended_messages.append({"role": "user", "content": "[Continue exactly where you left off mid-sentence. Do not repeat. Finish the thought naturally and stop within a beat or two. Plain continuation only — no preamble.]"})
        
        cont_payload["messages"] = extended_messages
        cont_payload["max_tokens"] = min(400, base_payload.get("max_tokens", 800))
        cont_payload["temperature"] = 0.50 # Temperatura baja fija para continuaciones ultra rápidas
        
        try:
            cdata = await deepseek_agent.post("/chat/completions", cont_payload)
            extra = cdata["choices"][0]["message"]["content"]
            glue = "" if (content.endswith((" ", "\n")) or extra.startswith((" ", ",", ".", "!", "?", "*", '"', ")"))) else " "
            content = content + glue + extra
        except HTTPException:
            pass
    return content

@router.post("")
async def chat(req: ChatRequest):
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

    data = await deepseek_agent.post("/chat/completions", payload)
    
    try:
        content = data["choices"][0]["message"]["content"]
        finish_reason = data["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    content = await _verify_and_auto_continue(content, finish_reason, payload, req.temperature or 0.6)
    return {"content": content, "usage": data.get("usage", {}), "finish_reason": finish_reason}

@router.post("/regenerate")
async def chat_regenerate(req: ChatRequest):
    attempt = max(1, req.attempt or 1)
    directive = pick_directives(attempt)

    avoid_block = ""
    if req.avoid_phrases:
        snippets = [p.strip().replace("\n", " ")[:60] for p in req.avoid_phrases[-4:] if p and p.strip()]
        if snippets:
            avoid_block = "\n\nPrior versions you've already produced (DO NOT reuse their openings, gestures, sentence rhythms, or emotional direction):\n" + "\n".join(f'  · "{s}…"' for s in snippets)

    msgs = [m.model_dump() for m in req.messages]
    instruction = (
        f"\n\n[REGENERATION — attempt #{attempt}]\n{directive}\n"
        f"This is a fresh take. Do NOT paraphrase any prior version. Pick a different emotional path, a different first sentence, "
        f"a different gesture, a different focal point.{avoid_block}"
    )
    
    # 🚀 PROTECCIÓN DE CACHÉ: En lugar de meter la instrucción en msgs[0], 
    # la pegamos al FINAL del último mensaje de usuario disponible.
    if msgs:
        last_user_msg = next((m for m in reversed(msgs) if m["role"] == "user"), None)
        if last_user_msg:
            last_user_msg["content"] = last_user_msg["content"] + instruction
        else:
            msgs.append({"role": "system", "content": instruction})

    # Calibración de parámetros segura para DeepSeek Reasoner
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": msgs,
        "temperature": min(0.70, (req.temperature or 0.6) + (attempt * 0.02)), # Capado estrictamente a 0.70
        "max_tokens": req.max_tokens,
        "presence_penalty": 0.1, 
        "frequency_penalty": 0.1,
        "top_p": min(1.0, (req.top_p or 0.95)),
        "stream": False,
    }
    
    data = await deepseek_agent.post("/chat/completions", payload)
    try:
        content = data["choices"][0]["message"]["content"]
        finish_reason = data["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    content = await _verify_and_auto_continue(content, finish_reason, payload, payload["temperature"])
    return {"content": content, "attempt": attempt}

@router.post("/continue")
async def chat_continue(req: ContinueRequest):
    msgs = [m.model_dump() for m in req.messages]
    nudge = (
        "\n\n[CONTINUE THE SCENE — ONE BEAT FORWARD]\n"
        "Continue DIRECTLY from where the last message ended. Do NOT rewind, do NOT re-introduce context, "
        "do NOT summarize what just happened. Pick up mid-scene as if no time has passed.\n"
        "NEVER speak, think, or act as the user. NEVER invent dialogue or actions for the user.\n"
        "One small thing happens: a glance, a breath, a movement, a sound, a shift in the air. "
        "Under 80 words. Stay fully in character. No preamble. Just continue."
    )
    
    # 🚀 PROTECCIÓN DE CACHÉ: Inyectamos la instrucción al final del historial limpio
    if msgs:
        last_user_msg = next((m for m in reversed(msgs) if m["role"] == "user"), None)
        if last_user_msg:
            last_user_msg["content"] = last_user_msg["content"] + nudge
        else:
            # Si es una continuación consecutiva pura (solo hay assistant al final), lo añadimos como nota de sistema final
            msgs.append({"role": "system", "content": nudge})

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": msgs,
        "temperature": min(0.70, (req.temperature or 0.6) + 0.05), # Evitamos el 1.5 que destruía el pensamiento
        "max_tokens": min(req.max_tokens or 800, 1000),
        "presence_penalty": 0.1,
        "frequency_penalty": 0.1,
        "top_p": req.top_p,
        "stream": False,
    }
    
    data = await deepseek_agent.post("/chat/completions", payload)
    try:
        content = data["choices"][0]["message"]["content"]
        finish_reason = data["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Malformed DeepSeek response")

    content = await _verify_and_auto_continue(content, finish_reason, payload, payload["temperature"])
    return {"content": content}

@router.post("/stream")
async def chat_stream(req: ChatRequest):
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "presence_penalty": req.presence_penalty,
        "frequency_penalty": req.frequency_penalty,
        "top_p": req.top_p,
        "stream": True,
    }
    if req.stop:
        payload["stop"] = req.stop

    async def event_generator():
        sent_done = False
        has_started_thinking = False
        has_finished_thinking = False
        
        try:
            async with deepseek_agent.client.stream("POST", "/chat/completions", json=payload) as resp:
                if resp.status_code >= 400:
                    yield f"data: {json.dumps({'error': f'upstream {resp.status_code}'})}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                    
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        yield "data: [DONE]\n\n"
                        sent_done = True
                        return
                    try:
                        obj = json.loads(data_str)
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        
                        reasoning = delta.get("reasoning_content")
                        content_str = delta.get("content")

                        if reasoning:
                            if not has_started_thinking:
                                has_started_thinking = True
                                yield f"data: {json.dumps({'delta': '<think>' + reasoning})}\n\n"
                            else:
                                yield f"data: {json.dumps({'delta': reasoning})}\n\n"
                        
                        if content_str is not None:
                            if content_str and not has_started_thinking and not has_finished_thinking:
                                content_str = content_str.lstrip()
                                yield f"data: {json.dumps({'delta': content_str})}\n\n"
                                has_finished_thinking = True
                            elif has_started_thinking and not has_finished_thinking:
                                has_finished_thinking = True
                                content_str = content_str.lstrip()
                                yield f"data: {json.dumps({'delta': '</think>\n' + content_str})}\n\n"
                            elif content_str:
                                yield f"data: {json.dumps({'delta': content_str})}\n\n"
                                
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if not sent_done:
                yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
