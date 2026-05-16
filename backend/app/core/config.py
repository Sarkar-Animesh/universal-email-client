"""Runtime configuration.

All secrets/URLs come from environment variables. Defaults are safe-for-dev
(localhost) but blank for anything that could leak (no default OAuth client
secrets, no default signing key). Validation will fail loud at startup if a
required var is missing in production.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = Field(default="dev", description="dev|preview|production")
    app_url: str = Field(default="http://localhost:3000", description="Frontend origin (CORS).")
    api_url: str = Field(default="http://localhost:8000", description="Backend origin.")

    # OAuth — Gmail
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""

    # OAuth — Microsoft
    microsoft_oauth_client_id: str = ""
    microsoft_oauth_client_secret: str = ""
    microsoft_oauth_tenant: str = "common"

    # Gemini
    gemini_api_key: str = ""
    gemini_summary_model: str = "gemini-2.0-flash"
    gemini_quality_model: str = "gemini-2.5-pro"

    # CSRF / state HMAC. MUST be set in production.
    token_signing_key: str = "dev-only-do-not-use-in-prod-" + "x" * 32

    # CORS allowlist (comma-separated extra origins).
    cors_extra_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        bases = [self.app_url]
        if self.cors_extra_origins:
            bases.extend(o.strip() for o in self.cors_extra_origins.split(",") if o.strip())
        return bases


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
