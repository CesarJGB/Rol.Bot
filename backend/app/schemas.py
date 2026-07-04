from pydantic import BaseModel
from typing import List, Optional, Dict

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.85
    max_tokens: Optional[int] = 800
    presence_penalty: Optional[float] = 0.7
    frequency_penalty: Optional[float] = 0.45
    top_p: Optional[float] = 0.95
    n: Optional[int] = 1
    stop: Optional[List[str]] = None
    attempt: Optional[int] = 1
    avoid_phrases: Optional[List[str]] = None

class ContinueRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.85
    max_tokens: Optional[int] = 800
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

class CompressRequest(BaseModel):
    text: str

class AutoFillRequest(BaseModel):
    base_description: str
    initial_message: Optional[str] = ""
