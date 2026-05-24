from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-this-secret-key-for-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    UPLOAD_DIR: str = "uploads"

    # Quiz AI enhancement settings
    AI_QUIZ_ENABLED: bool = False
    AI_QUIZ_API_KEY: Optional[str] = None
    AI_QUIZ_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    AI_QUIZ_MODEL: str = "gemini-2.5-flash-lite"
    AI_QUIZ_TIMEOUT_SECONDS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()