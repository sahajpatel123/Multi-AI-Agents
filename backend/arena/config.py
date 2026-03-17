"""Application configuration"""

import os
import sys
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings

_WEAK_SECRET_KEYS = {
    "secret",
    "password",
    "changeme",
    "default",
    "your-secret-key",
    "supersecretkey",
    "arena-secret",
    "change-me-in-production-use-a-long-random-string",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Anthropic
    anthropic_api_key: str

    # Grok
    grok_api_key: Optional[str] = None

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Environment
    environment: str = "development"

    # LLM
    default_model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 1024
    timeout_seconds: int = 30

    # Database
    database_url: Optional[str] = None
    database_url_fallback: Optional[str] = "sqlite:///./arena.db"

    # Auth / JWT
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # CORS
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Rate limits
    guest_daily_limit: int = 5
    registered_daily_limit: int = 7
    pro_window_messages: int = 45
    pro_window_hours: int = 5

    # App
    app_version: str = "1.0.0"

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on", "debug"}:
                return True
            if normalized in {"false", "0", "no", "off", "release", "prod", "production"}:
                return False
        return value

    def validate_secrets(self) -> None:
        """Validate that secrets are set and strong. Call once on startup."""
        # --- SECRET_KEY ---
        if not self.secret_key:
            print(
                "[SECURITY ERROR] SECRET_KEY is not set. "
                "Generate one with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
            )
            sys.exit(1)

        if len(self.secret_key) < 32:
            print(
                "[SECURITY ERROR] SECRET_KEY is too short. "
                "Minimum 32 characters required."
            )
            sys.exit(1)

        if self.secret_key.lower() in _WEAK_SECRET_KEYS:
            print(
                "[SECURITY ERROR] SECRET_KEY is a known default value. "
                "Generate a strong key with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
            )
            sys.exit(1)

        # --- ANTHROPIC_API_KEY ---
        if not self.anthropic_api_key:
            print("[SECURITY ERROR] ANTHROPIC_API_KEY not set")
            sys.exit(1)

        if (
            self.anthropic_api_key.startswith("sk-ant-your")
            or self.anthropic_api_key == "your-api-key-here"
        ):
            print("[SECURITY ERROR] ANTHROPIC_API_KEY is a placeholder value")
            sys.exit(1)

        # --- GROK_API_KEY (optional, warn only) ---
        if not self.grok_api_key:
            print("[WARNING] GROK_API_KEY not set. Grok personas will fall back to Claude.")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()