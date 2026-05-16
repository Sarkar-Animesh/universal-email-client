"""Vercel Python entry point.

Vercel routes all requests to this file (see ../vercel.json). We re-export the
FastAPI ASGI app declared in `app.main`; Vercel's Python runtime detects the
`app` variable and invokes it as an ASGI handler.
"""
from app.main import app  # noqa: F401  (re-exported for Vercel)
