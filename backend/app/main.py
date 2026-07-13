from fastapi import FastAPI, APIRouter
from contextlib import asynccontextmanager
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from app.config import DEEPSEEK_MODEL, CORS_ORIGINS, DEEPSEEK_API_KEY
from app.core.client import deepseek_agent
from app.routers import chat, utility

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Al encender el servidor: Arranca el pool de conexiones HTTPX
    deepseek_agent.start()
    yield
    # Al apagar el servidor: Cierra las conexiones de forma segura
    await deepseek_agent.stop()

app = FastAPI(title="Roleplay AI Proxy (Optimized)", lifespan=lifespan)

# Enrutador base de la API API
api_router = APIRouter(prefix="/api")
api_router.include_router(chat.router)
api_router.include_router(utility.router)

@api_router.get("/")
async def root():
    return {"status": "ok", "model": DEEPSEEK_MODEL}

@api_router.get("/health")
async def health():
    return {"status": "ok", "model": DEEPSEEK_MODEL, "has_key": bool(DEEPSEEK_API_KEY)}

app.include_router(api_router)

# --- Configuración Dinámica de CORS ---
_raw_origins = CORS_ORIGINS
_origins_list = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_allow_all = "*" in _origins_list
_dev_origins = ["http://localhost:3000", "[http://127.0.0.1:3000](http://127.0.0.1:3000)", "http://localhost:5173", "[http://127.0.0.1:5173](http://127.0.0.1:5173)"]

for o in _dev_origins:
    if o not in _origins_list: 
        _origins_list.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"] if _allow_all else _origins_list,
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)*github\.io",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
