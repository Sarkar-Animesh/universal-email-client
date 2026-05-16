"""FastAPI app entry. Wires logging, CORS, routes, and the health check.

Exposed via `api/index.py` for Vercel's Python runtime.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.routes import ai, auth, mail


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    get_logger(__name__).info("startup", environment=get_settings().environment)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Universal Email Client API",
        description=(
            "Stateless broker for Gmail / Microsoft Graph / IMAP, plus Gemini "
            "ADK-powered AI features. No mail or tokens persisted server-side."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    application.include_router(auth.router)
    application.include_router(mail.router)
    application.include_router(ai.router)

    @application.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.environment}

    return application


app = create_app()
