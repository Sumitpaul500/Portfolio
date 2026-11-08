"""
FastAPI Server for Sumit Paul's AI Recruiter Chatbot.
Hardened with Pydantic validation, safe CORS, rate limiting, and ReAct agent architecture.
"""

import os
import sys
import time
import base64
from pathlib import Path
from typing import Dict, Any

# Starlette 1.x forward compatibility shims for FastAPI
import starlette.middleware
def _compat_middleware_iter(self):
    yield self.cls
    yield self.kwargs
starlette.middleware.Middleware.__iter__ = _compat_middleware_iter

import starlette.routing
_orig_router_init = starlette.routing.Router.__init__
def _compat_router_init(self, *args, on_startup=None, on_shutdown=None, **kwargs):
    return _orig_router_init(self, *args, **kwargs)
starlette.routing.Router.__init__ = _compat_router_init

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Ensure chatbot_backend directory is in sys.path
cur_dir = Path(__file__).resolve().parent
if str(cur_dir) not in sys.path:
    sys.path.insert(0, str(cur_dir))

# Load environment variables securely
root_dir = cur_dir.parent
load_dotenv(root_dir / 'backend' / '.env')
load_dotenv(root_dir / '.env')

from models import ChatRequest, ChatResponse, HealthResponse
from ai_service import process_chat_request
from document_parser import parse_document
from react_agent import ReActAgent

app = FastAPI(
    title="Sumit Paul AI Portfolio Recruiter API",
    description="Intelligent AI portfolio representative for recruiters grounded in verified qualifications.",
    version="2.0.0"
)

# ─── Security: CORS Configuration ─────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://sumitpaul.vercel.app",
    "https://sumitpaul500.github.io"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Public portfolio widget access
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"]
)

# ─── Security: In-Memory Rate Limiting ─────────────────────────────────────────
RATE_LIMIT_STORE: Dict[str, Dict[str, Any]] = {}
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS_PER_WINDOW = 30

@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    # 1. Security Headers
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

    # Rate limiting on /api/chat
    if request.url.path.startswith("/api/chat") and request.method == "POST":
        now = time.time()
        entry = RATE_LIMIT_STORE.get(client_ip)
        if not entry or (now - entry["start_time"]) > RATE_LIMIT_WINDOW:
            RATE_LIMIT_STORE[client_ip] = {"count": 1, "start_time": now}
        else:
            if entry["count"] >= MAX_REQUESTS_PER_WINDOW:
                retry_after = int(entry["start_time"] + RATE_LIMIT_WINDOW - now) + 1
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "success": False,
                        "error": f"Rate limit reached ({MAX_REQUESTS_PER_WINDOW} req/min). Please retry in {retry_after}s."
                    }
                )
            entry["count"] += 1

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# ─── Global Exception Handler (Never Leak Stack Traces) ────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log securely without sensitive payload exposure
    print(f"[Chatbot Error] {exc.__class__.__name__}: {str(exc)}", file=sys.stderr)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "An unexpected error occurred while processing your request. Please try again."
        }
    )

# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
@app.get("/api/health", response_model=HealthResponse)
@app.get("/", response_model=HealthResponse)
def health_check():
    port = int(os.environ.get("CHATBOT_PORT", 5001))
    return {
        "status": "ok",
        "service": "Sumit Paul AI Portfolio Chatbot",
        "framework": "FastAPI + Pydantic + ReAct",
        "port": port
    }

@app.post("/api/chat", response_model=ChatResponse)
@app.post("/chat", response_model=ChatResponse)
@app.post("/", response_model=ChatResponse)
def chat_endpoint(payload: ChatRequest, request: Request):
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "127.0.0.1").split(",")[0].strip()

    job_description_text = payload.jobDescriptionText or ""

    # Process file upload if provided
    if payload.file and payload.file.base64:
        try:
            file_bytes = base64.b64decode(payload.file.base64)
            extracted_text = parse_document(
                file_bytes,
                payload.file.type,
                payload.file.name
            )
            job_description_text = extracted_text
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(val_err)
            )
        except Exception as file_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to parse document: ensure a valid PDF, DOCX, or TXT file."
            )

    message = (payload.message or "").strip()
    if not message and not job_description_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a message or a job description."
        )

    # Convert history into plain dict list
    history_dicts = [{"role": m.role, "content": m.content} for m in payload.history]

    # Process through ReAct AI Service
    result = process_chat_request(
        message=message,
        history=history_dicts,
        custom_skills=payload.customSkills,
        deleted_skills=payload.deletedSkills,
        job_description_text=job_description_text,
        client_ip=client_ip
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=result.get("error", "Request could not be processed.")
        )

    return result

PORT = int(os.environ.get("CHATBOT_PORT", 5001))

if __name__ == '__main__':
    import uvicorn
    print(f"Starting Sumit Paul AI Recruiter Chatbot Server (FastAPI + ReAct) on http://localhost:{PORT}")
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)
