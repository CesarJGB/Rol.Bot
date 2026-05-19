"""Iteration 3 tests: streaming SSE, CORS, regression on existing endpoints."""
import os
import json
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://deepseek-roleplay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# --------------- Health & regression ---------------

def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["has_key"] is True


def test_chat_basic():
    r = requests.post(f"{API}/chat", json={
        "messages": [
            {"role": "system", "content": "Eres un asistente conciso."},
            {"role": "user", "content": "Saluda en una línea."},
        ],
        "max_tokens": 60,
    }, timeout=60)
    assert r.status_code == 200
    assert r.json().get("content", "").strip() != ""


def test_chat_malformed_returns_422():
    # missing required 'messages'
    r = requests.post(f"{API}/chat", json={"foo": "bar"}, timeout=15)
    assert r.status_code == 422


def test_chat_regenerate():
    r = requests.post(f"{API}/chat/regenerate", json={
        "messages": [
            {"role": "system", "content": "Eres breve."},
            {"role": "user", "content": "Dime hola."},
            {"role": "assistant", "content": "Hola."},
            {"role": "user", "content": "Otra vez."},
        ],
        "attempt": 1,
        "max_tokens": 60,
    }, timeout=60)
    assert r.status_code == 200
    assert r.json().get("attempt") == 1


def test_chat_continue():
    r = requests.post(f"{API}/chat/continue", json={
        "messages": [
            {"role": "system", "content": "Roleplay breve."},
            {"role": "user", "content": "Empieza una escena."},
            {"role": "assistant", "content": "La habitación estaba en silencio."},
        ],
        "max_tokens": 80,
    }, timeout=60)
    assert r.status_code == 200
    assert r.json().get("content", "").strip() != ""


def test_summarize():
    r = requests.post(f"{API}/chat/summarize", json={
        "messages": [
            {"role": "user", "content": "Hola Kira."},
            {"role": "assistant", "content": "Kira asiente despacio."},
        ],
        "character_name": "Kira",
    }, timeout=60)
    assert r.status_code == 200
    assert r.json().get("summary", "").strip() != ""


def test_extract_memories():
    r = requests.post(f"{API}/chat/extract-memories", json={
        "messages": [
            {"role": "user", "content": "Mi nombre es Leo."},
            {"role": "assistant", "content": "Encantada, Leo."},
        ],
        "character_name": "Kira",
        "existing_memories": [],
    }, timeout=60)
    assert r.status_code == 200
    assert isinstance(r.json().get("memories"), list)


def test_emotion():
    r = requests.post(f"{API}/chat/emotion", json={
        "messages": [
            {"role": "user", "content": "Te abrazo con cariño."},
            {"role": "assistant", "content": "Sonríe suavemente."},
        ],
        "character_name": "Kira",
        "current_state": {"trust": 50, "affection": 50, "tension": 30, "fear": 20, "hostility": 20},
    }, timeout=60)
    assert r.status_code == 200
    s = r.json()["state"]
    for k in ("trust", "affection", "tension", "fear", "hostility"):
        assert 0 <= s[k] <= 100


# --------------- Streaming ---------------

def test_stream_content_type_and_deltas():
    payload = {
        "messages": [
            {"role": "system", "content": "Responde en español brevemente."},
            {"role": "user", "content": "Cuenta del 1 al 5."},
        ],
        "max_tokens": 80,
    }
    deltas = []
    saw_done = False
    with requests.post(f"{API}/chat/stream", json=payload, stream=True, timeout=60) as r:
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/event-stream" in ct, f"Bad content-type: {ct}"
        # Cache-Control sanity (Cloudflare may rewrite the value but no-cache stays)
        assert "no-cache" in r.headers.get("cache-control", "").lower()
        # NOTE: X-Accel-Buffering is set by backend but may be stripped by Cloudflare
        # at the public edge. Verified in code at server.py:567. Not asserted here.
        start = time.time()
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data:"):
                data = line[5:].strip()
                if data == "[DONE]":
                    saw_done = True
                    break
                try:
                    obj = json.loads(data)
                    if "delta" in obj:
                        deltas.append(obj["delta"])
                except json.JSONDecodeError:
                    pass
            if time.time() - start > 45:
                break
    assert saw_done, "Stream did not end with [DONE]"
    assert len(deltas) >= 2, f"Expected multiple deltas, got {len(deltas)}"
    full = "".join(deltas)
    assert len(full.strip()) > 0


# --------------- CORS ---------------

def test_cors_github_io_preflight():
    headers = {
        "Origin": "https://test.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    r = requests.options(f"{API}/chat", headers=headers, timeout=15)
    assert r.status_code in (200, 204), f"got {r.status_code}"
    allow = r.headers.get("access-control-allow-origin", "")
    assert allow == "https://test.github.io" or allow == "*", f"allow-origin={allow}"


def test_cors_localhost_preflight():
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    r = requests.options(f"{API}/chat", headers=headers, timeout=15)
    assert r.status_code in (200, 204)
    allow = r.headers.get("access-control-allow-origin", "")
    assert allow in ("http://localhost:3000", "*")
