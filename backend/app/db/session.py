from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


BACKEND_DIR = Path(__file__).resolve().parents[2]


def _resolve_database_url(database_url: str) -> str:
    if not database_url.startswith("sqlite:///") or database_url == "sqlite:///:memory:":
        return database_url

    path_part = database_url.removeprefix("sqlite:///")
    if path_part.startswith("/") or (len(path_part) >= 2 and path_part[1] == ":"):
        return database_url

    db_path = (BACKEND_DIR / path_part).resolve()
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = _resolve_database_url(settings.DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
