from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-this-secret-key-for-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    UPLOAD_DIR: str = "uploads"

    # Quiz generation AI settings
    AI_QUIZ_ENABLED: bool = False

    # Default provider; individual requests can override this value.
    AI_QUIZ_PROVIDER: str = "groq"

    # Legacy AI_QUIZ_* keys are kept for existing .env files.
    AI_QUIZ_API_KEY: Optional[str] = None
    AI_QUIZ_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_QUIZ_MODEL: str = "openai/gpt-oss-20b"

    # Gemini provider settings
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"

    # Groq provider settings
    GROQ_API_KEY: Optional[str] = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-20b"

    # Image description AI settings
    IMAGE_DESCRIPTION_ENABLED: bool = False
    IMAGE_DESCRIPTION_MAX_TOKENS: int = 512

    AI_QUIZ_TIMEOUT_SECONDS: int = 30
    AI_QUIZ_MAX_TOKENS: Optional[int] = 2048

    class Config:
        env_file = ".env"


settings = Settings()