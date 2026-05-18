"""Backend tests for DeepSeek roleplay proxy.

Covers: /api/health, /api/chat, /api/chat/regenerate, /api/chat/summarize,
/api/chat/extract-memories. The DeepSeek API is real, so we use generous timeouts.
"""
import os
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://deepseek-roleplay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Long timeout because DeepSeek can take 10-25s
TIMEOUT = 90

KIRA_SYSTEM = (
    "You are roleplaying as Kira Vex, a neon-lit hacker in Neo-Sao Paulo 2089. "
    "Short, clipped sentences. Stay in character. Use *asterisks* for action."
)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- Health ----

def test_health(session):
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"
    assert data["model"] == "deepseek-v4-flash"
    assert data["has_key"] is True


def test_root(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json()["model"] == "deepseek-v4-flash"


# ---- /api/chat ----

def test_chat_basic(session):
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "Hey Kira. Got a name for me?"},
        ],
        "temperature": 0.85,
        "max_tokens": 200,
    }
    r = session.post(f"{API}/chat", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "content" in data
    assert isinstance(data["content"], str)
    assert len(data["content"].strip()) > 10
    # store globally for next test
    pytest.kira_first_reply = data["content"]


def test_chat_invalid_payload(session):
    r = session.post(f"{API}/chat", json={"messages": "not-a-list"}, timeout=15)
    assert r.status_code == 422


# ---- /api/chat/regenerate ----

def test_chat_regenerate_differs(session):
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "Hey Kira. Got a name for me?"},
        ],
        "temperature": 0.85,
        "max_tokens": 200,
    }
    r = session.post(f"{API}/chat/regenerate", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "content" in data
    assert isinstance(data["content"], str)
    assert len(data["content"].strip()) > 5
    # Ideally different from previous chat reply
    first = getattr(pytest, "kira_first_reply", "")
    if first:
        # not a hard assertion since LLMs can sometimes echo, but flag if identical
        assert data["content"].strip() != first.strip(), "Regenerate returned identical text"


# ---- /api/chat/summarize ----

def test_chat_summarize(session):
    payload = {
        "messages": [
            {"role": "user", "content": "I came back to give you the data drive."},
            {"role": "assistant", "content": "*Kira raises an eyebrow.* You actually came back. Hand it over."},
            {"role": "user", "content": "I want a name for the buyer first."},
            {"role": "assistant", "content": "*she sighs and types something.* Fine. Mendez. Don't say it twice."},
        ],
        "character_name": "Kira Vex",
        "previous_summary": "",
    }
    r = session.post(f"{API}/chat/summarize", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "summary" in data
    summary = data["summary"]
    assert isinstance(summary, str)
    # Expect a coherent paragraph; loosely, more than 40 chars and contains period
    assert len(summary) > 40, f"Summary too short: {summary!r}"
    assert "." in summary


# ---- /api/chat/extract-memories ----

def test_extract_memories(session):
    payload = {
        "messages": [
            {"role": "user", "content": "My name is Alex. I'm afraid of heights."},
            {"role": "assistant", "content": "*Kira files that away.* Alex. Noted. The fear thing too."},
            {"role": "user", "content": "I'm hunting the man who killed my sister, Mira."},
            {"role": "assistant", "content": "*she goes still.* You should have led with that."},
        ],
        "character_name": "Kira Vex",
        "existing_memories": [],
    }
    r = session.post(f"{API}/chat/extract-memories", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "memories" in data
    mems = data["memories"]
    assert isinstance(mems, list)
    # Expect at least 1 memory captured (name / fear / sister)
    assert len(mems) >= 1, f"No memories extracted: {data}"
    for m in mems:
        assert isinstance(m, str)
        assert len(m) > 0


def test_extract_memories_dedup(session):
    """Pass existing memories, ensure they aren't duplicated."""
    payload = {
        "messages": [
            {"role": "user", "content": "Just reminding you, my name is Alex."},
            {"role": "assistant", "content": "*she rolls her eyes.* Yes, Alex. I remember."},
        ],
        "character_name": "Kira Vex",
        "existing_memories": ["User's name is Alex"],
    }
    r = session.post(f"{API}/chat/extract-memories", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    mems = r.json()["memories"]
    assert isinstance(mems, list)
    # any memory returned should NOT be identical to existing
    for m in mems:
        assert "alex" not in m.lower() or "name" not in m.lower(), f"Duplicate memory: {m}"
