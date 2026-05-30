from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.schema_compat import ensure_sqlite_schema_compatibility
from app.db.session import engine


Base.metadata.create_all(bind=engine)
ensure_sqlite_schema_compatibility(engine)

app = FastAPI(
    title="Smart Lecture Analysis Auth API",
    description="SQLite 기반 FastAPI 인증 예제",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
