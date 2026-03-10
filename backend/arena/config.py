"""Application configuration"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Anthropic
    anthropic_api_key: str

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

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

    # Rate limits
    guest_daily_limit: int = 5
    registered_daily_limit: int = 20

    # App
    app_version: str = "1.0.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
