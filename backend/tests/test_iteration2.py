"""Iteration 2 tests for DeepSeek roleplay proxy.

Covers new/modified endpoints:
- /api/chat (cut-off auto-continuation)
- /api/chat/regenerate (attempt=1 vs attempt=3 + avoid_phrases)
- /api/chat/continue (advance scene without user msg)
- /api/chat/summarize (recent-weighted)
- /api/chat/extract-memories (with existing)
- /api/chat/emotion (new endpoint, returns 5-key state)
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 90

KIRA_SYSTEM = (
    "You are roleplaying as Kira Vex, a neon-lit hacker in Neo-Sao Paulo 2089. "
    "Short, clipped sentences. Stay in character. Use *asterisks* for action."
)

TERMINAL_RE = re.compile(r'[.!?…»"\'\)\]\*]\s*$')


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- /api/health ----

def test_health(session):
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "ok"
    assert d["model"] == "deepseek-v4-flash"
    assert d["has_key"] is True


# ---- /api/chat: full response (no mid-sentence cut) ----

def test_chat_response_completes(session):
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "Tell me one short story about your last night job."},
        ],
        "temperature": 0.8,
        "max_tokens": 220,
    }
    r = session.post(f"{API}/chat", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    content = d["content"].strip()
    assert len(content) > 10
    # After auto-continue logic should end with terminal punctuation / asterisk / quote
    assert TERMINAL_RE.search(content), f"Response appears cut off: ...{content[-60:]!r}"
    # Asterisks must be balanced (action delimiters)
    assert content.count("*") % 2 == 0, "Unbalanced *action* asterisks"
    pytest.first_reply = content


# ---- /api/chat/regenerate attempt=1 ----

def test_regen_attempt_1(session):
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "Tell me one short story about your last night job."},
        ],
        "temperature": 0.85,
        "max_tokens": 220,
        "attempt": 1,
    }
    r = session.post(f"{API}/chat/regenerate", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("attempt") == 1
    assert isinstance(d["content"], str)
    assert len(d["content"].strip()) > 10
    pytest.regen_1 = d["content"]


# ---- /api/chat/regenerate attempt=3 with avoid_phrases ----

def test_regen_attempt_3_differs(session):
    prior = [getattr(pytest, "first_reply", ""), getattr(pytest, "regen_1", "")]
    prior = [p for p in prior if p]
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "Tell me one short story about your last night job."},
        ],
        "temperature": 0.85,
        "max_tokens": 220,
        "attempt": 3,
        "avoid_phrases": prior,
    }
    r = session.post(f"{API}/chat/regenerate", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("attempt") == 3
    content = d["content"].strip()
    assert len(content) > 10
    # First 30 chars should not be a direct prefix match of any prior reply.
    for p in prior:
        assert content[:30].lower() != p.strip()[:30].lower(), \
            f"Attempt=3 reply has same opening as a prior version: {content[:60]!r}"


# ---- /api/chat/continue ----

def test_chat_continue(session):
    prior_assistant = "*Kira leans back against the railing, cigarette glowing in the dark.* Spit it out."
    payload = {
        "messages": [
            {"role": "system", "content": KIRA_SYSTEM},
            {"role": "user", "content": "We need to talk about the buyer."},
            {"role": "assistant", "content": prior_assistant},
        ],
        "temperature": 0.85,
        "max_tokens": 220,
    }
    r = session.post(f"{API}/chat/continue", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    cont = r.json()["content"].strip()
    assert len(cont) > 5
    # Must not be an exact repeat of prior
    assert cont != prior_assistant
    # Should not start with the same first 30 chars
    assert cont[:30].lower() != prior_assistant[:30].lower()


# ---- /api/chat/summarize: recent-weighted ----

def test_summarize_recent_weighted(session):
    payload = {
        "messages": [
            {"role": "user", "content": "Old: We agreed to meet at the docks last week."},
            {"role": "assistant", "content": "*Kira nods absently.* Old news."},
            {"role": "user", "content": "I just shot the buyer. He's dead in the alley."},
            {"role": "assistant", "content": "*Her face goes pale.* You did WHAT? We need to move. Now."},
        ],
        "character_name": "Kira Vex",
        "previous_summary": "User and Kira agreed to meet at the docks.",
    }
    r = session.post(f"{API}/chat/summarize", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    summary = r.json()["summary"].lower()
    assert len(summary) > 40
    # Most recent event was a shooting — should be reflected
    assert ("shot" in summary or "dead" in summary or "kill" in summary or "buyer" in summary), \
        f"Summary did not capture recent event: {summary!r}"


# ---- /api/chat/extract-memories: dedupe ----

def test_extract_memories_dedupe(session):
    payload = {
        "messages": [
            {"role": "user", "content": "Reminding you again, my name is Alex."},
            {"role": "assistant", "content": "*she sighs.* I remember, Alex."},
        ],
        "character_name": "Kira Vex",
        "existing_memories": ["User's name is Alex", "User is afraid of heights"],
    }
    r = session.post(f"{API}/chat/extract-memories", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    mems = r.json()["memories"]
    assert isinstance(mems, list)
    # None of the returned memories should be near-duplicates of existing facts
    for m in mems:
        low = m.lower()
        assert not (("alex" in low) and ("name" in low)), f"Duplicate name memory: {m}"


def test_extract_memories_new(session):
    payload = {
        "messages": [
            {"role": "user", "content": "My name is Alex, I have a sister named Mira, and I'm allergic to penicillin."},
            {"role": "assistant", "content": "*Kira notes it.* Three things in one breath. Bold."},
        ],
        "character_name": "Kira Vex",
        "existing_memories": [],
    }
    r = session.post(f"{API}/chat/extract-memories", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    mems = r.json()["memories"]
    assert isinstance(mems, list)
    assert len(mems) >= 1


# ---- /api/chat/emotion ----

def test_emotion_state_shape(session):
    payload = {
        "messages": [
            {"role": "user", "content": "I just saved your life back there."},
            {"role": "assistant", "content": "*Kira swallows hard, eyes wet.* ...thank you. I won't forget that."},
        ],
        "character_name": "Kira Vex",
        "current_state": {"trust": 40, "affection": 35, "tension": 60, "fear": 30, "hostility": 25},
    }
    r = session.post(f"{API}/chat/emotion", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    state = r.json()["state"]
    for k in ("trust", "affection", "tension", "fear", "hostility"):
        assert k in state, f"Missing key: {k}"
        assert isinstance(state[k], int)
        assert 0 <= state[k] <= 100


def test_emotion_state_moves_for_intimacy(session):
    """A confession/gratitude beat should raise trust or affection."""
    current = {"trust": 30, "affection": 25, "tension": 40, "fear": 20, "hostility": 15}
    payload = {
        "messages": [
            {"role": "user", "content": "I just saved your life back there."},
            {"role": "assistant", "content": "*Kira swallows hard.* ...thank you. I owe you."},
        ],
        "character_name": "Kira Vex",
        "current_state": current,
    }
    r = session.post(f"{API}/chat/emotion", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200
    new_state = r.json()["state"]
    # Trust OR affection should rise (or at least not collapse).
    assert (new_state["trust"] >= current["trust"]) or (new_state["affection"] >= current["affection"]), \
        f"Expected trust/affection to rise after rescue beat: {new_state}"


def test_emotion_invalid_payload(session):
    r = session.post(f"{API}/chat/emotion", json={"messages": "x"}, timeout=15)
    assert r.status_code == 422
