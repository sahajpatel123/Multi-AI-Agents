"""Application configuration"""

import os
import sys
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet
from pydantic import field_validator
from pydantic_settings import BaseSettings

_WEAK_SECRET_KEYS = {
    "secret",
    "dev",
    "password",
    "changeme",
    "default",
    "your-secret-key",
    "supersecretkey",
    "arena-secret",
    "change-me-in-production-use-a-long-random-string",
}

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Anthropic
    anthropic_api_key: str

    # Grok
    grok_api_key: Optional[str] = None
    openai_api_key: str = ""
    deepseek_api_key: Optional[str] = None

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
    database_url: Optional[str] = DATABASE_URL
    database_url_fallback: Optional[str] = "sqlite:///./arena.db"

    # Auth / JWT
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Encryption (for MCP tokens)
    # Generate: python -c "from cryptography.fernet
    # import Fernet; print(Fernet.generate_key()
    # .decode())"
    encryption_key: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Public frontend URL (shared links, room invites)
    frontend_public_url: str = "http://localhost:5173"
    admin_email: str = ""

    # Rate limits
    guest_daily_limit: int = 5
    registered_daily_limit: int = 7
    pro_window_messages: int = 45
    pro_window_hours: int = 5

    # App
    app_version: str = "1.0.0"

    # Razorpay (subscriptions) — set in .env; optional until you enable billing
    razorpay_api_key: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_plus_monthly_plan_id: str = ""
    razorpay_plus_annual_plan_id: str = ""
    razorpay_pro_monthly_plan_id: str = ""
    razorpay_pro_annual_plan_id: str = ""
    razorpay_agent_addon_plan_id: str = ""

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

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value):
        if value in (None, ""):
            return DATABASE_URL
        if isinstance(value, str) and value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql://", 1)
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins(cls, value):
        if value is None:
            return ""
        if isinstance(value, str):
            parts = [part.strip().rstrip("/") for part in value.split(",") if part.strip()]
            return ",".join(parts)
        return value

    def validate_secrets(self) -> None:
        """Validate that secrets are set and strong. Call once on startup."""
        errors = []
        
        # --- SECRET_KEY ---
        if not self.secret_key:
            errors.append(
                "SECRET_KEY is not set. "
                "Generate one with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
            )
        elif len(self.secret_key) < 32:
            errors.append(
                "SECRET_KEY is too short. Minimum 32 characters required."
            )
        elif self.secret_key.lower() in _WEAK_SECRET_KEYS:
            errors.append(
                "SECRET_KEY is a known default value. "
                "Generate a strong key with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
            )

        # --- DATABASE_URL ---
        if not self.database_url:
            errors.append("DATABASE_URL is not set")
        elif not self.database_url.startswith("postgresql://"):
            errors.append(
                "DATABASE_URL must start with 'postgresql://' for production use. "
                "SQLite is not recommended for production."
            )

        # --- ANTHROPIC_API_KEY ---
        if not self.anthropic_api_key:
            errors.append("ANTHROPIC_API_KEY not set")
        elif not self.anthropic_api_key.startswith("sk-ant-"):
            errors.append(
                "ANTHROPIC_API_KEY must start with 'sk-ant-'. "
                "Current value appears invalid."
            )
        elif (
            self.anthropic_api_key.startswith("sk-ant-your")
            or self.anthropic_api_key == "your-api-key-here"
        ):
            errors.append("ANTHROPIC_API_KEY is a placeholder value")

        # --- OPENAI_API_KEY ---
        # Note: model_router.py gracefully falls back to Claude Sonnet when the
        # OpenAI client is None, so a missing key is non-fatal. We still validate
        # the format if a key is supplied so typos surface immediately.
        if not self.openai_api_key:
            print(
                "[WARNING] OPENAI_API_KEY not set. OpenAI personas "
                "(philosopher, historian, pragmatist, optimist) will fall back to Claude."
            )
        elif not self.openai_api_key.startswith("sk-"):
            errors.append("OPENAI_API_KEY must start with 'sk-'")

        # --- RAZORPAY CREDENTIALS ---
        # These are optional until billing is enabled — _get_razorpay_client()
        # returns 503 when called without keys, so missing values are non-fatal.
        if not self.razorpay_api_key:
            print("[WARNING] RAZORPAY_API_KEY not set. Payment endpoints will return 503.")
        if not self.razorpay_key_secret:
            print("[WARNING] RAZORPAY_KEY_SECRET not set. Payment endpoints will return 503.")
        if not self.razorpay_webhook_secret:
            print("[WARNING] RAZORPAY_WEBHOOK_SECRET not set. Webhooks will be ignored.")

        # --- ENCRYPTION_KEY ---
        if not self.encryption_key:
            errors.append(
                "ENCRYPTION_KEY not set. Generate with: python -c "
                "\"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        elif len(self.encryption_key) != 44:
            errors.append("ENCRYPTION_KEY must be a 44-character Fernet key")
        else:
            try:
                Fernet(self.encryption_key.encode("utf-8"))
            except Exception:
                errors.append("ENCRYPTION_KEY is not a valid Fernet key")

        # --- ENVIRONMENT validation ---
        render_flag = (os.getenv("RENDER") or "").strip().lower()
        render_service_id = (os.getenv("RENDER_SERVICE_ID") or "").strip()
        if (render_flag in {"true", "1"} or render_service_id) and not self.is_production:
            errors.append("ENVIRONMENT must be 'production' on Render")

        # --- CORS validation ---
        origins = self.allowed_origins_list
        if self.is_production and "*" in origins:
            errors.append("ALLOWED_ORIGINS must not contain '*' in production")
        for origin in origins:
            if origin.endswith("/"):
                errors.append(f"ALLOWED_ORIGINS entries must not have trailing slashes: {origin}")

        # Exit if any critical errors
        if errors:
            print("\n" + "="*60)
            print("[SECURITY ERROR] Configuration validation failed:")
            print("="*60)
            for i, err in enumerate(errors, 1):
                print(f"{i}. {err}")
            print("="*60 + "\n")
            sys.exit(1)

    def validate_api_keys(self) -> None:
        """Validate API keys and show warnings for optional ones."""
        optional_keys = {
            "GROK_API_KEY": self.grok_api_key,
            "DEEPSEEK_API_KEY": self.deepseek_api_key,
        }

        for key_name, key_value in optional_keys.items():
            if not key_value:
                print(
                    f"[WARNING] {key_name} not set. Related personas will fall back to Claude."
                )

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
