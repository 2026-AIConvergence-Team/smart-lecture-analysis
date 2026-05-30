from typing import Optional
import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-this-secret-key-for-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://smart-lecture-analysis.vercel.app",
    ]

    UPLOAD_DIR: str = "uploads"

    AI_QUIZ_ENABLED: bool = False
    AI_QUIZ_PROVIDER: str = "groq"

    AI_QUIZ_API_KEY: Optional[str] = None
    AI_QUIZ_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_QUIZ_MODEL: str = "openai/gpt-oss-20b"

    GEMINI_API_KEY: Optional[str] = None
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"

    GROQ_API_KEY: Optional[str] = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-20b"

    IMAGE_DESCRIPTION_ENABLED: bool = False
    IMAGE_DESCRIPTION_MAX_TOKENS: int = 512

    AI_QUIZ_TIMEOUT_SECONDS: int = 30
    AI_QUIZ_MAX_TOKENS: Optional[int] = 2048

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, list):
            return value

        if isinstance(value, str):
            value = value.strip()

            if value.startswith("["):
                return json.loads(value)

            return [origin.strip() for origin in value.split(",") if origin.strip()]

        return value


settings = Settings()