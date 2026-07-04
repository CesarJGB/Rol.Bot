from fastapi import HTTPException
from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
import httpx
from typing import Dict, Any

class DeepSeekClient:
    def __init__(self):
        self.client: httpx.AsyncClient = None

    def start(self):
        # Creamos un Pool de conexiones persistentes optimizado para alta concurrencia
        self.client = httpx.AsyncClient(
            base_url=DEEPSEEK_BASE_URL,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json"
            },
            timeout=httpx.Timeout(90.0, connect=10.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)
        )

    async def stop(self):
        if self.client:
            await self.client.aclose()

    async def post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not DEEPSEEK_API_KEY:
            raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")
        
        try:
            resp = await self.client.post(endpoint, json=payload)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"DeepSeek network error: {e}")

        # Mantengo tus logs de debug activos
        print(f"\n--- [DEBUG CALL: {endpoint}] ---")
        print("STATUS:", resp.status_code)
        print("-------------------------------\n")

        if resp.status_code >= 400:
            try:
                err = resp.json()
            except Exception:
                err = {"raw": resp.text}
            raise HTTPException(status_code=resp.status_code, detail={"deepseek": err})

        try:
            return resp.json()
        except Exception:
            raise HTTPException(status_code=500, detail=f"Invalid JSON: {resp.text}")

# Instancia global del gestor del cliente
deepseek_agent = DeepSeekClient()
