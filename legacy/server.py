import logging
import os
import json
from pathlib import Path
from typing import List
from pydantic import BaseModel
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("knotzaxxon-server")

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        # Hardening: Security Headers
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self';"
        )
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app = FastAPI(title="KnotzAxxon Backend", version="1.0.0")

# Leaderboard Persistence
SCORE_FILE = Path("scores.json")

class ScoreEntry(BaseModel):
    name: str
    score: int

def load_scores() -> List[dict]:
    if SCORE_FILE.exists():
        try:
            with open(SCORE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_scores(scores: List[dict]):
    with open(SCORE_FILE, "w") as f:
        json.dump(scores, f, indent=4)

# Middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "game": "KnotzAxxon"}

@app.get("/scores")
async def get_scores():
    scores = load_scores()
    # Sort by score descending and take top 10
    sorted_scores = sorted(scores, key=lambda x: x["score"], reverse=True)[:10]
    return sorted_scores

@app.post("/scores")
async def add_score(entry: ScoreEntry):
    scores = load_scores()
    scores.append(entry.model_dump())
    save_scores(scores)
    return {"status": "success"}

# Static file serving
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting KnotzAxxon Hardened Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
